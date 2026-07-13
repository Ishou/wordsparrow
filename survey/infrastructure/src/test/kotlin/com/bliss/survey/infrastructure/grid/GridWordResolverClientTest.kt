package com.bliss.survey.infrastructure.grid

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.junit.jupiter.api.Test
import java.util.UUID

class GridWordResolverClientTest {
    private val puzzleId = UUID.fromString("55555555-5555-7555-8555-555555555555")

    @Test
    fun `posts the clue with the service-token header and parses the resolved word`() =
        runTest {
            val capturedTokens = mutableListOf<String?>()
            val capturedPaths = mutableListOf<String>()
            val capturedBodies = mutableListOf<String>()
            val engine =
                MockEngine { request ->
                    capturedTokens += request.headers["X-Service-Token"]
                    capturedPaths += request.url.encodedPath
                    capturedBodies += (request.body as io.ktor.http.content.TextContent).text
                    respond(
                        content = """{"word":"ESSE"}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf("Content-Type", ContentType.Application.Json.toString()),
                    )
                }
            val client = GridWordResolverClient(baseUrl = "https://grid.example", serviceToken = "svc-token", engine = engine)

            val resolved = client.resolve(puzzleId, "Animal qui miaule")

            assertThat(resolved).isEqualTo("ESSE")
            assertThat(capturedTokens).isEqualTo(listOf("svc-token"))
            assertThat(capturedPaths).isEqualTo(listOf("/v1/puzzles/$puzzleId/resolve-word"))
            assertThat(capturedBodies.single()).contains("Animal qui miaule")
            client.close()
        }

    @Test
    fun `returns null on 404 when the clue is not on the puzzle`() =
        runTest {
            val engine =
                MockEngine { _ ->
                    respond(
                        content = """{"type":"about:blank","status":404,"title":"clue not on puzzle"}""",
                        status = HttpStatusCode.NotFound,
                        headers = headersOf("Content-Type", ContentType.Application.Json.toString()),
                    )
                }
            val client = GridWordResolverClient(baseUrl = "https://grid.example", serviceToken = "svc-token", engine = engine)

            assertThat(client.resolve(puzzleId, "inconnue")).isNull()
            client.close()
        }

    @Test
    fun `returns null on a network error rather than throwing`() =
        runTest {
            val engine = MockEngine { _ -> throw IOException("connection refused (simulated)") }
            val client = GridWordResolverClient(baseUrl = "https://grid.example", serviceToken = "svc-token", engine = engine)

            assertThat(client.resolve(puzzleId, "Animal qui miaule")).isNull()
            client.close()
        }
}
