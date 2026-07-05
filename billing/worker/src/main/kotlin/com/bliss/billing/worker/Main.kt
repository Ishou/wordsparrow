package com.bliss.billing.worker

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.OfferPrice
import com.bliss.billing.application.ports.OutboundEmailStore
import com.bliss.billing.application.ports.RenewalNoticeLedger
import com.bliss.billing.application.ports.SubscriptionOffer
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.application.usecases.DrainEmailOutbox
import com.bliss.billing.application.usecases.ExpireLapsedCancellations
import com.bliss.billing.application.usecases.LegalEmailNotifier
import com.bliss.billing.application.usecases.NoOpContractConfirmationNotifier
import com.bliss.billing.application.usecases.ReconcileSubscriptions
import com.bliss.billing.application.usecases.SendRenewalNotices
import com.bliss.billing.application.usecases.SubscriberEmailResolver
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.ChatelWindow
import com.bliss.billing.infrastructure.email.BillingBrevoConfig
import com.bliss.billing.infrastructure.email.BillingBrevoEmailSender
import com.bliss.billing.infrastructure.nats.NatsSubscriptionPublisher
import com.bliss.billing.infrastructure.persistence.BillingDatabase
import com.bliss.billing.infrastructure.persistence.PostgresConsentRepository
import com.bliss.billing.infrastructure.persistence.PostgresMollieCustomerStore
import com.bliss.billing.infrastructure.persistence.PostgresOutboundEmailStore
import com.bliss.billing.infrastructure.persistence.PostgresRenewalNoticeLedger
import com.bliss.billing.infrastructure.persistence.PostgresSubscriptionRepository
import com.bliss.billing.infrastructure.provider.MollieBillingAdapter
import com.bliss.billing.infrastructure.provider.MollieConfig
import com.bliss.billing.infrastructure.provider.SdkMollieClient
import com.fasterxml.uuid.Generators
import io.ktor.client.engine.cio.CIO
import io.nats.client.Nats
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.system.exitProcess

private val log = LoggerFactory.getLogger("com.bliss.billing.worker.Main")

fun main(args: Array<String>) {
    MDC.put("run_id", UUID.randomUUID().toString())
    val exit =
        when {
            args.contains("--help") || args.contains("-h") -> {
                printUsage()
                0
            }
            args.contains("--send-renewal-notices") -> runSendRenewalNotices()
            args.contains("--drain-email-outbox") -> runDrainEmailOutbox()
            args.contains("--expire-lapsed-cancellations") -> runExpireLapsedCancellations()
            args.isEmpty() || args.contains("--reconcile") -> runReconcile()
            else -> {
                log.error("event=worker_unknown_arguments args=\"{}\"", args.joinToString(separator = " "))
                printUsage()
                1
            }
        }
    exitProcess(exit)
}

private fun printUsage() {
    log.info(
        "usage: billing-worker [--reconcile] | [--send-renewal-notices] | [--drain-email-outbox] | [--expire-lapsed-cancellations] | --help",
    )
}

private fun runReconcile(): Int {
    val database = BillingDatabase(poolName = "billing-worker", maxPoolSize = 2, requireUrl = true).apply { start() }
    return try {
        val dataSource = database.dataSource() ?: error("BILLING_DATABASE_URL produced a null DataSource")
        val config = MollieConfig.fromEnv()
        val provider = MollieBillingAdapter(SdkMollieClient(config), PostgresMollieCustomerStore(dataSource), config)
        reconcileAndExit(provider, PostgresSubscriptionRepository(dataSource), Clock { Instant.now() }, agingThreshold())
    } finally {
        database.stop()
    }
}

private fun runSendRenewalNotices(): Int {
    val database = BillingDatabase(poolName = "billing-worker", maxPoolSize = 2, requireUrl = true).apply { start() }
    return try {
        val dataSource = database.dataSource() ?: error("BILLING_DATABASE_URL produced a null DataSource")
        val config = MollieConfig.fromEnv()
        val provider = MollieBillingAdapter(SdkMollieClient(config), PostgresMollieCustomerStore(dataSource), config)
        sendRenewalNoticesAndExit(
            PostgresSubscriptionRepository(dataSource),
            provider,
            renewalNotifier(dataSource, provider, config),
            PostgresRenewalNoticeLedger(dataSource),
            Clock { Instant.now() },
            chatelWindow(),
        )
    } finally {
        database.stop()
    }
}

