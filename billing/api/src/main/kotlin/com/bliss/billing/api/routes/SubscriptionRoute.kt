package com.bliss.billing.api.routes

import com.bliss.billing.api.mapper.toView
import com.bliss.billing.api.requireSession
import com.bliss.billing.application.usecases.SubscriptionQuery
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

// GET /v1/subscription — authed, not capability-gated; any authed caller reads their OWN subscription status (ADR-0078).
fun Route.subscriptionRoute(query: SubscriptionQuery) {
    get("/v1/subscription") {
        val principal = call.requireSession() ?: return@get
        call.respond(HttpStatusCode.OK, query.execute(principal.userId).toView())
    }
}
