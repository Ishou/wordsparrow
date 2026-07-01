package com.bliss.billing.api.routes

import com.bliss.billing.api.mapper.toView
import com.bliss.billing.api.requireSession
import com.bliss.billing.application.usecases.ListReceipts
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

// GET /v1/receipts — authed, not capability-gated; any authed caller lists their OWN payment receipts, newest-first, cursor-paged (ADR-0078).
fun Route.receiptsRoute(listReceipts: ListReceipts) {
    get("/v1/receipts") {
        val principal = call.requireSession() ?: return@get
        val cursor = call.request.queryParameters["cursor"]
        val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: DEFAULT_LIMIT
        call.respond(HttpStatusCode.OK, listReceipts.execute(principal.userId, cursor, limit).toView())
    }
}

private const val DEFAULT_LIMIT = 20
