package com.bliss.identity.domain.user

// Normalization is trim + lowercase only (ADR-0091): no provider-specific canonicalization.
@JvmInline
value class EmailAddress private constructor(
    val value: String,
) {
    companion object {
        private val SHAPE = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

        fun of(raw: String): EmailAddress {
            val normalized = raw.trim().lowercase()
            require(normalized.length in 3..254 && SHAPE.matches(normalized)) { "Invalid email address." }
            return EmailAddress(normalized)
        }
    }
}
