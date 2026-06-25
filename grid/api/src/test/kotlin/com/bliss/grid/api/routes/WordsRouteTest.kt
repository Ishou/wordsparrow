package com.bliss.grid.api.routes

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isGreaterThan
import assertk.assertions.isLessThanOrEqualTo
import assertk.assertions.isTrue
import assertk.assertions.startsWith
import com.bliss.grid.api.module
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test

/** Wire-path tests for `GET /v1/words/sample` via Ktor [testApplication] against the resident corpus. */
class WordsRouteTest {
    @Test
    fun `responds 200 with a bare array of SampleWord pairs`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/words/sample?minLen=3&maxLen=6&count=5")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/json")

            val array = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertThat(array.size).isGreaterThan(0)
            assertThat(array.size).isLessThanOrEqualTo(5)
            array.forEach { element ->
                val obj = element.jsonObject
                val answer = obj["answer"]!!.jsonPrimitive.content
                val clue = obj["clue"]!!.jsonPrimitive.content
                assertThat(answer.all { it in 'A'..'Z' }).isTrue()
                assertThat(answer.length in 3..6).isTrue()
                assertThat(clue.isNotBlank()).isTrue()
            }
        }

    @Test
    fun `clamps count above the ceiling instead of rejecting`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/words/sample?count=9999")

            assertThat(response.status).isEqualTo(HttpStatusCode.OK)
            val array = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertThat(array.size).isLessThanOrEqualTo(50)
        }

    @Test
    fun `rejects an out-of-range minLen with 400 problem json`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/words/sample?minLen=2")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
            val obj = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(obj["type"]!!.jsonPrimitive.content)
                .isEqualTo("https://bliss.example/errors/invalid-sample-bounds")
        }

    @Test
    fun `rejects a non-integer count with 400`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/words/sample?count=abc")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            assertThat(response.headers["Content-Type"]!!).startsWith("application/problem+json")
        }

    @Test
    fun `rejects a non-positive count with 400`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/words/sample?count=0")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
        }

    @Test
    fun `rejects an inverted range where minLen exceeds maxLen with 400`() =
        testApplication {
            application { module() }

            val response = client.get("/v1/words/sample?minLen=6&maxLen=3")

            assertThat(response.status).isEqualTo(HttpStatusCode.BadRequest)
            val obj = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertThat(obj["type"]!!.jsonPrimitive.content)
                .isEqualTo("https://bliss.example/errors/invalid-sample-bounds")
        }

    @Test
    fun `every answer respects the requested length band`() =
        testApplication {
            application { module() }

            val array =
                Json
                    .parseToJsonElement(client.get("/v1/words/sample?minLen=4&maxLen=4&count=20").bodyAsText())
                    .jsonArray
            assertThat(array.isEmpty()).isFalse()
            array.forEach {
                assertThat(
                    it.jsonObject["answer"]!!
                        .jsonPrimitive.content.length,
                ).isEqualTo(4)
            }
        }
}
