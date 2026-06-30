package com.bliss.billing.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.billing.api.WIRE_JSON
import com.bliss.billing.api.auth.SESSION_COOKIE_NAME
import com.bliss.billing.api.auth.SessionMiddleware
import com.bliss.billing.api.auth.SessionPrincipal
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.usecases.EntitlementQuery
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.util.UUID

class EntitlementRouteTest {
    private val userId = UUID.fromString("44444444-4444-7444-8444-444444444444")
    private val player = SessionPrincipal(userId, "player")

    @Test
    fun `anonymous caller is rejected with 401`() =
        testApplication {
            install(null, FakeSubscriptionRepository())
            val resp = client.get("/v1/entitlement")
            assertThat(resp.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(resp.bodyAsText()).contains("errors/auth-required")
        }

    @Test
    fun `never-subscribed authed caller gets the free projection with null periodEnd`() =
        testApplication {
            install(player, FakeSubscriptionRepository())
            val resp = client.get("/v1/entitlement") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            val body = resp.bodyAsText()
            assertThat(body).contains("\"tier\":\"free\"")
            // periodEnd null and capabilities [] must be present on the wire, not absent (ADR-0003 §6).
            assertThat(body).contains("\"periodEnd\":null")
            assertThat(body).contains("\"capabilities\":[]")
        }

    @Test
    fun `subscribed caller reads their own entitlement`() =
        testApplication {
            val repo = FakeSubscriptionRepository()
            repo.save(
                Subscription(userId, Tier.of("supporter"), SubscriptionStatus.ACTIVE, BillingSource.MOLLIE, "cust:sub_1", null),
            )
            install(player, repo)
            val resp = client.get("/v1/entitlement") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).contains("\"tier\":\"supporter\"")
        }

    private fun ApplicationTestBuilder.install(
        principal: SessionPrincipal?,
        repo: FakeSubscriptionRepository,
    ) = application {
        install(SessionMiddleware) { verifySession = { principal } }
        install(ContentNegotiation) { json(WIRE_JSON) }
        routing { entitlementRoute(EntitlementQuery(repo)) }
    }
}
