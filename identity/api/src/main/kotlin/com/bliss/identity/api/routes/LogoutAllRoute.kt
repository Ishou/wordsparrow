package com.bliss.identity.api.routes

import com.bliss.identity.api.auth.SessionCookies
import com.bliss.identity.api.auth.authenticated
import com.bliss.identity.application.usecases.LogoutAllCommand
import com.bliss.identity.application.usecases.LogoutAllUseCase
import com.bliss.identity.application.usecases.WhoAmIUseCase
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

fun Route.logoutAll(
    logoutAll: LogoutAllUseCase,
    whoAmI: WhoAmIUseCase,
) {
    post("/v1/auth/logout-all") {
        call.authenticated(whoAmI) ?: return@post
        val sessionId = SessionCookies.read(call.request)!!
        logoutAll.execute(LogoutAllCommand(sessionId))
        // No cookie clear: the caller stays signed in on this device (ADR-0091).
        call.respond(HttpStatusCode.NoContent)
    }
}
