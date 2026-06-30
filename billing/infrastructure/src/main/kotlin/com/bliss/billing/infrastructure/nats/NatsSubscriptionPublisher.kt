package com.bliss.billing.infrastructure.nats

import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import io.nats.client.JetStream
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory

@Serializable
private data class SubscriptionChangedPayload(
    val eventId: String,
    val userId: String,
    val tier: String,
    val status: String,
    val periodEnd: String?,
    val source: String,
    val changedAt: String,
)

/** Publishes SubscriptionChanged on the JetStream subscription subject; mirrors NatsUserRoleChangedBroadcaster over the ADR-0049 posture (ADR-0078). */
class NatsSubscriptionPublisher(
    private val jetStream: JetStream,
    // encodeDefaults+explicitNulls keep `periodEnd` on the wire as null vs absent per ADR-0003 §6 and the asyncapi contract.
    private val json: Json =
        Json {
            encodeDefaults = true
            explicitNulls = true
        },
) : SubscriptionPublisher {
    override suspend fun publish(event: SubscriptionChanged) {
        val payload =
            json.encodeToString(
                SubscriptionChangedPayload.serializer(),
                SubscriptionChangedPayload(
                    eventId = event.eventId.toString(),
                    userId = event.userId.toString(),
                    tier = event.tier.value,
                    status = event.status.wire,
                    periodEnd = event.periodEnd?.toString(),
                    source = event.source.wire,
                    changedAt = event.changedAt.toString(),
                ),
            )
        try {
            jetStream.publishAsync(SUBJECT, payload.toByteArray(Charsets.UTF_8))
        } catch (e: Throwable) {
            log.warn("subscription-changed publish failed for {}", event.userId, e)
        }
    }

    companion object {
        const val SUBJECT: String = "wordsparrow.user.subscription-changed"
        private val log = LoggerFactory.getLogger(NatsSubscriptionPublisher::class.java)
    }
}
