package com.bliss.billing.api

import com.bliss.billing.api.config.BillingApiConfig
import com.bliss.billing.api.identity.IdentityClient
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.usecases.CancelSubscription
import com.bliss.billing.application.usecases.EntitlementQuery
import com.bliss.billing.application.usecases.IngestProviderEvent
import com.bliss.billing.infrastructure.nats.NatsEntitlementPublisher
import com.bliss.billing.infrastructure.persistence.BillingDatabase
import com.bliss.billing.infrastructure.persistence.PostgresMollieCustomerStore
import com.bliss.billing.infrastructure.persistence.PostgresProcessedEventLedger
import com.bliss.billing.infrastructure.persistence.PostgresSubscriptionRepository
import com.bliss.billing.infrastructure.provider.MollieBillingAdapter
import com.bliss.billing.infrastructure.provider.MollieConfig
import com.bliss.billing.infrastructure.provider.SdkMollieClient
import com.fasterxml.uuid.Generators
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.nats.client.Nats
import java.time.Instant

// Production entry-point; tests use Application.billingApiModule(wiring, config) directly.
fun main() {
    val config = BillingApiConfig.load()
    val mollieConfig = MollieConfig.fromEnv()

    val db = BillingDatabase(poolName = "billing-api", maxPoolSize = 10, requireUrl = true).apply { start() }
    val dataSource = db.dataSource() ?: error("BillingDatabase did not produce a DataSource.")

    val subscriptions = PostgresSubscriptionRepository(dataSource)
    val ledger = PostgresProcessedEventLedger(dataSource)
    val customerStore = PostgresMollieCustomerStore(dataSource)
    val provider = MollieBillingAdapter(SdkMollieClient(mollieConfig), customerStore, mollieConfig)

    // ADR-0049 — connect to NATS before Ktor serves so the EntitlementChanged publisher is ready on first request.
    val natsConn = Nats.connect(config.natsUrl)
    val publisher = NatsEntitlementPublisher(natsConn.jetStream())

    val clock = Clock { Instant.now() }
    val eventIds = EventIdGenerator { Generators.timeBasedEpochGenerator().generate() }

    val identityClient = IdentityClient(config.identityBaseUrl)

    val wiring =
        Wiring(
            verifySession = { cookie -> identityClient.verifySession(cookie) },
            provider = provider,
            subscriptions = subscriptions,
            cancelSubscription = CancelSubscription(provider, subscriptions, publisher, clock, eventIds),
            ingestProviderEvent = IngestProviderEvent(provider, subscriptions, publisher, ledger, clock, eventIds),
            entitlementQuery = EntitlementQuery(subscriptions),
            closeNats = { natsConn.close() },
        )

    embeddedServer(CIO, port = config.port, host = "0.0.0.0") {
        billingApiModule(wiring, config)
    }.start(wait = true)
}
