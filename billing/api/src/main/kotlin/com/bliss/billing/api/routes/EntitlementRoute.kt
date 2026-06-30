package com.bliss.billing.api.routes

import com.bliss.billing.api.mapper.toView
import com.bliss.billing.api.requireSession
import com.bliss.billing.application.usecases.EntitlementQuery
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

// GET /v1/entitlement — authed, NOT maintainer-gated; any authed caller reads their OWN entitlement (ADR-0078).
fun Route.entitlementRoute(query: EntitlementQuery) {
    get("/v1/entitlement") {
        val principal = call.requireSession() ?: return@get
        call.respond(HttpStatusCode.OK, query.execute(principal.userId).toView())
    }
}
