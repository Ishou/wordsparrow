package com.bliss.survey.api

import com.bliss.survey.api.auth.CONTRIBUER_CAPABILITY
import com.bliss.survey.api.auth.CapabilitiesKey
import com.bliss.survey.api.dto.ProblemDetails
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall

// Stable RFC 7807 `type` URI for the contribuer authorization denial (ADR-0003 §6).
internal const val FORBIDDEN_PROBLEM_TYPE: String = "https://bliss.example/errors/forbidden"

// The contribuer gate (ADR-0079 §5): maintainer-only; anonymous and player callers (no `contribuer` cap) are denied 403.
internal suspend fun ApplicationCall.requireContribuer(): Boolean {
    val capabilities = attributes.getOrNull(CapabilitiesKey) ?: emptySet()
    if (CONTRIBUER_CAPABILITY !in capabilities) {
        respondProblem(
            HttpStatusCode.Forbidden,
            ProblemDetails(
                type = FORBIDDEN_PROBLEM_TYPE,
                title = "Forbidden",
                status = HttpStatusCode.Forbidden.value,
                detail = "La contribution est réservée aux mainteneurs.",
            ),
        )
        return false
    }
    return true
}
