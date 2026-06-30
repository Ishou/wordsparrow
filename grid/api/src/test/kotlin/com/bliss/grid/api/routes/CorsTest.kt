package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.doesNotContain
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.grid.api.module
import io.ktor.client.request.get
import io.ktor.client.request.headers
import io.ktor.client.request.options
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test

/** Wire-path tests for CORS — allowlist, credentialed preflight, and explicit header list (ADR-0077). */
class CorsTest {
    private val validId = "0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b"

    @Test
    fun `preflight from prod origin is allowed and returns CORS headers`() =
        testApplication {
            application { module() }

            val response =
                client.options("/v1/puzzles/$validId") {
                    headers {
                        append(HttpHeaders.Origin, "https://wordsparrow.io")
                        append(HttpHeaders.AccessControlRequestMethod, "GET")
                    }
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("https://wordsparrow.io")
            // Ktor's CORS plugin only emits non-simple methods in
            // Allow-Methods (GET is a CORS-simple method and is implicit).
            // The header must still appear so the preflight is well-formed.
            assertThat(response.headers[HttpHeaders.AccessControlAllowMethods])
                .isNotNull()
            assertThat(response.headers[HttpHeaders.AccessControlAllowMethods]!!)
                .contains("OPTIONS")
            // Credentialed CORS so the session cookie reaches /hints (ADR-0077).
            assertThat(response.headers[HttpHeaders.AccessControlAllowCredentials])
                .isEqualTo("true")
            // 24h cache, per Module.kt config.
            assertThat(response.headers[HttpHeaders.AccessControlMaxAge])
                .isEqualTo("86400")
        }

    @Test
    fun `actual GET from prod origin echoes Allow-Origin`() =
        testApplication {
            application { module() }

            val response =
                client.get("/v1/puzzles/$validId") {
                    headers { append(HttpHeaders.Origin, "https://wordsparrow.io") }
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("https://wordsparrow.io")
        }

    @Test
    fun `disallowed origin is not echoed back on preflight`() =
        testApplication {
            application { module() }

            val response =
                client.options("/v1/puzzles/$validId") {
                    headers {
                        append(HttpHeaders.Origin, "https://evil.example")
                        append(HttpHeaders.AccessControlRequestMethod, "GET")
                    }
                }

            // The browser's contract: no `Access-Control-Allow-Origin` header
            // means the request fails the same-origin policy. The exact status
            // Ktor returns here is not the security boundary; the absence of
            // the allow-origin header is.
            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin]).isNull()
        }

    @Test
    fun `preflight from www prod origin is allowed`() =
        testApplication {
            application { module() }

            val response =
                client.options("/v1/puzzles/$validId") {
                    headers {
                        append(HttpHeaders.Origin, "https://www.wordsparrow.io")
                        append(HttpHeaders.AccessControlRequestMethod, "GET")
                    }
                }

            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("https://www.wordsparrow.io")
        }

    @Test
    fun `preflight from local dev origin is allowed`() =
        testApplication {
            application { module() }

            val response =
                client.options("/v1/puzzles/$validId") {
                    headers {
                        append(HttpHeaders.Origin, "http://localhost:5173")
                        append(HttpHeaders.AccessControlRequestMethod, "GET")
                    }
                }

            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("http://localhost:5173")
        }

    @Test
    fun `credentialed preflight allows the enumerated headers (ADR-0077)`() =
        testApplication {
            application { module() }

            // ADR-0077: verifies the explicit-list headers and Allow-Credentials: true are echoed on preflight.
            val response =
                client.options("/v1/puzzles/$validId/hints") {
                    headers {
                        append(HttpHeaders.Origin, "https://wordsparrow.io")
                        append(HttpHeaders.AccessControlRequestMethod, "POST")
                        append(
                            HttpHeaders.AccessControlRequestHeaders,
                            "Content-Type, X-Request-Id, traceparent, tracestate",
                        )
                    }
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("https://wordsparrow.io")
            assertThat(response.headers[HttpHeaders.AccessControlAllowCredentials])
                .isEqualTo("true")
            val allowHeaders =
                response.headers[HttpHeaders.AccessControlAllowHeaders].orEmpty().lowercase()
            assertThat(allowHeaders).contains("content-type")
            assertThat(allowHeaders).contains("x-request-id")
            assertThat(allowHeaders).contains("traceparent")
            assertThat(allowHeaders).contains("tracestate")
        }

    @Test
    fun `credentialed preflight rejects a header outside the explicit allowlist`() =
        testApplication {
            application { module() }

            // ADR-0077 explicit list: unlisted header must not appear in Access-Control-Allow-Headers.
            val response =
                client.options("/v1/puzzles/$validId/hints") {
                    headers {
                        append(HttpHeaders.Origin, "https://wordsparrow.io")
                        append(HttpHeaders.AccessControlRequestMethod, "POST")
                        append(HttpHeaders.AccessControlRequestHeaders, "X-Foo-Future")
                    }
                }

            val allowHeaders =
                response.headers[HttpHeaders.AccessControlAllowHeaders].orEmpty().lowercase()
            assertThat(allowHeaders).doesNotContain("x-foo-future")
        }

    @Test
    fun `preflight allows DELETE for the session erasure endpoint`() =
        testApplication {
            application { module() }

            val response =
                client.options("/v1/sessions/$validId") {
                    headers {
                        append(HttpHeaders.Origin, "https://wordsparrow.io")
                        append(HttpHeaders.AccessControlRequestMethod, "DELETE")
                    }
                }

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("https://wordsparrow.io")
            assertThat(response.headers[HttpHeaders.AccessControlAllowMethods]!!)
                .contains("DELETE")
        }

    @Test
    fun `actual POST from prod origin echoes Allow-Origin (hints, non-simple Content-Type)`() =
        testApplication {
            application { module() }

            // Mirrors the GET case above for the POST /hints path. The
            // browser sends Content-Type: application/json, which the
            // CORS spec classifies as non-simple. Ktor's CORS plugin
            // strips Access-Control-Allow-Origin from the actual (post-
            // preflight) response unless `allowNonSimpleContentTypes =
            // true` is set in Module.kt — see game/api Module.kt:93-102
            // for the canonical write-up. Status code is intentionally
            // not asserted: the puzzle does not exist so the route
            // returns 404; what matters is the header.
            val response =
                client.post("/v1/puzzles/$validId/hints") {
                    headers {
                        append(HttpHeaders.Origin, "https://wordsparrow.io")
                        append("X-Session-Id", validId)
                    }
                    contentType(ContentType.Application.Json)
                    setBody("""{"row":0,"column":0}""")
                }

            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin])
                .isEqualTo("https://wordsparrow.io")
        }

    @Test
    fun `an arbitrary pages dev preview origin is NOT in the allowlist`() =
        testApplication {
            application { module() }

            // No *.pages.dev host is allowlisted; any Cloudflare Pages preview origin must fail (ADR-0077).
            val response =
                client.options("/v1/puzzles/$validId") {
                    headers {
                        append(
                            HttpHeaders.Origin,
                            "https://deadbeef.bliss-frontend.pages.dev",
                        )
                        append(HttpHeaders.AccessControlRequestMethod, "GET")
                    }
                }

            assertThat(response.headers[HttpHeaders.AccessControlAllowOrigin]).isNull()
        }
}