// Dark unless BILLING_EMAIL_ENABLED=true with a Brevo key; otherwise the drain is a no-op (nothing is enqueued while email is off, so there is nothing to deliver).
private fun runDrainEmailOutbox(): Int {
    val brevo = brevoConfigOrNull()
    if (brevo == null) {
        log.info("event=billing_drain_email_outbox_disabled")
        return 0
    }
    val database = BillingDatabase(poolName = "billing-worker", maxPoolSize = 2, requireUrl = true).apply { start() }
    return try {
        val dataSource = database.dataSource() ?: error("BILLING_DATABASE_URL produced a null DataSource")
        val config = MollieConfig.fromEnv()
        val provider = MollieBillingAdapter(SdkMollieClient(config), PostgresMollieCustomerStore(dataSource), config)
        drainEmailOutboxAndExit(
            PostgresOutboundEmailStore(dataSource),
            BillingBrevoEmailSender(CIO.create(), brevo),
            SubscriberEmailResolver(PostgresConsentRepository(dataSource), provider),
            Clock { Instant.now() },
        )
    } finally {
        database.stop()
    }
}

// Expiry sweep: needs only the DB + NATS (no Mollie provider); publishes SubscriptionChanged(status=expired) so identity drops entitlement at period_end.
private fun runExpireLapsedCancellations(): Int {
    val database = BillingDatabase(poolName = "billing-worker", maxPoolSize = 2, requireUrl = true).apply { start() }
    val natsConnection = Nats.connect(natsUrl())
    return try {
        val dataSource = database.dataSource() ?: error("BILLING_DATABASE_URL produced a null DataSource")
        val publisher = NatsSubscriptionPublisher(natsConnection.jetStream())
        val eventIds = EventIdGenerator { Generators.timeBasedEpochGenerator().generate() }
        val exit =
            expireLapsedCancellationsAndExit(PostgresSubscriptionRepository(dataSource), publisher, Clock { Instant.now() }, eventIds)
        // Async publishes must reach the server before this short-lived Job exits, or the expiry events are lost.
        natsConnection.flush(Duration.ofSeconds(5))
        exit
    } finally {
        natsConnection.close()
        database.stop()
    }
}

private fun natsUrl(): String = System.getenv("NATS_URL") ?: "nats://bliss-nats.wordsparrow:4222"

private fun agingThreshold(): Duration = Duration.ofHours(System.getenv("BILLING_RECONCILE_AGING_HOURS")?.toLongOrNull() ?: 24L)

private fun chatelWindow(): ChatelWindow {
    val minDays = System.getenv("BILLING_CHATEL_MIN_DAYS")?.toLongOrNull()
    val maxDays = System.getenv("BILLING_CHATEL_MAX_DAYS")?.toLongOrNull()
    return if (minDays == null && maxDays == null) {
        ChatelWindow.DEFAULT
    } else {
        ChatelWindow(Duration.ofDays(minDays ?: 30L), Duration.ofDays(maxDays ?: 60L))
    }
}

// Recurring prices come from the same env as the Mollie charge so the notice can never misstate what will be billed (ADR-0094 §3).
private fun offerFor(config: MollieConfig): SubscriptionOffer {
    val toMinorUnits: (String) -> Long = { it.toBigDecimal().movePointRight(2).toLong() }
    return SubscriptionOffer(
        mapOf(
            Cadence.MONTHLY to OfferPrice(toMinorUnits(config.subscriptionAmountFor(Cadence.MONTHLY)), config.currency),
            Cadence.YEARLY to OfferPrice(toMinorUnits(config.subscriptionAmountFor(Cadence.YEARLY)), config.currency),
        ),
    )
}

