package com.bliss.billing.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test

class HealthRouteTest {
    @Test
    fun `health returns 200 ok`() =
        testApplication {
            application { routing { healthRoute() } }
            val resp = client.get("/v1/health")
            assertThat(resp.status).isEqualTo(HttpStatusCode.OK)
            assertThat(resp.bodyAsText()).contains("ok")
        }
}
