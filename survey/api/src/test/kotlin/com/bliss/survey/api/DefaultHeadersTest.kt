package com.bliss.survey.api

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.survey.api.routes.healthRoute
import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test

class DefaultHeadersTest {
    @Test
    fun `every response carries the fixed security and timing headers`() =
        testApplication {
            application {
                installSurveyDefaultHeaders()
                routing { healthRoute() }
            }
            val response = client.get("/v1/health")
            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["Strict-Transport-Security"])
                .isEqualTo("max-age=31536000; includeSubDomains")
            assertThat(response.headers["X-Content-Type-Options"]).isEqualTo("nosniff")
            assertThat(response.headers["Referrer-Policy"]).isEqualTo("strict-origin-when-cross-origin")
            assertThat(response.headers["X-Frame-Options"]).isEqualTo("DENY")
            assertThat(response.headers["Server"]).isEqualTo("WordSparrow")
            // ADR-0089 §6: expose resource timings to browser RUM on the first-party origins.
            assertThat(response.headers["Timing-Allow-Origin"])
                .isEqualTo("https://wordsparrow.io https://www.wordsparrow.io")
        }
}
