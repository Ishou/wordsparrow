package com.bliss.identity.domain.oidc

import com.bliss.identity.domain.provider.Subject
import java.time.Instant

/** Claims kept after verification; email retained for invoicing (ADR-0082, supersedes ADR-0045), nullable; name/picture still dropped. */
data class OidcIdToken(
    val subject: Subject,
    val issuer: String,
    val audience: String,
    val issuedAt: Instant,
    val expiresAt: Instant,
    val nonce: String?,
    val email: String? = null,
)
