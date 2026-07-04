package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThan
import assertk.assertions.isNotNull
import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeConsentRepository
import com.bliss.billing.application.testdoubles.FakeEmailSender
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.InMemoryOutboundEmailStore
import com.bliss.billing.domain.OutboundEmailKind
import com.bliss.billing.domain.OutboundEmailStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class DrainEmailOutboxTest {
    private val now = Instant.parse("2026-07-04T10:00:00Z")
    private val userId = UUID.randomUUID()

    private val store = InMemoryOutboundEmailStore()
    private val sender = FakeEmailSender()
    private val consents = FakeConsentRepository()
    private val provider = FakeBillingProvider().apply { defaultCustomerEmail = "joueuse@example.com" }
    private val clock = FixedClock(now)
    private val drain = DrainEmailOutbox(store, sender, SubscriberEmailResolver(consents, provider), clock)

    private fun row(
        kind: OutboundEmailKind = OutboundEmailKind.CONTRACT,
        attempts: Int = 0,
        nextAttemptAt: Instant? = now,
        status: OutboundEmailStatus = OutboundEmailStatus.PENDING,
    ) = OutboundEmailRecord(
        id = UUID.randomUUID(),
        userId = userId,
        kind = kind,
        dedupeKey = "${kind.wire}:$userId:${UUID.randomUUID()}",
        subject = "Sujet",
        htmlBody = "<p>corps</p>",
        textBody = "corps",
        status = status,
        attempts = attempts,
        nextAttemptAt = nextAttemptAt,
        lastError = null,
        createdAt = now,
        sentAt = null,
    )

    @Test
    fun `sends a due pending row and marks it sent`() =
        runTest {
            store.enqueue(row())

            val summary = drain.execute()

            assertThat(summary.sent).isEqualTo(1)
            assertThat(sender.sent).hasSize(1)
            assertThat(store.rows.single().status).isEqualTo(OutboundEmailStatus.SENT)
            assertThat(store.rows.single().sentAt).isEqualTo(now)
        }

    @Test
    fun `does not claim a row whose next attempt is in the future`() =
        runTest {
            store.enqueue(row(nextAttemptAt = now.plusSeconds(600)))

            val summary = drain.execute()

            assertThat(summary.claimed).isEqualTo(0)
            assertThat(store.rows.single().status).isEqualTo(OutboundEmailStatus.PENDING)
        }

    @Test
    fun `a send failure increments attempts and backs off, staying pending`() =
        runTest {
            store.enqueue(row(attempts = 2))
            sender.failAlways = true

            val summary = drain.execute()

            assertThat(summary.deferred).isEqualTo(1)
            val updated = store.rows.single()
            assertThat(updated.status).isEqualTo(OutboundEmailStatus.PENDING)
            assertThat(updated.attempts).isEqualTo(3)
            assertThat(updated.nextAttemptAt).isEqualTo(now.plus(EmailRetryPolicy.backoffAfter(3)))
            assertThat(updated.lastError).isNotNull()
        }

    @Test
    fun `an unresolvable address defers the row without sending`() =
        runTest {
            provider.setCustomerEmail(userId, null)
            store.enqueue(row())

            val summary = drain.execute()

            assertThat(summary.deferred).isEqualTo(1)
            val updated = store.rows.single()
            assertThat(updated.status).isEqualTo(OutboundEmailStatus.PENDING)
            assertThat(updated.attempts).isEqualTo(1)
        }

    @Test
    fun `the final attempt marks the row undeliverable`() =
        runTest {
            store.enqueue(row(attempts = EmailRetryPolicy.MAX_ATTEMPTS - 1))
            sender.failAlways = true

            val summary = drain.execute()

            assertThat(summary.undeliverable).isEqualTo(1)
            val updated = store.rows.single()
            assertThat(updated.status).isEqualTo(OutboundEmailStatus.FAILED)
            assertThat(updated.nextAttemptAt).isEqualTo(null)
        }

    @Test
    fun `does nothing when the outbox has no due rows`() =
        runTest {
            val summary = drain.execute()

            assertThat(summary.claimed).isEqualTo(0)
            assertThat(summary.sent).isEqualTo(0)
        }

    @Test
    fun `covers all four kinds in one pass`() =
        runTest {
            store.enqueue(row(kind = OutboundEmailKind.CONTRACT))
            store.enqueue(row(kind = OutboundEmailKind.RENEWAL))
            store.enqueue(row(kind = OutboundEmailKind.CANCEL))
            store.enqueue(row(kind = OutboundEmailKind.CHATEL))

            val summary = drain.execute()

            assertThat(summary.sent).isEqualTo(4)
        }

    @Test
    fun `backoff is exponential up to the six hour cap`() {
        assertThat(EmailRetryPolicy.backoffAfter(2)).isEqualTo(EmailRetryPolicy.BASE_DELAY.multipliedBy(2))
        assertThat(EmailRetryPolicy.backoffAfter(EmailRetryPolicy.MAX_ATTEMPTS)).isEqualTo(EmailRetryPolicy.MAX_DELAY)
        assertThat(EmailRetryPolicy.MAX_DELAY).isGreaterThan(EmailRetryPolicy.backoffAfter(3))
    }
}
