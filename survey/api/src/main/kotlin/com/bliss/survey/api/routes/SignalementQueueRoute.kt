package com.bliss.survey.api.routes

import com.bliss.survey.api.auth.UserIdKey
import com.bliss.survey.api.dto.ProblemDetails
import com.bliss.survey.api.dto.SignalementDecisionRequest
import com.bliss.survey.api.dto.SignalementListResponse
import com.bliss.survey.api.dto.SignalementSummary
import com.bliss.survey.api.requireContribuer
import com.bliss.survey.api.respondProblem
import com.bliss.survey.application.usecases.DecideSignalementResult
import com.bliss.survey.application.usecases.SignalementDecision
import com.bliss.survey.application.usecases.SignalementGroup
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.UserId
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import java.util.UUID

// Maintainer-only triage queue (ADR-0079 + ADR-0103): both routes gate on requireContribuer(); anon/player callers get 403.
fun Route.signalementQueueRoute(
    list: suspend () -> List<SignalementGroup>,
    decide: suspend (ReportId, SignalementDecision, UserId) -> DecideSignalementResult,
) {
    get("/v1/signalements") {
        if (!call.requireContribuer()) return@get
        val items = list().map { it.toSummary() }
        call.respond(HttpStatusCode.OK, SignalementListResponse(items = items))
    }

    post("/v1/signalements/{reportId}/decision") {
        if (!call.requireContribuer()) return@post

        val reportId =
            runCatching { UUID.fromString(call.parameters["reportId"]) }.getOrNull()
                ?: return@post call.respondProblem(
                    HttpStatusCode.BadRequest,
                    problem("invalid report id", "reportId must be a UUID", HttpStatusCode.BadRequest),
                )

        val decision =
            when (call.receive<SignalementDecisionRequest>().decision) {
                "dismiss" -> SignalementDecision.DISMISS
                "action" -> SignalementDecision.ACTION
                else ->
                    return@post call.respondProblem(
                        HttpStatusCode.BadRequest,
                        problem("invalid decision", "decision must be dismiss or action", HttpStatusCode.BadRequest),
                    )
            }

        val maintainerId = UserId(call.attributes[UserIdKey])
        when (decide(ReportId(reportId), decision, maintainerId)) {
            DecideSignalementResult.Decided -> call.respond(HttpStatusCode.NoContent)
            DecideSignalementResult.NotFound ->
                call.respondProblem(
                    HttpStatusCode.NotFound,
                    problem("report not found", "no report with that id", HttpStatusCode.NotFound),
                )
        }
    }
}

private fun SignalementGroup.toSummary(): SignalementSummary =
    SignalementSummary(
        reportId = reportId.value.toString(),
        wordText = wordText,
        clueText = clueText,
        reason = reason.name.lowercase(),
        surface = surface.name.lowercase(),
        puzzleId = puzzleId?.toString(),
        count = count,
        latestNote = latestNote,
        latestAt = latestAt.toString(),
    )

private fun problem(
    title: String,
    detail: String,
    status: HttpStatusCode,
): ProblemDetails =
    ProblemDetails(
        type = "about:blank",
        title = title,
        status = status.value,
        detail = detail,
    )
