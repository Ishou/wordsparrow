package com.bliss.identity.domain.user

/** Authz permission (ADR-0060 amendment). `wire` is the stable event-payload + API spelling. */
enum class Capability(
    val wire: String,
) {
    HINT("hint"),
    CONTRIBUER("contribuer"),
    BILLING_SUBSCRIBE("billing:subscribe"),
}

// Role-derived only (ADR-0079 guest/player/maintainer matrix); null role == unauthenticated guest.
fun capabilitiesFor(role: Role?): Set<Capability> =
    when (role) {
        null -> emptySet()
        Role.PLAYER -> setOf(Capability.HINT)
        Role.MAINTAINER -> setOf(Capability.HINT, Capability.CONTRIBUER, Capability.BILLING_SUBSCRIBE)
    }
