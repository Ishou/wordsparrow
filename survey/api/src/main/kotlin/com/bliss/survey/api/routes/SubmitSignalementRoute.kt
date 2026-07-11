package com.bliss.survey.api.routes

import com.bliss.survey.api.auth.UserIdKey
import com.bliss.survey.api.dto.ProblemDetails
import com.bliss.survey.api.dto.SignalementRequest
import com.bliss.survey.api.dto.SignalementResponse
import com.bliss.survey.api.respondProblem
import com.bliss.survey.application.usecases.SubmitSignalementCommand
import com.bliss.survey.application.usecases.SubmitSignalementResult
import com.bliss.survey.application.usecases.SubmitSignalementUseCase
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import java.util.UUID

// Optional auth (ADR-0103): anonymous players may report; a verified session binds the report for per-user dedup + RGPD. NOT contribuer-gated.
fun Route.submitSignalementRoute(execute: suspend (SubmitSignalementCommand) -> SubmitSignalementResult) {
    post("/v1/signalements") {
        val body = call.receive<SignalementRequest>()

        val reason = runCatching { ReportReason.valueOf(body.reason.uppercase()) }.getOrNull()
        if (reason == null) {
            return@post call.respondProblem(
                HttpStatusCode.BadRequest,
                ProblemDetails(
                    type = "about:blank",
                    title = "invalid reason",
                    status = HttpStatusCode.BadRequest.value,
                    detail = "reason must be a known ReportReason value",
                ),
            )
        }

        val surface = runCatching { ReportSurface.valueOf(body.surface.uppercase()) }.getOrNull()
        if (surface == null) {
            return@post call.respondProblem(
                HttpStatusCode.BadRequest,
                ProblemDetails(
                    type = "about:blank",
                    title = "invalid surface",
                    status = HttpStatusCode.BadRequest.value,
                    detail = "surface must be a known ReportSurface value",
                ),
            )
        }

        val puzzleId =
            if (body.puzzleId == null) {
                null
            } else {
                runCatching { UUID.fromString(body.puzzleId) }.getOrNull()
                    ?: return@post call.respondProblem(
                        HttpStatusCode.BadRequest,
                        ProblemDetails(
                            type = "about:blank",
                            title = "invalid puzzle id",
                            status = HttpStatusCode.BadRequest.value,
                            detail = "puzzleId must be a UUID",
                        ),
                    )
            }

        val reporterId = call.attributes.getOrNull(UserIdKey)?.let { UserId(it) }

        val cmd =
            SubmitSignalementCommand(
                wordText = body.wordText,
                clueText = body.clueText,
                reason = reason,
                note = body.note,
                puzzleId = puzzleId,
                surface = surface,
                reporterId = reporterId,
            )

        when (val result = execute(cmd)) {
            is SubmitSignalementResult.Accepted ->
                call.respond(HttpStatusCode.Created, SignalementResponse(reportId = result.reportId.value.toString()))

            // Idempotent no-op: the reporter already filed this exact report; 200 (no fresh id) signals "already recorded".
            SubmitSignalementResult.DuplicateIgnored ->
                call.respond(HttpStatusCode.OK)
        }
    }
}

// Production overload so Module.kt can pass the concrete use case without exposing the test seam.
fun Route.submitSignalementRoute(useCase: SubmitSignalementUseCase) = submitSignalementRoute { cmd -> useCase.execute(cmd) }
