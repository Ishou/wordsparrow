package com.bliss.survey.infrastructure.grid

import com.bliss.survey.application.ports.GridWordResolver
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.util.UUID

/** grid-api resolve-word client (ADR-0111); service-token gated like validate-word (ADR-0084). Any non-OK response or network error resolves to null. */
class GridWordResolverClient(
    private val baseUrl: String,
    private val serviceToken: String,
    engine: HttpClientEngine? = null,
) : GridWordResolver {
    private val log = LoggerFactory.getLogger(javaClass)

    private val json =
        Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }

    private val client: HttpClient =
        if (engine != null) {
            HttpClient(engine) { configure() }
        } else {
            HttpClient(CIO) { configure() }
        }

    private fun io.ktor.client.HttpClientConfig<*>.configure() {
        install(ContentNegotiation) { json(json) }
        expectSuccess = false
    }

    override suspend fun resolve(
        puzzleId: UUID,
        clueText: String,
    ): String? =
        runCatching {
            val response =
                client.post("$baseUrl/v1/puzzles/$puzzleId/resolve-word") {
                    header(SERVICE_TOKEN_HEADER, serviceToken)
                    contentType(ContentType.Application.Json)
                    setBody(ResolveWordRequest(clueText = clueText))
                }
            if (response.status == HttpStatusCode.OK) response.body<ResolveWordResult>().word else null
        }.onFailure {
            // A grid blip never loses a report (ADR-0111); the report is accepted with the word unresolved and backfilled later.
            log.warn("grid_resolve_word_failed puzzleId={} error={}", puzzleId, it.toString())
        }.getOrNull()

    /** Closes the underlying Ktor HttpClient. */
    fun close() {
        client.close()
    }

    companion object {
        const val SERVICE_TOKEN_HEADER: String = "X-Service-Token"
    }
}

@Serializable
internal data class ResolveWordRequest(
    val clueText: String,
)

@Serializable
internal data class ResolveWordResult(
    val word: String,
)
