package com.bliss.survey.api.routes

import com.bliss.survey.api.auth.UserIdKey
import com.bliss.survey.api.dto.ProgressResponse
import com.bliss.survey.api.requireContribuer
import com.bliss.survey.application.ports.UserProgressRepository
import com.bliss.survey.domain.model.UserId
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.meProgressRoute(progress: UserProgressRepository) {
    get("/v1/me/progress") {
        if (!call.requireContribuer()) return@get
        val userId = call.attributes[UserIdKey]
        val state = progress.get(UserId(userId))
        call.respond(
            HttpStatusCode.OK,
            ProgressResponse(
                itemsRated = state?.itemsRated ?: 0,
                calibrationAgreement = state?.calibrationAgreement,
                lastRatedAt = state?.lastRatedAt?.toString(),
            ),
        )
    }
}
