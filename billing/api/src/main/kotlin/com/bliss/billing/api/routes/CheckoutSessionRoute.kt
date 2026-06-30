package com.bliss.billing.api.routes

import com.bliss.billing.api.ProblemTypes
import com.bliss.billing.api.dto.CheckoutSessionRequest
import com.bliss.billing.api.dto.CheckoutSessionResponse
import com.bliss.billing.api.requireMaintainer
import com.bliss.billing.api.respondProblem
import com.bliss.billing.application.usecases.CreateCheckoutSession
import com.bliss.billing.application.usecases.CreateCheckoutSessionOutcome
import com.bliss.billing.application.usecases.ProviderUnavailable
import com.bliss.billing.domain.Tier
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

// POST /v1/checkout-session — authed + maintainer-gated; userId is session-derived, never the body (ADR-0078 IDOR guard).
fun Route.checkoutSessionRoute(createCheckoutSession: CreateCheckoutSession) {
    post("/v1/checkout-session") {
        val principal = call.requireMaintainer() ?: return@post
        val tier = call.parseTier() ?: return@post

        val outcome =
            try {
                createCheckoutSession.execute(principal.userId, tier)
            } catch (e: ProviderUnavailable) {
                return@post call.respondProblem(
                    HttpStatusCode.ServiceUnavailable,
                    ProblemTypes.PROVIDER_UNAVAILABLE,
                    "the payment provider is unavailable",
                )
            }

        when (outcome) {
            CreateCheckoutSessionOutcome.AlreadySubscribed ->
                call.respondProblem(
                    HttpStatusCode.Conflict,
                    ProblemTypes.ALREADY_SUBSCRIBED,
                    "the caller already has an active subscription",
                )
            is CreateCheckoutSessionOutcome.Success ->
                call.respond(
                    HttpStatusCode.Created,
                    CheckoutSessionResponse(
                        checkoutUrl = outcome.urls.checkoutUrl,
                        successUrl = outcome.urls.successUrl,
                        cancelUrl = outcome.urls.cancelUrl,
                    ),
                )
        }
    }
}

// Parses the request body's tier; responds 400 (and returns null) for a missing, malformed, or non-canonical tier.
private suspend fun io.ktor.server.application.ApplicationCall.parseTier(): Tier? {
    val raw = runCatching { receive<CheckoutSessionRequest>() }.getOrNull()?.tier
    val tier = raw?.let { runCatching { Tier.of(it) }.getOrNull() }
    if (tier == null) {
        respondProblem(HttpStatusCode.BadRequest, ProblemTypes.INVALID_CHECKOUT_REQUEST, "missing or unknown tier")
    }
    return tier
}
