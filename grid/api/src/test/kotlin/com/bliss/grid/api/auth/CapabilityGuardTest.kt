package com.bliss.grid.api.auth

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.startsWith
import com.bliss.grid.application.auth.WhoAmI
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

class CapabilityGuardTest {
    private val userId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")

    private fun io.ktor.server.testing.ApplicationTestBuilder.mount(verify: suspend (String?) -> WhoAmI?) {
        application {
            install(SessionMiddleware) { this.verify = verify }
            routing {
                get("/guarded") {
                    if (!call.requireCapability(ADMIN_SIGNALEMENTS_CAPABILITY)) return@get
                    call.respondText("ok")
                }
            }
        }
    }

    @Test
    fun `denies an anonymous caller with 403`() =
        testApplication {
            mount { null }
            val response = client.get("/guarded")
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            assertThat(response.bodyAsText()).contains("capability-required")
        }

    @Test
    fun `denies a session without the capability with 403`() =
        testApplication {
            mount { WhoAmI(userId, "Joueuse", emptySet()) }
            val response = client.get("/guarded") { cookie("__Secure-ws_session", "session") }
            assertThat(response.status).isEqualTo(HttpStatusCode.Forbidden)
        }

    @Test
    fun `allows a session holding admin signalements`() =
        testApplication {
            mount { WhoAmI(userId, "Mainteneuse", setOf("admin:signalements")) }
            val response = client.get("/guarded") { cookie("__Secure-ws_session", "session") }
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.bodyAsText()).isEqualTo("ok")
        }
}
