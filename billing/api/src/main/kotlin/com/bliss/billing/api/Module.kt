package com.bliss.billing.api

import com.bliss.billing.api.auth.SessionMiddleware
import com.bliss.billing.api.config.BillingApiConfig
import com.bliss.billing.api.dto.ProblemDetails
import com.bliss.billing.api.routes.cancelSubscriptionRoute
import com.bliss.billing.api.routes.checkoutSessionRoute
import com.bliss.billing.api.routes.healthRoute
import com.bliss.billing.api.routes.subscriptionRoute
import com.bliss.billing.api.routes.webhookRoute
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.install
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respondText
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json
import org.slf4j.event.Level

// Install order mirrors survey/identity: CallLogging -> ContentNegotiation -> CORS -> StatusPages -> SessionMiddleware.
fun Application.billingApiModule(
    wiring: Wiring,
    config: BillingApiConfig,
) {
    install(CallLogging) {
        level = Level.INFO
    }

    install(ContentNegotiation) {
        json(WIRE_JSON)
    }

    installBillingCors(config)

    install(StatusPages) {
        exception<Throwable> { call, cause ->
            call.application.environment.log
                .error("unhandled_exception", cause)
            val problem =
                ProblemDetails(
                    type = "about:blank",
                    title = "internal error",
                    status = HttpStatusCode.InternalServerError.value,
                    detail = "An unexpected error occurred.",
                    instance = call.request.local.uri,
                )
            call.respondText(
                text = WIRE_JSON.encodeToString(ProblemDetails.serializer(), problem),
                contentType = ContentType.parse("application/problem+json"),
                status = HttpStatusCode.InternalServerError,
            )
        }
    }

    install(SessionMiddleware) {
        verifySession = wiring.verifySession
    }

    monitor.subscribe(ApplicationStopped) {
        wiring.closeNats()
        wiring.closeIdentityClient()
    }

    routing {
        healthRoute()
        checkoutSessionRoute(wiring.createCheckoutSession)
        cancelSubscriptionRoute(wiring.cancelSubscription)
        webhookRoute(wiring.ingestProviderEvent)
        subscriptionRoute(wiring.subscriptionQuery)
    }
}

// explicitNulls keeps periodEnd: null distinct from absence; encodeDefaults keeps any defaulted required field on the wire (ADR-0003 §6).
internal val WIRE_JSON: Json =
    Json {
        prettyPrint = false
        ignoreUnknownKeys = true
        explicitNulls = true
        encodeDefaults = true
    }

internal fun Application.installBillingCors(config: BillingApiConfig) {
    install(CORS) {
        for (origin in config.allowedOrigins) {
            val parsed = parseOrigin(origin)
            if (parsed != null) {
                allowHost(parsed.hostPort, schemes = listOf(parsed.scheme))
            }
        }
        // ADR-0048: wildcard predicate echoes request headers verbatim; never emits literal "*". Safe with credentials.
        allowHeaders { true }

        allowCredentials = true
        allowNonSimpleContentTypes = true
        maxAgeInSeconds = 600
    }
}

private data class ParsedOrigin(
    val scheme: String,
    val hostPort: String,
)

// Splits "https://host" -> ("https", "host"); returns null for unparseable input.
private fun parseOrigin(raw: String): ParsedOrigin? {
    val idx = raw.indexOf("://")
    if (idx <= 0) return null
    val scheme = raw.substring(0, idx)
    val rest = raw.substring(idx + 3).trimEnd('/')
    if (rest.isBlank()) return null
    return ParsedOrigin(scheme = scheme, hostPort = rest)
}
