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
import com.bliss.billing.application.usecases.CreateCheckoutSession
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import io.ktor.client.request.cookie
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
import org.junit.jupiter.api.Test
import java.util.UUID

class CheckoutSessionRouteTest {
    private val userId = UUID.fromString("11111111-1111-7111-8111-111111111111")
    private val subscriber = SessionPrincipal(userId, setOf(SUBSCRIBE_CAPABILITY))
    private val withoutCapability = SessionPrincipal(userId, emptySet())

    @Test
    fun `caller with billing subscribe gets 201 with checkout urls`() =
        testApplication {
            val provider = FakeBillingProvider()
            install(subscriber, CreateCheckoutSession(provider, FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(resp.bodyAsText()).contains("checkoutUrl")
            assertThat(provider.lastCheckout?.first).isEqualTo(userId)
            assertThat(provider.lastCheckout?.third).isEqualTo(Cadence.MONTHLY)
        }

    @Test
    fun `omitted cadence defaults to monthly`() =
        testApplication {
            val provider = FakeBillingProvider()
            install(subscriber, CreateCheckoutSession(provider, FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(provider.lastCheckout?.third).isEqualTo(Cadence.MONTHLY)
        }

    @Test
    fun `session-derived email is passed through to the checkout use case`() =
        testApplication {
            val provider = FakeBillingProvider()
            install(subscriber, CreateCheckoutSession(provider, FakeSubscriptionRepository()), email = "player@example.com")
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(provider.lastCheckoutEmail).isEqualTo("player@example.com")
        }

    @Test
    fun `absent email still completes checkout`() =
        testApplication {
            val provider = FakeBillingProvider()
            install(subscriber, CreateCheckoutSession(provider, FakeSubscriptionRepository()), email = null)
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(provider.lastCheckoutEmail).isEqualTo(null)
        }

    @Test
    fun `yearly cadence is forwarded to the use case`() =
        testApplication {
            val provider = FakeBillingProvider()
            install(subscriber, CreateCheckoutSession(provider, FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter","cadence":"yearly"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Created)
            assertThat(provider.lastCheckout?.third).isEqualTo(Cadence.YEARLY)
        }

    @Test
    fun `unknown cadence yields 400`() =
        testApplication {
            install(subscriber, CreateCheckoutSession(FakeBillingProvider(), FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter","cadence":"weekly"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(resp.bodyAsText()).contains("errors/invalid-checkout-request")
        }

    @Test
    fun `caller without billing subscribe is rejected with 403`() =
        testApplication {
            install(withoutCapability, CreateCheckoutSession(FakeBillingProvider(), FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(resp.bodyAsText()).contains("errors/forbidden")
        }

    @Test
    fun `anonymous caller is rejected with 401`() =
        testApplication {
            install(null, CreateCheckoutSession(FakeBillingProvider(), FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(resp.bodyAsText()).contains("errors/auth-required")
        }

    @Test
    fun `existing live subscription yields 409`() =
        testApplication {
            val repo = FakeSubscriptionRepository()
            repo.save(
                Subscription(userId, Tier.of("supporter"), SubscriptionStatus.ACTIVE, BillingSource.MOLLIE, "cust:sub_1", null),
            )
            install(subscriber, CreateCheckoutSession(FakeBillingProvider(), repo))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.Conflict)
            assertThat(resp.bodyAsText()).contains("errors/already-subscribed")
        }

    @Test
    fun `provider unavailable yields 503`() =
        testApplication {
            val provider = FakeBillingProvider().apply { failCheckoutOnce = true }
            install(subscriber, CreateCheckoutSession(provider, FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"supporter"}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.ServiceUnavailable)
            assertThat(resp.bodyAsText()).contains("errors/provider-unavailable")
        }

    @Test
    fun `blank tier yields 400`() =
        testApplication {
            install(subscriber, CreateCheckoutSession(FakeBillingProvider(), FakeSubscriptionRepository()))
            val resp =
                client.post("/v1/checkout-session") {
                    cookie(SESSION_COOKIE_NAME, "valid")
                    contentType(ContentType.Application.Json)
                    setBody("""{"tier":"  "}""")
                }
            assertThat(resp.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(resp.bodyAsText()).contains("errors/invalid-checkout-request")
        }

    private fun ApplicationTestBuilder.install(
        principal: SessionPrincipal?,
        useCase: CreateCheckoutSession,
        email: String? = null,
    ) = application {
        install(SessionMiddleware) { verifySession = { principal } }
        install(ContentNegotiation) { json(WIRE_JSON) }
        routing { checkoutSessionRoute(useCase) { email } }
    }
}
