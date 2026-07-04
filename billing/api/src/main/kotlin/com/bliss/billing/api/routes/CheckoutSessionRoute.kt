package com.bliss.billing.api.routes

import com.bliss.billing.api.ProblemTypes
import com.bliss.billing.api.auth.SESSION_COOKIE_NAME
import com.bliss.billing.api.auth.SUBSCRIBE_CAPABILITY
import com.bliss.billing.api.dto.CheckoutConsentDto
import com.bliss.billing.api.dto.CheckoutSessionRequest
import com.bliss.billing.api.dto.CheckoutSessionResponse
import com.bliss.billing.api.requireCapability
import com.bliss.billing.api.respondProblem
import com.bliss.billing.application.usecases.CreateCheckoutSession
import com.bliss.billing.application.usecases.CreateCheckoutSessionOutcome
import com.bliss.billing.application.usecases.ProviderUnavailable
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.CheckoutConsent
import com.bliss.billing.domain.Tier
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

// POST /v1/checkout-session — authed + billing:subscribe-gated; userId + email are session-derived, never the body (ADR-0078 IDOR guard).
fun Route.checkoutSessionRoute(
    createCheckoutSession: CreateCheckoutSession,
    fetchEmail: suspend (String?) -> String?,
) {
    post("/v1/checkout-session") {
        val principal = call.requireCapability(SUBSCRIBE_CAPABILITY) ?: return@post
        val request = call.parseCheckoutRequest() ?: return@post

        // Best-effort: a missing email never blocks checkout (Mollie works without it) — pass-through only, billing stores none (ADR-0082).
        val email = fetchEmail(call.request.cookies[SESSION_COOKIE_NAME])

        val outcome =
            try {
                createCheckoutSession.execute(principal.userId, request.tier, request.cadence, email, request.consent)
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

private data class ParsedCheckout(
    val tier: Tier,
    val cadence: Cadence,
    val consent: CheckoutConsent?,
)

// Parses tier + cadence + consent from the body; responds 400 (and returns null) on a missing/unknown tier, an unknown cadence, or a present-but-invalid consent. An absent cadence defaults to monthly (ADR-0080); an absent consent is allowed in this expand phase (ADR-0094).
private suspend fun io.ktor.server.application.ApplicationCall.parseCheckoutRequest(): ParsedCheckout? {
    val body = runCatching { receive<CheckoutSessionRequest>() }.getOrNull()
    val tier = body?.tier?.let { runCatching { Tier.of(it) }.getOrNull() }
    // A supplied-but-unknown cadence is a client error; absence is the monthly default.
    val cadence = body?.cadence?.let { runCatching { Cadence.fromWire(it) }.getOrNull() ?: return badCheckout() } ?: Cadence.default
    if (tier == null) return badCheckout()
    // A supplied-but-invalid consent (cgvAccepted false or blank version) is a client error; absence is allowed in the expand phase.
    val consent = body.consent?.let { it.toDomain() ?: return badCheckout() }
    return ParsedCheckout(tier, cadence, consent)
}

// null when the consent is invalid (cgvAccepted must be true, version non-blank) — the caller maps that to a 400.
private fun CheckoutConsentDto.toDomain(): CheckoutConsent? =
    runCatching { CheckoutConsent(cgvAccepted, cgvVersion, withdrawalWaiver) }.getOrNull()

private suspend fun io.ktor.server.application.ApplicationCall.badCheckout(): Nothing? {
    respondProblem(HttpStatusCode.BadRequest, ProblemTypes.INVALID_CHECKOUT_REQUEST, "missing or unknown tier or cadence")
    return null
}
