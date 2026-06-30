package com.bliss.billing.api.auth

import assertk.assertThat
import assertk.assertions.isEqualTo
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.install
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import java.util.UUID

class SessionMiddlewareTest {
    private val subscriber = SessionPrincipal(UUID.fromString("01234567-89ab-7cde-89ab-0123456789ab"), setOf(SUBSCRIBE_CAPABILITY))

    @Test
    fun `no cookie - principal attribute is null and request proceeds`() =
        testApplication {
            application {
                install(SessionMiddleware) { verifySession = { null } }
                routing {
                    get("/probe") {
                        val p = call.attributes.getOrNull(PrincipalKey)
                        call.respondText(text = p?.userId?.toString() ?: "anon", status = HttpStatusCode.OK)
                    }
                }
            }
            val resp = client.get("/probe")
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).isEqualTo("anon")
        }

    @Test
    fun `valid cookie - principal with capabilities is set`() =
        testApplication {
            application {
                install(SessionMiddleware) { verifySession = { c -> if (c == "valid-token") subscriber else null } }
                routing {
                    get("/probe") {
                        val p = call.attributes.getOrNull(PrincipalKey)
                        call.respondText(text = "${p?.userId}:${p?.hasCapability(SUBSCRIBE_CAPABILITY)}", status = HttpStatusCode.OK)
                    }
                }
            }
            val resp = client.get("/probe") { cookie(SESSION_COOKIE_NAME, "valid-token") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).isEqualTo("${subscriber.userId}:true")
        }

    @Test
    fun `invalid cookie - principal attribute null (no 401)`() =
        testApplication {
            application {
                install(SessionMiddleware) { verifySession = { null } }
                routing {
                    get("/probe") {
                        val p = call.attributes.getOrNull(PrincipalKey)
                        call.respondText(text = p?.userId?.toString() ?: "anon", status = HttpStatusCode.OK)
                    }
                }
            }
            val resp = client.get("/probe") { cookie(SESSION_COOKIE_NAME, "tampered") }
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).isEqualTo("anon")
        }
}
