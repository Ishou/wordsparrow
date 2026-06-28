package com.bliss.identity.api.routes

import com.bliss.identity.api.auth.authenticated
import com.bliss.identity.api.dto.ProgressEntryDto
import com.bliss.identity.api.dto.ProgressListDto
import com.bliss.identity.api.dto.ProgressUpdateRequest
import com.bliss.identity.api.dto.ProgressWriteResultDto
import com.bliss.identity.application.usecases.GetProgressQuery
import com.bliss.identity.application.usecases.GetProgressUseCase
import com.bliss.identity.application.usecases.ListProgressQuery
import com.bliss.identity.application.usecases.ListProgressUseCase
import com.bliss.identity.application.usecases.PutProgressCommand
import com.bliss.identity.application.usecases.PutProgressError
import com.bliss.identity.application.usecases.PutProgressUseCase
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.RoutingCall
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.format.DateTimeParseException

fun Route.listProgress(
    listProgress: ListProgressUseCase,
    whoAmI: WhoAmIUseCase,
    json: Json = PROGRESS_JSON,
) {
    get("/v1/users/me/progress") {
        val auth = call.authenticated(whoAmI) ?: return@get
        val items =
            listProgress
                .execute(ListProgressQuery(userId = auth.userId))
                .map { it.toEntryDto(json) }
        call.respond(HttpStatusCode.OK, ProgressListDto(items))
    }
}

fun Route.getProgress(
    getProgress: GetProgressUseCase,
    whoAmI: WhoAmIUseCase,
    json: Json = PROGRESS_JSON,
) {
    get("/v1/users/me/progress/{puzzleId}") {
        val auth = call.authenticated(whoAmI) ?: return@get
        val puzzleId = call.puzzleIdOrNull(json) ?: return@get
        val found =
            getProgress.execute(GetProgressQuery(userId = auth.userId, puzzleId = puzzleId))
                ?: return@get call.problem(
                    json,
                    HttpStatusCode.NotFound,
                    "progress_not_found",
                    "No stored progress for this puzzle.",
                )
        call.respond(HttpStatusCode.OK, found.toEntryDto(json))
    }
}

fun Route.putProgress(
    putProgress: PutProgressUseCase,
    whoAmI: WhoAmIUseCase,
    rateLimiter: PutRateLimiter = PutRateLimiter(),
    json: Json = PROGRESS_JSON,
) {
    put("/v1/users/me/progress/{puzzleId}") {
        val auth = call.authenticated(whoAmI) ?: return@put
        if (!rateLimiter.allow(auth.userId)) {
            return@put call.problem(
                json,
                HttpStatusCode.TooManyRequests,
                "rate_limit_exceeded",
                "Too many PUT requests; retry after the current window expires.",
            )
        }
        val puzzleId = call.puzzleIdOrNull(json) ?: return@put
        val request =
            try {
                call.receive<ProgressUpdateRequest>()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                return@put call.problem(
                    json,
                    HttpStatusCode.BadRequest,
                    "invalid_body",
                    "Request body must be a JSON object with an object `payload`.",
                )
            }
        val baseUpdatedAt =
            try {
                request.baseUpdatedAt?.let { Instant.parse(it) }
            } catch (_: DateTimeParseException) {
                return@put call.problem(
                    json,
                    HttpStatusCode.BadRequest,
                    "invalid_base_updated_at",
                    "baseUpdatedAt must be an ISO-8601 timestamp.",
                )
            }
        try {
            val updatedAt =
                putProgress.execute(
                    PutProgressCommand(
                        userId = auth.userId,
                        puzzleId = puzzleId,
                        payload = json.encodeToString(JsonObject.serializer(), request.payload),
                        baseUpdatedAt = baseUpdatedAt,
                    ),
                )
            call.respond(HttpStatusCode.OK, ProgressWriteResultDto(updatedAt.toString()))
        } catch (e: CancellationException) {
            throw e
        } catch (e: PutProgressError) {
            when (e) {
                is PutProgressError.PayloadTooLarge ->
                    call.problem(
                        json,
                        HttpStatusCode.PayloadTooLarge,
                        "payload_too_large",
                        e.message ?: "Payload exceeds the size cap.",
                    )
                is PutProgressError.StaleBase ->
                    call.problem(
                        json,
                        HttpStatusCode.Conflict,
                        "stale_base",
                        e.message ?: "baseUpdatedAt is stale; re-pull and re-merge.",
                    )
                is PutProgressError.QuotaExceeded ->
                    call.problem(
                        json,
                        HttpStatusCode.Forbidden,
                        "quota_exceeded",
                        e.message ?: "Puzzle count cap reached.",
                    )
            }
        }
    }
}

private suspend fun RoutingCall.puzzleIdOrNull(json: Json): PuzzleId? {
    val raw = parameters["puzzleId"]
    return try {
        PuzzleId.parse(raw!!)
    } catch (_: Exception) {
        problem(json, HttpStatusCode.BadRequest, "invalid_puzzle_id", "puzzleId must be a UUID.")
        null
    }
}

private fun PuzzleProgress.toEntryDto(json: Json): ProgressEntryDto =
    ProgressEntryDto(
        puzzleId = puzzleId.value.toString(),
        payload = json.decodeFromString(JsonObject.serializer(), payload),
        updatedAt = updatedAt.toString(),
    )

private val PROGRESS_JSON: Json =
    Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
        explicitNulls = false
    }
