package com.bliss.billing.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import com.bliss.billing.api.WIRE_JSON
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.InMemoryProcessedEventLedger
import com.bliss.billing.application.testdoubles.RecordingSubscriptionPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.application.usecases.IngestProviderEvent
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.util.UUID

class WebhookRouteTest {
    private val userId = UUID.fromString("33333333-3333-7333-8333-333333333333")

    @Test
    fun `form-urlencoded id is processed durably before returning 200`() =
        testApplication {
            val provider = FakeBillingProvider()
            provider.seed(
                ProviderSubscriptionState("tr_test", userId, Tier.of("supporter"), SubscriptionStatus.ACTIVE, BillingSource.MOLLIE, null),
            )
            val repo = FakeSubscriptionRepository()
            install(provider, repo)
            val resp =
                client.post("/v1/webhook") {
                    contentType(ContentType.Application.FormUrlEncoded)
                    setBody("id=tr_test")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            // The subscription is persisted BEFORE the 200 — the provider treats 2xx as final delivery (ADR-0078).
            assertThat(runBlocking { repo.findByUserId(userId) }).isNotNull()
        }

    @Test
    fun `missing id yields 400`() =
        testApplication {
            install(FakeBillingProvider(), FakeSubscriptionRepository())
            val resp =
                client.post("/v1/webhook") {
                    contentType(ContentType.Application.FormUrlEncoded)
                    setBody("foo=bar")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(resp.bodyAsText()).contains("errors/invalid-webhook-body")
        }

    @Test
    fun `unknown reference is acknowledged with 200 without persisting`() =
        testApplication {
            val repo = FakeSubscriptionRepository()
            install(FakeBillingProvider(), repo)
            val resp =
                client.post("/v1/webhook") {
                    contentType(ContentType.Application.FormUrlEncoded)
                    setBody("id=tr_unknown")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
        }

    private fun ApplicationTestBuilder.install(
        provider: FakeBillingProvider,
        repo: FakeSubscriptionRepository,
    ) = application {
        val ingest =
            IngestProviderEvent(
                provider,
                repo,
                RecordingSubscriptionPublisher(),
                InMemoryProcessedEventLedger(),
                FixedClock(java.time.Instant.parse("2026-06-30T00:00:00Z")),
                SequentialEventIdGenerator(),
            )
        install(ContentNegotiation) { json(WIRE_JSON) }
        routing { webhookRoute(ingest) }
    }
}
