package com.bliss.billing.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.billing.api.WIRE_JSON
import com.bliss.billing.api.auth.SESSION_COOKIE_NAME
import com.bliss.billing.api.auth.SUBSCRIBE_CAPABILITY
import com.bliss.billing.api.auth.SessionMiddleware
import com.bliss.billing.api.auth.SessionPrincipal
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.RecordingSubscriptionPublisher
import com.bliss.billing.application.testdoubles.SequentialEventIdGenerator
import com.bliss.billing.application.usecases.CancelSubscription
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import io.ktor.client.request.cookie
import io.ktor.client.request.post
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class CancelSubscriptionRouteTest {
    private val userId = UUID.fromString("22222222-2222-7222-8222-222222222222")
    private val subscriber = SessionPrincipal(userId, setOf(SUBSCRIBE_CAPABILITY))
    private val withoutCapability = SessionPrincipal(userId, emptySet())

    @Test
    fun `no active subscription yields 404`() =
        testApplication {
            install(subscriber, FakeSubscriptionRepository(), FakeBillingProvider())
            val resp = client.post("/v1/subscription/cancel") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.NotFound)
            assertThat(resp.bodyAsText()).contains("errors/no-active-subscription")
        }

    @Test
    fun `active subscription is canceled and returns the updated subscription`() =
        testApplication {
            val repo = FakeSubscriptionRepository()
            repo.save(
                Subscription(userId, Tier.of("supporter"), SubscriptionStatus.ACTIVE, BillingSource.MOLLIE, "cust:sub_1", null),
            )
            install(subscriber, repo, FakeBillingProvider())
            val resp = client.post("/v1/subscription/cancel") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).contains("\"status\":\"canceled\"")
        }

    @Test
    fun `caller without billing subscribe is rejected with 403`() =
        testApplication {
            install(withoutCapability, FakeSubscriptionRepository(), FakeBillingProvider())
            val resp = client.post("/v1/subscription/cancel") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(resp.bodyAsText()).contains("errors/forbidden")
        }

    private fun ApplicationTestBuilder.install(
        principal: SessionPrincipal?,
        repo: FakeSubscriptionRepository,
        provider: FakeBillingProvider,
    ) = application {
        val cancel =
            CancelSubscription(
                provider,
                repo,
                RecordingSubscriptionPublisher(),
                FixedClock(Instant.parse("2026-06-30T00:00:00Z")),
                SequentialEventIdGenerator(),
            )
        install(SessionMiddleware) { verifySession = { principal } }
        install(ContentNegotiation) { json(WIRE_JSON) }
        routing { cancelSubscriptionRoute(cancel) }
    }
}
