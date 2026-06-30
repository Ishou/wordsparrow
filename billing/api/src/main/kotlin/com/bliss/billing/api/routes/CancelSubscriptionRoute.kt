package com.bliss.billing.api.routes

import com.bliss.billing.api.ProblemTypes
import com.bliss.billing.api.auth.SUBSCRIBE_CAPABILITY
import com.bliss.billing.api.mapper.toView
import com.bliss.billing.api.requireCapability
import com.bliss.billing.api.respondProblem
import com.bliss.billing.application.usecases.CancelSubscription
import com.bliss.billing.application.usecases.CancelSubscriptionOutcome
import com.bliss.billing.application.usecases.ProviderUnavailable
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

// POST /v1/subscription/cancel — authed + billing:subscribe-gated; cancels the caller's own subscription (userId session-derived).
fun Route.cancelSubscriptionRoute(cancel: CancelSubscription) {
    post("/v1/subscription/cancel") {
        val principal = call.requireCapability(SUBSCRIBE_CAPABILITY) ?: return@post

        val outcome =
            try {
                cancel.execute(principal.userId)
            } catch (e: ProviderUnavailable) {
                return@post call.respondProblem(
                    HttpStatusCode.ServiceUnavailable,
                    ProblemTypes.PROVIDER_UNAVAILABLE,
                    "the payment provider is unavailable",
                )
            }

        when (outcome) {
            is CancelSubscriptionOutcome.Cancelled -> call.respond(HttpStatusCode.OK, outcome.subscriptionView.toView())
            CancelSubscriptionOutcome.NoActiveSubscription ->
                call.respondProblem(
                    HttpStatusCode.NotFound,
                    ProblemTypes.NO_ACTIVE_SUBSCRIPTION,
                    "no active subscription to cancel",
                )
        }
    }
}