// Dark unless BILLING_EMAIL_ENABLED=true with a Brevo key present; otherwise the no-op notifier logs and sends nothing (ADR-0094 §2).
private fun renewalNotifier(
    dataSource: DataSource,
    provider: BillingProviderPort,
    config: MollieConfig,
): ContractConfirmationNotifier {
    val brevo = brevoConfigOrNull()
    return if (brevo == null) {
        NoOpContractConfirmationNotifier()
    } else {
        val consents = PostgresConsentRepository(dataSource)
        LegalEmailNotifier(
            PostgresOutboundEmailStore(dataSource),
            BillingBrevoEmailSender(CIO.create(), brevo),
            SubscriberEmailResolver(consents, provider),
            consents,
            offerFor(config),
            Clock { Instant.now() },
        )
    }
}

private fun brevoConfigOrNull(): BillingBrevoConfig? = resolveBrevoConfig()

// Email-enabled implies Brevo is required: a missing/blank BREVO_API_KEY with the flag on is a loud boot error, never a silent no-op that drops legally-mandated mail (ADR-0007 fail-fast, mirrors BillingApiConfig).
internal fun resolveBrevoConfig(env: (String) -> String? = System::getenv): BillingBrevoConfig? {
    if (env("BILLING_EMAIL_ENABLED")?.toBooleanStrictOrNull() != true) return null
    val apiKey = env("BREVO_API_KEY")
    if (apiKey.isNullOrBlank()) error("BILLING_EMAIL_ENABLED=true requires BREVO_API_KEY")
    return BillingBrevoConfig(
        apiKey = apiKey,
        senderEmail = env("BREVO_SENDER_EMAIL") ?: "abonnement@wordsparrow.io",
        senderName = env("BREVO_SENDER_NAME") ?: "WordSparrow – Abonnement",
        replyTo = env("BREVO_REPLY_TO") ?: "contact@wordsparrow.io",
    )
}

internal fun reconcileAndExit(
    provider: BillingProviderPort,
    repository: SubscriptionRepository,
    clock: Clock,
    agingThreshold: Duration,
): Int =
    runBlocking {
        val summary = ReconcileSubscriptions(provider, repository, clock, agingThreshold).execute()
        log.info(
            "event=billing_reconcile_done provider_active={} orphans_cancelled={} aging_pending_cancellations={}",
            summary.providerActiveCount,
            summary.orphansCancelled,
            summary.agingPendingCancellations,
        )
        0
    }

internal fun expireLapsedCancellationsAndExit(
    repository: SubscriptionRepository,
    publisher: SubscriptionPublisher,
    clock: Clock,
    eventIds: EventIdGenerator,
): Int =
    runBlocking {
        val summary = ExpireLapsedCancellations(repository, publisher, clock, eventIds).execute()
        log.info("event=billing_expire_lapsed_cancellations_done expired={}", summary.expired)
        0
    }

internal fun drainEmailOutboxAndExit(
    store: OutboundEmailStore,
    emailSender: EmailSender,
    resolver: SubscriberEmailResolver,
    clock: Clock,
): Int =
    runBlocking {
        val summary = DrainEmailOutbox(store, emailSender, resolver, clock).execute()
        log.info(
            "event=billing_drain_email_outbox_done claimed={} sent={} deferred={} undeliverable={}",
            summary.claimed,
            summary.sent,
            summary.deferred,
            summary.undeliverable,
        )
        0
    }

internal fun sendRenewalNoticesAndExit(
    repository: SubscriptionRepository,
    provider: BillingProviderPort,
    notifier: ContractConfirmationNotifier,
    ledger: RenewalNoticeLedger,
    clock: Clock,
    window: ChatelWindow,
): Int =
    runBlocking {
        val summary = SendRenewalNotices(repository, provider, notifier, ledger, clock, window).execute()
        log.info(
            "event=billing_renewal_notices_done annual_in_window={} notices_sent={} already_notified={}",
            summary.annualInWindow,
            summary.noticesSent,
            summary.alreadyNotified,
        )
        0
    }
