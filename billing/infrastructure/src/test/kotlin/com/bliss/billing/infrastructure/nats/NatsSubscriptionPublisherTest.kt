package com.bliss.billing.infrastructure.nats

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import io.nats.client.JetStream
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Method
import java.lang.reflect.Proxy
import java.time.Instant
import java.util.UUID

class NatsSubscriptionPublisherTest {
    private data class PublishCall(
        val subject: String,
        val body: ByteArray,
    )

    private fun stubJetStream(captured: MutableList<PublishCall>): JetStream {
        val handler =
            InvocationHandler { _: Any?, method: Method, args: Array<Any?>? ->
                if (method.name == "publishAsync" &&
                    method.parameterCount == 2 &&
                    method.parameterTypes[0] == String::class.java &&
                    method.parameterTypes[1] == ByteArray::class.java
                ) {
                    captured.add(PublishCall(args!![0] as String, args[1] as ByteArray))
                }
                null
            }
        return Proxy.newProxyInstance(
            JetStream::class.java.classLoader,
            arrayOf(JetStream::class.java),
            handler,
        ) as JetStream
    }

    private fun event(periodEnd: Instant? = Instant.parse("2026-07-29T00:00:00Z")) =
        SubscriptionChanged(
            eventId = UUID.fromString("0190e3b1-2c3d-7e4f-8a1b-2c3d4e5f6a7b"),
            userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b"),
            tier = Tier.of("supporter"),
            status = SubscriptionStatus.ACTIVE,
            periodEnd = periodEnd,
            source = BillingSource.MOLLIE,
            changedAt = Instant.parse("2026-06-29T15:30:00Z"),
        )

    @Test
    fun `publishes the subscription event to the contract subject`() =
        runTest {
            val captured = mutableListOf<PublishCall>()
            NatsSubscriptionPublisher(stubJetStream(captured)).publish(event())

            assertThat(captured.single().subject).isEqualTo("wordsparrow.user.subscription-changed")
        }

    @Test
    fun `serializes every contract field including the event id and changed at`() =
        runTest {
            val captured = mutableListOf<PublishCall>()
            NatsSubscriptionPublisher(stubJetStream(captured)).publish(event())

            val json = Json.parseToJsonElement(String(captured.single().body, Charsets.UTF_8)) as JsonObject
            assertThat(json["eventId"]!!.jsonPrimitive.content).isEqualTo("0190e3b1-2c3d-7e4f-8a1b-2c3d4e5f6a7b")
            assertThat(json["userId"]!!.jsonPrimitive.content).isEqualTo("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b")
            assertThat(json["tier"]!!.jsonPrimitive.content).isEqualTo("supporter")
            assertThat(json["status"]!!.jsonPrimitive.content).isEqualTo("active")
            assertThat(json["source"]!!.jsonPrimitive.content).isEqualTo("mollie")
            assertThat(json["periodEnd"]!!.jsonPrimitive.content).isEqualTo("2026-07-29T00:00:00Z")
            assertThat(json["changedAt"]!!.jsonPrimitive.content).isEqualTo("2026-06-29T15:30:00Z")
        }

    @Test
    fun `keeps period end on the wire as json null when absent`() =
        runTest {
            val captured = mutableListOf<PublishCall>()
            NatsSubscriptionPublisher(stubJetStream(captured)).publish(event(periodEnd = null))

            val json = Json.parseToJsonElement(String(captured.single().body, Charsets.UTF_8)) as JsonObject
            assertThat(json["periodEnd"]).isEqualTo(JsonPrimitive(null))
        }
}
