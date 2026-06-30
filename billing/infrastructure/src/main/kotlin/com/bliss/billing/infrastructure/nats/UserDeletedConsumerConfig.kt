package com.bliss.billing.infrastructure.nats

import io.nats.client.Connection
import io.nats.client.api.AckPolicy
import io.nats.client.api.ConsumerConfiguration
import java.time.Duration

/** Consumer constants shared by bootstrap Job and api bind path (ADR-0049). */
object UserDeletedConsumerConfig {
    const val SUBJECT: String = "wordsparrow.user.deleted"
    const val STREAM_NAME: String = "WORDSPARROW_USER_EVENTS"
    const val DURABLE_NAME: String = "billing-api-user-deleted"

    // Deterministic so addOrUpdateConsumer is idempotent across helm upgrades.
    const val DELIVER_SUBJECT: String = "_DELIVER.billing-api.user-deleted"

    // ProviderCancelFailed naks; redelivery retries the cancel until the provider recovers (ADR-0078).
    const val MAX_DELIVER: Long = 5

    fun consumerConfiguration(): ConsumerConfiguration =
        ConsumerConfiguration
            .builder()
            .durable(DURABLE_NAME)
            .filterSubject(SUBJECT)
            .ackPolicy(AckPolicy.Explicit)
            .ackWait(Duration.ofSeconds(30))
            .maxDeliver(MAX_DELIVER)
            .deliverSubject(DELIVER_SUBJECT)
            .build()

    /** Throws JetStreamApiException (10013) on immutable-field conflict; resolve with --delete-consumer. */
    fun bootstrap(nats: Connection) {
        nats.jetStreamManagement().addOrUpdateConsumer(STREAM_NAME, consumerConfiguration())
    }

    /** Resolves immutable-field migration conflicts; operator-invoked only. */
    fun deleteConsumer(nats: Connection) {
        nats.jetStreamManagement().deleteConsumer(STREAM_NAME, DURABLE_NAME)
    }
}
