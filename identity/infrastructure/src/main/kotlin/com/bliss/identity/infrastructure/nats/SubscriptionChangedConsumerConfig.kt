package com.bliss.identity.infrastructure.nats

import io.nats.client.Connection
import io.nats.client.api.AckPolicy
import io.nats.client.api.ConsumerConfiguration
import java.time.Duration

/** Constants + durable provisioning for identity's first inbound consumer (ADR-0080, ADR-0049). */
object SubscriptionChangedConsumerConfig {
    const val SUBJECT: String = "wordsparrow.user.subscription-changed"
    const val STREAM_NAME: String = "WORDSPARROW_USER_EVENTS"
    const val DURABLE_NAME: String = "identity-api-subscription-changed"

    // Deterministic so addOrUpdateConsumer is idempotent across replicas and helm upgrades.
    const val DELIVER_SUBJECT: String = "_DELIVER.identity-api.subscription-changed"

    fun consumerConfiguration(): ConsumerConfiguration =
        ConsumerConfiguration
            .builder()
            .durable(DURABLE_NAME)
            .filterSubject(SUBJECT)
            .ackPolicy(AckPolicy.Explicit)
            .ackWait(Duration.ofSeconds(30))
            .maxDeliver(5)
            .deliverSubject(DELIVER_SUBJECT)
            .build()

    /** Create-or-update the durable; idempotent across helm upgrades. Invoked by the chart's bootstrap Job only. */
    fun bootstrap(nats: Connection) {
        nats.jetStreamManagement().addOrUpdateConsumer(STREAM_NAME, consumerConfiguration())
    }
}
