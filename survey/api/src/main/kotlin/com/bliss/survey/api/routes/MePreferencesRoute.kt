package com.bliss.survey.api.routes

import com.bliss.survey.api.auth.UserIdKey
import com.bliss.survey.api.dto.PreferencesPatch
import com.bliss.survey.api.requireContribuer
import com.bliss.survey.application.ports.ProposedByRepository
import com.bliss.survey.domain.model.UserId
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.patch

fun Route.mePreferencesRoute(proposedBy: ProposedByRepository) {
    patch("/v1/me/preferences") {
        if (!call.requireContribuer()) return@patch
        val userId = call.attributes[UserIdKey]
        val body = call.receive<PreferencesPatch>()
        proposedBy.setOptOut(UserId(userId), body.deleteProposedOnErasure)
        call.respond(HttpStatusCode.NoContent)
    }
}
