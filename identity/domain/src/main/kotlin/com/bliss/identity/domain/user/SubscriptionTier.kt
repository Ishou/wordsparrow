package com.bliss.identity.domain.user

/** Internal authz input (ADR-0080); never surfaced on whoami/me. `wire` matches billing's open Tier string. */
enum class SubscriptionTier(
    val wire: String,
) {
    FREE("free"),
    SUBSCRIBER("subscriber"),
    ;

    companion object {
        /** Unknown or absent tier grants nothing, so it collapses to FREE. */
        fun fromWire(raw: String): SubscriptionTier = entries.firstOrNull { it.wire == raw } ?: FREE
    }
}
