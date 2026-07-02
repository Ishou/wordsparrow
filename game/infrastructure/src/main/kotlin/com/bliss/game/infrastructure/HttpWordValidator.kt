// HTTP adapter for the WordValidator port. Calls grid's internal,
// service-authenticated `POST /v1/puzzles/{id}/validate-word` (ADR-0084)
// and returns whether the submitted word is fully correct.
//
// Why not derive from the puzzle's letter cells directly: per the v1
// wire (grid/api/openapi.yaml `LetterCell`), letter cells ship without
// their canonical answer — solutions are server-private. game-api
// therefore can't validate locally and must delegate to grid for every
// word check. The endpoint is a per-word binary oracle (`{ correct }`)
// carrying no positional data (ADR-0084 §1), reachable only with the
// shared service token; solo clients never regain per-cell feedback.
package com.bliss.game.infrastructure

import com.bliss.game.application.ports.WordValidator
import com.bliss.game.domain.Letter
import com.bliss.game.domain.Position
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.IOException
import java.util.UUID

class HttpWordValidator(
    private val httpClient: HttpClient,
    private val gridBaseUrl: String,
    private val serviceToken: String? = System.getenv(SERVICE_TOKEN_ENV),
    private val json: Json = DEFAULT_JSON,
) : WordValidator {
    override suspend fun isWordCorrect(
        puzzleId: UUID,
        word: Map<Position, Letter>,
    ): Boolean {
        val request =
            ValidateWordRequestDto(
                cells =
                    word.entries.map { (pos, letter) ->
                        WordCellDto(row = pos.row, column = pos.column, letter = letter.value.toString())
                    },
            )
        val response: HttpResponse =
            try {
                httpClient.post("$gridBaseUrl/v1/puzzles/$puzzleId/validate-word") {
                    header(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    serviceToken?.let { header(SERVICE_TOKEN_HEADER, it) }
                    setBody(json.encodeToString(ValidateWordRequestDto.serializer(), request))
                }
            } catch (cause: IOException) {
                throw WordValidatorException.UpstreamUnavailable(cause)
            }
        if (!response.status.isSuccess()) {
            throw WordValidatorException.UpstreamError(response.status.value, response.bodyAsText())
        }
        val dto =
            try {
                json.decodeFromString(ValidateWordResponseDto.serializer(), response.bodyAsText())
            } catch (cause: SerializationException) {
                throw WordValidatorException.UpstreamMalformed(cause)
            }
        return dto.correct
    }

    companion object {
        const val SERVICE_TOKEN_HEADER = "X-Service-Token"
        const val SERVICE_TOKEN_ENV = "WORD_VALIDATE_SERVICE_TOKEN"

        internal val DEFAULT_JSON: Json =
            Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            }
    }
}

@Serializable
private data class ValidateWordRequestDto(
    val cells: List<WordCellDto>,
)

@Serializable
private data class WordCellDto(
    val row: Int,
    val column: Int,
    val letter: String,
)

@Serializable
private data class ValidateWordResponseDto(
    val correct: Boolean,
)

sealed class WordValidatorException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause) {
    class UpstreamError(
        val status: Int,
        val body: String,
    ) : WordValidatorException("grid validate-word responded with HTTP $status: $body")

    class UpstreamUnavailable(
        cause: Throwable,
    ) : WordValidatorException("grid validate-word is unreachable: ${cause.message}", cause)

    class UpstreamMalformed(
        cause: Throwable,
    ) : WordValidatorException("grid validate-word response failed to parse: ${cause.message}", cause)
}
