// GET /v1/users/me/lobbies — cross-device "Mes parties" for the cookie-authed user (ADR-0066); empty array never 404, bare 401 like LobbyRebindRoute.
package com.bliss.game.api.routes

import com.bliss.game.api.auth.CookieNames
import com.bliss.game.api.mapper.toDto
import com.bliss.game.application.auth.CookieVerifier
import com.bliss.game.application.usecases.ListLobbiesForUser
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route

fun Route.users(
    verifier: CookieVerifier,
    listLobbies: ListLobbiesForUser,
) {
    route("/v1/users/me") {
        get("lobbies") {
            val whoami =
                verifier.verify(call.request.cookies[CookieNames.SESSION])
                    ?: return@get call.respond(HttpStatusCode.Unauthorized)
            val summaries = listLobbies(whoami.userId)
            call.respond(summaries.map { it.toDto() })
        }
    }
}
