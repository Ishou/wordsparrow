package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.OutboundEmail
import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.application.ports.OutboundEmailStore
import org.slf4j.LoggerFactory

/** Counters from one drain pass; the worker logs them as its run summary. */
data class DrainSummary(
    val claimed: Int,
    val sent: Int,
    val deferred: Int,
    val undeliverable: Int,
)

/** Retry-drains the outbox (ADR-0094): claims due pending rows, resolves the address at send time, sends via the same [EmailSender], and on failure backs off — giving up into a terminal `failed` + a `billing_email_undeliverable` alert-log (ADR-0032 symptom) after [EmailRetryPolicy.MAX_ATTEMPTS]. Guarantees eventual delivery of the legally-mandated durable-medium emails. */
class DrainEmailOutbox(
    private val store: OutboundEmailStore,
    private val emailSender: EmailSender,
    private val resolver: SubscriberEmailResolver,
    private val clock: Clock,
    private val batchSize: Int = DEFAULT_BATCH_SIZE,
) {
    private val log = LoggerFactory.getLogger(DrainEmailOutbox::class.java)

    suspend fun execute(): DrainSummary {
        val now = clock.now()
        val due = store.claimDue(now, batchSize)
        var sent = 0
        var deferred = 0
        var undeliverable = 0
        for (row in due) {
            val to = resolver.resolve(row.userId)
            if (to == null) {
                if (fail(row, "no_resolvable_address")) undeliverable++ else deferred++
                continue
            }
            val outcome =
                runCatching { emailSender.send(OutboundEmail(to, row.subject, row.htmlBody, row.textBody)) }
            outcome
                .onSuccess {
                    store.markSent(row.id, clock.now())
                    sent++
                }.onFailure { error ->
                    if (fail(row, error.message ?: error.javaClass.simpleName)) undeliverable++ else deferred++
                }
        }
        log.info(
            "event=billing_drain_email_outbox_summary claimed={} sent={} deferred={} undeliverable={}",
            due.size,
            sent,
            deferred,
            undeliverable,
        )
        return DrainSummary(due.size, sent, deferred, undeliverable)
    }

    // Returns true when the row hit the terminal `failed` state (alert-logged), false when it stays pending for another retry.
    private suspend fun fail(
        row: OutboundEmailRecord,
        error: String,
    ): Boolean {
        val attempts = row.attempts + 1
        if (EmailRetryPolicy.isExhausted(attempts)) {
            store.markFailed(row.id, error)
            log.error(
                "billing_email_undeliverable kind={} user_id={} attempts={} last_error=\"{}\"",
                row.kind.wire,
                row.userId,
                attempts,
                error,
            )
            return true
        }
        store.recordFailure(row.id, attempts, clock.now().plus(EmailRetryPolicy.backoffAfter(attempts)), error)
        return false
    }

    private companion object {
        const val DEFAULT_BATCH_SIZE = 100
    }
}
