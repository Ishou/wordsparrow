package com.bliss.billing.infrastructure.nats

import com.bliss.billing.application.usecases.HandleUserDeleted
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
import java.util.UUID

/** Durable JetStream consumer (ADR-0049) driving the deletion-cancellation invariant; ack only after the cancel confirms, nak otherwise so a failed provider cancel is redelivered (ADR-0078). */
class UserDeletedConsumer(
    private val nats: Connection,
    private val handleUserDeleted: HandleUserDeleted,
    private val scope: CoroutineScope,
    private val streamName: String = UserDeletedConsumerConfig.STREAM_NAME,
    private val durableName: String = UserDeletedConsumerConfig.DURABLE_NAME,
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
            // bind(true) lets the server supply the deliverSubject; api stays up if the consumer is absent.
            val sub =
                try {
                    nats.jetStream().subscribe(
                        UserDeletedConsumerConfig.SUBJECT,
                        PushSubscribeOptions
                            .builder()
                            .bind(true)
                            .stream(streamName)
                            .durable(durableName)
                            .build(),
                    )
                } catch (e: JetStreamApiException) {
                    log.warn(
                        "billing_user_deleted_consumer_bind_failed stream={} durable={} error={}",
                        streamName,
                        durableName,
                        e.toString(),
                    )
                    return null
                } catch (e: IllegalArgumentException) {
                    // jnats raises IllegalArgumentException for a missing consumer; same graceful-degrade path.
                    log.warn(
                        "billing_user_deleted_consumer_bind_failed stream={} durable={} error={}",
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
                            val event = json.decodeFromString(UserDeletedPayload.serializer(), msg.data.decodeToString())
                            handleUserDeleted.execute(UUID.fromString(event.userId))
                            msg.ack()
                        } catch (e: Exception) {
                            // No ack: a ProviderCancelFailed (or transient fault) redelivers; maxDeliver caps redelivery and dead-letters (ADR-0078).
                            log.error("billing_user_deleted_consume_failed subject={} error={}", msg.subject, e.toString(), e)
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
        const val SUBJECT: String = UserDeletedConsumerConfig.SUBJECT
        const val STREAM_NAME: String = UserDeletedConsumerConfig.STREAM_NAME
        const val DURABLE_NAME: String = UserDeletedConsumerConfig.DURABLE_NAME
    }
}

@Serializable
internal data class UserDeletedPayload(
    val userId: String,
    val deletedAt: String? = null,
)
