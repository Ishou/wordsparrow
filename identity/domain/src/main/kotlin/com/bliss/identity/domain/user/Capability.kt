package com.bliss.identity.domain.user

/** Authz permission (ADR-0060 amendment). `wire` is the stable event-payload + API spelling. */
enum class Capability(
    val wire: String,
) {
    BILLING_SUBSCRIBE("billing:subscribe"),
}

// Role-derived only; subscription-derived capabilities are deferred with the offer (ADR-0060 amendment).
fun capabilitiesFor(role: Role): Set<Capability> =
    when (role) {
        Role.MAINTAINER -> setOf(Capability.BILLING_SUBSCRIBE)
        Role.PLAYER -> emptySet()
    }
