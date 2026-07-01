package com.bliss.identity.domain.oidc

import com.bliss.identity.domain.provider.Subject
import java.time.Instant

/**
 * The subset of ID-token claims we keep after verification. `email` is retained
 * for legal invoicing (ADR-0082, superseding ADR-0045); `name` and `picture`
 * remain dropped. `email` is nullable — a provider may omit it on a given sign-in.
 */
data class OidcIdToken(
    val subject: Subject,
    val issuer: String,
    val audience: String,
    val issuedAt: Instant,
    val expiresAt: Instant,
    val nonce: String?,
    val email: String? = null,
)
