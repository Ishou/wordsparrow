package com.bliss.survey.api.routes

import com.bliss.survey.api.dto.SignalementHistoryItem
import com.bliss.survey.api.dto.SignalementHistoryResponse
import com.bliss.survey.api.requireContribuer
import com.bliss.survey.application.usecases.SignalementDecision
import com.bliss.survey.application.usecases.SignalementHistoryRow
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

// Maintainer-only handled-report history (ADR-0079 + ADR-0115); gates on requireContribuer().
fun Route.signalementHistoryRoute(listHandled: suspend () -> List<SignalementHistoryRow>) {
    get("/v1/signalements/historique") {
        if (!call.requireContribuer()) return@get
        val items = listHandled().map { it.toHistoryItem() }
        call.respond(HttpStatusCode.OK, SignalementHistoryResponse(items = items))
    }
}

private fun SignalementHistoryRow.toHistoryItem(): SignalementHistoryItem =
    SignalementHistoryItem(
        reportId = reportId.value.toString(),
        wordText = wordText,
        clueText = clueText,
        reason = reason.name.lowercase(),
        surface = surface.name.lowercase(),
        puzzleId = puzzleId?.toString(),
        note = note,
        decision =
            when (decision) {
                SignalementDecision.DISMISS -> "dismiss"
                SignalementDecision.ACTION -> "action"
            },
        triagedAt = triagedAt.toString(),
    )
