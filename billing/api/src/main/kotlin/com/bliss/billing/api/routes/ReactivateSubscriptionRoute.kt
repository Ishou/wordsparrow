package com.bliss.billing.api.routes

import com.bliss.billing.api.ProblemTypes
import com.bliss.billing.api.auth.SUBSCRIBE_CAPABILITY
import com.bliss.billing.api.mapper.toView
import com.bliss.billing.api.requireCapability
import com.bliss.billing.api.respondProblem
import com.bliss.billing.application.usecases.ProviderUnavailable
import com.bliss.billing.application.usecases.ReactivateSubscription
import com.bliss.billing.application.usecases.ReactivateSubscriptionOutcome
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post

// POST /v1/subscription/reactivate — authed + billing:subscribe-gated; resumes the caller's own scheduled non-renewal (userId session-derived).
fun Route.reactivateSubscriptionRoute(reactivate: ReactivateSubscription) {
    post("/v1/subscription/reactivate") {
        val principal = call.requireCapability(SUBSCRIBE_CAPABILITY) ?: return@post

        val outcome =
            try {
                reactivate.execute(principal.userId)
            } catch (e: ProviderUnavailable) {
                return@post call.respondProblem(
                    HttpStatusCode.ServiceUnavailable,
                    ProblemTypes.PROVIDER_UNAVAILABLE,
                    "the payment provider is unavailable",
                )
            }

        when (outcome) {
            is ReactivateSubscriptionOutcome.Reactivated -> call.respond(HttpStatusCode.OK, outcome.subscriptionView.toView())
            ReactivateSubscriptionOutcome.NotReactivatable ->
                call.respondProblem(
                    HttpStatusCode.NotFound,
                    ProblemTypes.NOT_REACTIVATABLE,
                    "no scheduled non-renewal to resume",
                )
        }
    }
}
