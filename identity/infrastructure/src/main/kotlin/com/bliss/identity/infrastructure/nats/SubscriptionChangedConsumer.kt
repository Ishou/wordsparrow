package com.bliss.identity.infrastructure.nats

import com.bliss.identity.application.usecases.ApplySubscriptionChangeUseCase
import com.bliss.identity.application.usecases.SubscriptionChange
import com.bliss.identity.domain.user.UserId
import io.nats.client.Connection
import io.nats.client.JetStreamApiException
import io.nats.client.JetStreamSubscription
import io.nats.client.PushSubscribeOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Identity's first inbound consumer (ADR-0080): create-or-bind the durable so it never hits billing's SUB-90017 bind failure. */
class SubscriptionChangedConsumer(
    private val nats: Connection,
    private val applyChange: ApplySubscriptionChangeUseCase,
    private val scope: CoroutineScope,
    private val streamName: String = SubscriptionChangedConsumerConfig.STREAM_NAME,
    private val durableName: String = SubscriptionChangedConsumerConfig.DURABLE_NAME,
    private val pollWait: Duration = Duration.ofSeconds(1),
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private val json =
        Json {
            ignoreUnknownKeys = true
        }

    @Volatile
    private var job: Job? = null

    @Volatile
    private var subscription: JetStreamSubscription? = null

    fun start(): Job? =
        synchronized(this) {
            val existing = job
            if (existing != null && existing.isActive) return existing
            val sub =
                try {
                    // Provision the durable first, then bind — a never-provisioned consumer can't fail at runtime.
                    SubscriptionChangedConsumerConfig.ensureConsumer(nats)
                    nats.jetStream().subscribe(
                        SubscriptionChangedConsumerConfig.SUBJECT,
                        PushSubscribeOptions
                            .builder()
                            .bind(true)
                            .stream(streamName)
                            .durable(durableName)
                            .build(),
                    )
                } catch (e: JetStreamApiException) {
                    log.warn(
                        "identity_subscription_changed_consumer_start_failed stream={} durable={} error={}",
                        streamName,
                        durableName,
                        e.toString(),
                    )
                    return null
                } catch (e: IllegalArgumentException) {
                    log.warn(
                        "identity_subscription_changed_consumer_start_failed stream={} durable={} error={}",
                        streamName,
                        durableName,
                        e.toString(),
                    )
                    return null
                }
            subscription = sub
            val newJob =
                scope.launch(Dispatchers.IO) {
                    while (isActive) {
                        val msg =
                            try {
                                sub.nextMessage(pollWait)
                            } catch (e: IllegalStateException) {
                                return@launch
                            } catch (e: InterruptedException) {
                                Thread.currentThread().interrupt()
                                return@launch
                            } ?: continue
                        try {
                            val event = json.decodeFromString(SubscriptionChangedPayload.serializer(), msg.data.decodeToString())
                            applyChange.execute(
                                SubscriptionChange(
                                    userId = UserId(UUID.fromString(event.userId)),
                                    tier = event.tier,
                                    status = event.status,
                                    changedAt = Instant.parse(event.changedAt),
                                ),
                            )
                            msg.ack()
                        } catch (e: Exception) {
                            log.error("identity_subscription_changed_consume_failed subject={} error={}", msg.subject, e.toString(), e)
                            msg.nak()
                        }
                    }
                }
            job = newJob
            newJob
        }

    fun stop() {
        subscription?.let { runCatching { it.unsubscribe() } }
        subscription = null
        job?.cancel()
        job = null
    }

    companion object {
        const val SUBJECT: String = SubscriptionChangedConsumerConfig.SUBJECT
        const val STREAM_NAME: String = SubscriptionChangedConsumerConfig.STREAM_NAME
        const val DURABLE_NAME: String = SubscriptionChangedConsumerConfig.DURABLE_NAME
    }
}

@Serializable
internal data class SubscriptionChangedPayload(
    val userId: String,
    val tier: String,
    val status: String,
    val changedAt: String,
)
