package com.bliss.billing.domain

/** Stored subscription tier. The tier set is config/offer-driven and deferred (ADR-0078), so this is a validated string, not a closed enum. */
@JvmInline
value class Tier private constructor(
    val value: String,
) {
    override fun toString(): String = value

    companion object {
        val free: Tier = Tier("free")

        fun of(raw: String): Tier {
            val trimmed = raw.trim()
            require(trimmed.isNotBlank()) { "Tier must not be blank." }
            require(trimmed == trimmed.lowercase()) { "Tier must be lowercase: $trimmed" }
            return Tier(trimmed)
        }
    }
}
