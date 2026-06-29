package com.bliss.grid.api.routes

import com.bliss.grid.api.dto.ProblemDetails
import com.bliss.grid.api.dto.SampleVerifyRequest
import com.bliss.grid.api.dto.SampleVerifyResult
import com.bliss.grid.api.dto.SampleWordDto
import com.bliss.grid.application.words.SampleWordsUseCase
import com.bliss.grid.application.words.VerifySampleWordUseCase
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.json.Json

private const val INVALID_SAMPLE_BOUNDS_TYPE: String =
    "https://bliss.example/errors/invalid-sample-bounds"
private const val INVALID_VERIFY_BODY_TYPE: String =
    "https://bliss.example/errors/invalid-sample-verify"

private const val SAMPLE_MIN_LENGTH: Int = SampleWordsUseCase.MIN_LENGTH
private const val SAMPLE_MAX_LENGTH: Int = SampleWordsUseCase.MAX_LENGTH
private const val SAMPLE_MIN_COUNT: Int = SampleWordsUseCase.MIN_COUNT

private const val DEFAULT_MIN_LEN: Int = 3
private const val DEFAULT_MAX_LEN: Int = 6
private const val DEFAULT_COUNT: Int = 8

// Mirror the openapi.yaml maxLengths for verifySampleWord so an oversized body is a 400, not OOM.
private const val MAX_TOKEN_LENGTH: Int = 256
private const val MAX_GUESS_LENGTH: Int = 64

/** Grid bounded-context words surface (ADR-0073, ADR-0076): sample + server-verify the teaser. */
fun Route.words(
    sampleWords: SampleWordsUseCase,
    verifySampleWord: VerifySampleWordUseCase,
) {
    get("/v1/words/sample") {
        val minLen =
            when (val parsed = boundedLength(call.parameters["minLen"], "minLen", DEFAULT_MIN_LEN)) {
                is BoundParse.Invalid -> return@get call.respondSampleBounds(parsed.detail)
                is BoundParse.Ok -> parsed.value
            }
        val maxLen =
            when (val parsed = boundedLength(call.parameters["maxLen"], "maxLen", DEFAULT_MAX_LEN)) {
                is BoundParse.Invalid -> return@get call.respondSampleBounds(parsed.detail)
                is BoundParse.Ok -> parsed.value
            }
        if (minLen > maxLen) {
            return@get call.respondSampleBounds(
                "Le paramètre minLen ($minLen) ne peut pas dépasser maxLen ($maxLen).",
            )
        }
        val count =
            when (val parsed = positiveCount(call.parameters["count"], DEFAULT_COUNT)) {
                is BoundParse.Invalid -> return@get call.respondSampleBounds(parsed.detail)
                is BoundParse.Ok -> parsed.value
            }

        val sample =
            sampleWords
                .invoke(minLen = minLen, maxLen = maxLen, count = count)
                .map {
                    SampleWordDto(
                        clue = it.clue,
                        answerLength = it.answerLength,
                        token = it.token,
                    )
                }
        call.respond(sample)
    }

    post("/v1/words/sample/verify") {
        val request =
            runCatching { verifyJson.decodeFromString(SampleVerifyRequest.serializer(), call.receiveText()) }
                .getOrNull()
                ?: return@post call.respondVerifyBody("Le corps de la requête doit être un JSON {token, guess} valide.")
        if (request.token.isEmpty() || request.token.length > MAX_TOKEN_LENGTH) {
            return@post call.respondVerifyBody("Le paramètre token est vide ou dépasse $MAX_TOKEN_LENGTH caractères.")
        }
        if (request.guess.isEmpty() || request.guess.length > MAX_GUESS_LENGTH) {
            return@post call.respondVerifyBody("Le paramètre guess est vide ou dépasse $MAX_GUESS_LENGTH caractères.")
        }
        val correct = verifySampleWord.invoke(token = request.token, guess = request.guess)
        call.respond(SampleVerifyResult(correct = correct))
    }
}

private val verifyJson = Json { ignoreUnknownKeys = true }

private sealed interface BoundParse {
    data class Ok(
        val value: Int,
    ) : BoundParse

    data class Invalid(
        val detail: String,
    ) : BoundParse
}

private fun boundedLength(
    raw: String?,
    name: String,
    default: Int,
): BoundParse {
    if (raw.isNullOrBlank()) return BoundParse.Ok(default)
    val value =
        raw.toIntOrNull()
            ?: return BoundParse.Invalid("Le paramètre $name doit être un entier, reçu : '$raw'.")
    if (value !in SAMPLE_MIN_LENGTH..SAMPLE_MAX_LENGTH) {
        return BoundParse.Invalid(
            "Le paramètre $name doit être compris entre $SAMPLE_MIN_LENGTH et $SAMPLE_MAX_LENGTH, reçu : $value.",
        )
    }
    return BoundParse.Ok(value)
}

private fun positiveCount(
    raw: String?,
    default: Int,
): BoundParse {
    if (raw.isNullOrBlank()) return BoundParse.Ok(default)
    val value =
        raw.toIntOrNull()
            ?: return BoundParse.Invalid("Le paramètre count doit être un entier, reçu : '$raw'.")
    if (value < SAMPLE_MIN_COUNT) {
        return BoundParse.Invalid("Le paramètre count doit être au moins $SAMPLE_MIN_COUNT, reçu : $value.")
    }
    return BoundParse.Ok(value)
}

private suspend fun ApplicationCall.respondSampleBounds(detail: String) =
    respondProblem(INVALID_SAMPLE_BOUNDS_TYPE, "Bornes d'échantillon invalides", detail)

private suspend fun ApplicationCall.respondVerifyBody(detail: String) =
    respondProblem(INVALID_VERIFY_BODY_TYPE, "Corps de vérification invalide", detail)

private suspend fun ApplicationCall.respondProblem(
    type: String,
    title: String,
    detail: String,
) {
    val problem =
        ProblemDetails(
            type = type,
            title = title,
            status = HttpStatusCode.BadRequest.value,
            detail = detail,
            instance = request.local.uri,
        )
    respondText(
        text = Json.encodeToString(ProblemDetails.serializer(), problem),
        contentType = ContentType.parse("application/problem+json"),
        status = HttpStatusCode.BadRequest,
    )
}
