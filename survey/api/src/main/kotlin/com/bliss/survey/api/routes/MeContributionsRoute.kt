package com.bliss.survey.api.routes

import com.bliss.survey.api.auth.UserIdKey
import com.bliss.survey.api.dto.ContributionItem
import com.bliss.survey.api.requireContribuer
import com.bliss.survey.application.ports.SurveyItemRepository
import com.bliss.survey.domain.model.UserId
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.meContributionsRoute(items: SurveyItemRepository) {
    get("/v1/me/contributions") {
        if (!call.requireContribuer()) return@get
        val userId = call.attributes[UserIdKey]
        val list = items.listProposedByUser(UserId(userId))
        call.respond(
            HttpStatusCode.OK,
            list.map { c ->
                ContributionItem(
                    itemId =
                        c.item.id.value
                            .toString(),
                    mot = c.item.mot,
                    definition = c.item.definition,
                    pos =
                        c.item.pos.name
                            .lowercase(),
                    categorie =
                        c.item.categorie.name
                            .lowercase(),
                    style =
                        c.item.style.name
                            .lowercase(),
                    optedOut = c.optedOut,
                    kCoverage = c.kCoverage,
                    createdAt = c.item.createdAt.toString(),
                )
            },
        )
    }
}
