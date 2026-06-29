package com.bliss.billing.api.routes

import com.bliss.billing.api.ProblemTypes
import com.bliss.billing.api.respondProblem
import com.bliss.billing.application.usecases.IngestProviderEvent
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receiveParameters
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

// POST /v1/webhook — public, no auth/gate. Parses form-urlencoded `id` and runs ingest BEFORE 200: the provider treats any 2xx as final delivery (ADR-0078).
fun Route.webhookRoute(ingest: IngestProviderEvent) {
    post("/v1/webhook") {
        val id = runCatching { call.receiveParameters() }.getOrNull()?.get("id")
        if (id.isNullOrBlank()) {
            return@post call.respondProblem(
                HttpStatusCode.BadRequest,
                ProblemTypes.INVALID_WEBHOOK_BODY,
                "missing resource reference id",
            )
        }
        // No try/catch: a failure propagates to StatusPages as 500 so the provider retries; 200 is reached only after durable handling.
        ingest.execute(id)
        call.respond(HttpStatusCode.OK)
    }
}
