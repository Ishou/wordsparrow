package com.bliss.survey.api.routes

import com.bliss.survey.api.auth.CONTRIBUER_CAPABILITY
import com.bliss.survey.api.auth.SessionMiddleware
import com.bliss.survey.api.auth.SessionPrincipal
import io.ktor.server.application.Application
import io.ktor.server.application.install
import java.util.UUID

// Cookie a maintainer presents: resolves to a principal holding `contribuer` (ADR-0079); the contribuer gate passes.
internal const val MAINTAINER_COOKIE: String = "valid-token"

// Cookie an authenticated player presents: resolves to a principal WITHOUT `contribuer`; the contribuer gate denies 403.
internal const val PLAYER_COOKIE: String = "player-token"

internal val MAINTAINER_ID: UUID = UUID.fromString("33333333-3333-7333-8333-333333333333")

// Installs the survey session middleware so MAINTAINER_COOKIE => maintainer caps, PLAYER_COOKIE => player caps, else anon.
internal fun Application.installCapabilitySession(userId: UUID = MAINTAINER_ID) {
    install(SessionMiddleware) {
        verifySession = { cookie ->
            when (cookie) {
                MAINTAINER_COOKIE -> SessionPrincipal(userId, setOf("hint", CONTRIBUER_CAPABILITY))
                PLAYER_COOKIE -> SessionPrincipal(userId, setOf("hint"))
                else -> null
            }
        }
    }
}
