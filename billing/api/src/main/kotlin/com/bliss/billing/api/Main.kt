package com.bliss.billing.api

import com.bliss.billing.api.config.BillingApiConfig
import com.bliss.billing.api.identity.IdentityClient
import com.bliss.billing.api.identity.IdentityCustomerEmailLookup
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.OfferPrice
import com.bliss.billing.application.ports.SubscriptionOffer
import com.bliss.billing.application.usecases.CancelSubscription
import com.bliss.billing.application.usecases.CreateCheckoutSession
import com.bliss.billing.application.usecases.HandleUserDeleted
import com.bliss.billing.application.usecases.IngestProviderEvent
import com.bliss.billing.application.usecases.LegalEmailNotifier
import com.bliss.billing.application.usecases.ListReceipts
import com.bliss.billing.application.usecases.NoOpContractConfirmationNotifier
import com.bliss.billing.application.usecases.SubscriptionQuery
import com.bliss.billing.domain.Cadence
import com.bliss.billing.infrastructure.email.BillingBrevoEmailSender
import com.bliss.billing.infrastructure.nats.MaxDeliveriesDlqRepublisher
import com.bliss.billing.infrastructure.nats.NatsSubscriptionPublisher
import com.bliss.billing.infrastructure.nats.UserDeletedConsumer
import com.bliss.billing.infrastructure.persistence.BillingDatabase
import com.bliss.billing.infrastructure.persistence.PostgresConsentRepository
import com.bliss.billing.infrastructure.persistence.PostgresMollieCustomerStore
import com.bliss.billing.infrastructure.persistence.PostgresProcessedEventLedger
import com.bliss.billing.infrastructure.persistence.PostgresSubscriptionRepository
import com.bliss.billing.infrastructure.provider.MollieBillingAdapter
import com.bliss.billing.infrastructure.provider.MollieConfig
import com.bliss.billing.infrastructure.provider.MollieReceiptAdapter
import com.bliss.billing.infrastructure.provider.SdkMollieClient
import com.fasterxml.uuid.Generators
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.nats.client.Nats
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import java.time.Instant
import io.ktor.client.engine.cio.CIO as ClientCIO

// Production entry-point.
fun main() {
    val config = BillingApiConfig.load()
    val mollieConfig = MollieConfig.fromEnv()

    val db = BillingDatabase(poolName = "billing-api", maxPoolSize = 10, requireUrl = true).apply { start() }
    val dataSource = db.dataSource() ?: error("BillingDatabase did not produce a DataSource.")

    val subscriptions = PostgresSubscriptionRepository(dataSource)
    val consents = PostgresConsentRepository(dataSource)
    val ledger = PostgresProcessedEventLedger(dataSource)
    val customerStore = PostgresMollieCustomerStore(dataSource)
    val mollieClient = SdkMollieClient(mollieConfig)
    val provider = MollieBillingAdapter(mollieClient, customerStore, mollieConfig)
    val receiptProvider = MollieReceiptAdapter(mollieClient, customerStore)

    // ADR-0049 — connect to NATS before Ktor serves so the SubscriptionChanged publisher is ready on first request.
    val natsConn = Nats.connect(config.natsUrl)
    val publisher = NatsSubscriptionPublisher(natsConn.jetStream())

    val clock = Clock { Instant.now() }
    val eventIds = EventIdGenerator { Generators.timeBasedEpochGenerator().generate() }

    // ADR-0049 — start the user.deleted consumer before Ktor serves so redelivery-on-boot events drive the cancellation invariant (ADR-0078).
    val handleUserDeleted = HandleUserDeleted(provider, subscriptions, publisher, clock, eventIds)
    val consumerScope = CoroutineScope(SupervisorJob())
    val userDeletedConsumer = UserDeletedConsumer(natsConn, handleUserDeleted, consumerScope)
    userDeletedConsumer.start()
    val dlqRepublisher =
        MaxDeliveriesDlqRepublisher(
            connection = natsConn,
            jetStreamManagement = natsConn.jetStreamManagement(),
            streamName = MaxDeliveriesDlqRepublisher.USER_EVENTS_STREAM,
            consumerNames = listOf(UserDeletedConsumer.DURABLE_NAME),
        )
    dlqRepublisher.start()

    val identityClient = IdentityClient(config.identityBaseUrl)

    // Receipt prices derive from the same source as the Mollie charge so the durable-medium receipt can never misstate what was billed (ADR-0094 §5).
    val toMinorUnits: (String) -> Long = { it.toBigDecimal().movePointRight(2).toLong() }
    val offer =
        SubscriptionOffer(
            mapOf(
                Cadence.MONTHLY to OfferPrice(toMinorUnits(mollieConfig.subscriptionAmountFor(Cadence.MONTHLY)), mollieConfig.currency),
                Cadence.YEARLY to OfferPrice(toMinorUnits(mollieConfig.subscriptionAmountFor(Cadence.YEARLY)), mollieConfig.currency),
            ),
        )
    val contractNotifier: ContractConfirmationNotifier =
        if (config.emailEnabled && config.brevo != null) {
            LegalEmailNotifier(
                BillingBrevoEmailSender(ClientCIO.create(), config.brevo),
                IdentityCustomerEmailLookup(identityClient),
                consents,
                offer,
            )
        } else {
            NoOpContractConfirmationNotifier()
        }

    val wiring =
        Wiring(
            verifySession = { cookie -> identityClient.verifySession(cookie) },
            fetchEmail = { cookie -> identityClient.fetchEmail(cookie) },
            createCheckoutSession = CreateCheckoutSession(provider, subscriptions, consents, clock),
            cancelSubscription = CancelSubscription(provider, subscriptions, publisher, clock, eventIds),
            ingestProviderEvent = IngestProviderEvent(provider, subscriptions, publisher, ledger, clock, eventIds, contractNotifier),
            subscriptionQuery = SubscriptionQuery(subscriptions),
            listReceipts = ListReceipts(receiptProvider),
            closeNats = {
                dlqRepublisher.close()
                userDeletedConsumer.stop()
                natsConn.close()
            },
            closeIdentityClient = { identityClient.close() },
        )

    embeddedServer(CIO, port = config.port, host = "0.0.0.0") {
        billingApiModule(wiring, config)
    }.start(wait = true)
}
