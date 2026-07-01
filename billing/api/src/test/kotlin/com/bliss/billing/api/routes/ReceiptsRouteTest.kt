package com.bliss.billing.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import com.bliss.billing.api.WIRE_JSON
import com.bliss.billing.api.auth.SESSION_COOKIE_NAME
import com.bliss.billing.api.auth.SessionMiddleware
import com.bliss.billing.api.auth.SessionPrincipal
import com.bliss.billing.application.ports.ProviderReceipt
import com.bliss.billing.application.ports.ReceiptsPage
import com.bliss.billing.application.testdoubles.FakeReceiptProvider
import com.bliss.billing.application.usecases.ListReceipts
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
import java.time.Instant
import java.util.UUID

class ReceiptsRouteTest {
    private val userId = UUID.fromString("44444444-4444-7444-8444-444444444444")
    private val authed = SessionPrincipal(userId, emptySet())

    @Test
    fun `anonymous caller is rejected with 401`() =
        testApplication {
            install(null, FakeReceiptProvider())
            val resp = client.get("/v1/receipts")
            assertThat(resp.status).isEqualTo(HttpStatusCode.Unauthorized)
            assertThat(resp.bodyAsText()).contains("errors/auth-required")
        }

    @Test
    fun `a caller with no receipts gets an empty array and null nextCursor on the wire`() =
        testApplication {
            install(authed, FakeReceiptProvider())
            val resp = client.get("/v1/receipts") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            val body = resp.bodyAsText()
            assertThat(body).contains("\"receipts\":[]")
            // Absence and null are distinct (ADR-0003 §6): nextCursor must be present and null.
            assertThat(body).contains("\"nextCursor\":null")
        }

    @Test
    fun `maps receipts to the wire shape`() =
        testApplication {
            val provider =
                FakeReceiptProvider(
                    page =
                        ReceiptsPage(
                            receipts =
                                listOf(
                                    ProviderReceipt(
                                        paidAt = Instant.parse("2026-06-29T14:03:00Z"),
                                        amountMinorUnits = 200,
                                        currency = "EUR",
                                        status = "paid",
                                        receiptUrl = null,
                                    ),
                                ),
                            nextCursor = "tr_next",
                        ),
                )
            install(authed, provider)
            val resp = client.get("/v1/receipts") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            val body = resp.bodyAsText()
            assertThat(body).contains("\"amountMinorUnits\":200")
            assertThat(body).contains("\"paidAt\":\"2026-06-29T14:03:00Z\"")
            assertThat(body).contains("\"currency\":\"EUR\"")
            assertThat(body).contains("\"status\":\"paid\"")
            // receiptUrl null must be on the wire, not absent (ADR-0003 §6).
            assertThat(body).contains("\"receiptUrl\":null")
            assertThat(body).contains("\"nextCursor\":\"tr_next\"")
        }

    @Test
    fun `forwards cursor and limit query parameters to the use case`() =
        testApplication {
            val provider = FakeReceiptProvider()
            install(authed, provider)
            client.get("/v1/receipts?cursor=tr_from&limit=50") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(provider.lastCursor).isEqualTo("tr_from")
            assertThat(provider.lastLimit).isEqualTo(50)
        }

    @Test
    fun `defaults the limit to 20 when omitted`() =
        testApplication {
            val provider = FakeReceiptProvider()
            install(authed, provider)
            client.get("/v1/receipts") { cookie(SESSION_COOKIE_NAME, "valid") }
            assertThat(provider.lastLimit).isEqualTo(20)
        }

    private fun ApplicationTestBuilder.install(
        principal: SessionPrincipal?,
        provider: FakeReceiptProvider,
    ) = application {
        install(SessionMiddleware) { verifySession = { principal } }
        install(ContentNegotiation) { json(WIRE_JSON) }
        routing { receiptsRoute(ListReceipts(provider)) }
    }
}
