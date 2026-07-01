package com.bliss.identity.domain.user

/** Authz permission (ADR-0060 amendment). `wire` is the stable event-payload + API spelling. */
enum class Capability(
    val wire: String,
) {
    HINT("hint"),
    CONTRIBUER("contribuer"),
    BILLING_SUBSCRIBE("billing:subscribe"),
    GRILLES_ALL("grilles:all"),
    GRILLES_GENERATE("grilles:generate"),
    MULTIPLAYER_HOST_UNLIMITED("multiplayer:host-unlimited"),
}

// Entitlement = role-derived caps (ADR-0079) plus tier-derived caps (ADR-0080); null role == guest, null/free tier adds nothing.
fun capabilitiesFor(
    role: Role?,
    tier: SubscriptionTier? = null,
): Set<Capability> = roleCapabilities(role) + tierCapabilities(tier)

private fun roleCapabilities(role: Role?): Set<Capability> =
    when (role) {
        null -> emptySet()
        Role.PLAYER -> setOf(Capability.HINT)
        Role.MAINTAINER -> setOf(Capability.HINT, Capability.CONTRIBUER, Capability.BILLING_SUBSCRIBE)
    }

private fun tierCapabilities(tier: SubscriptionTier?): Set<Capability> =
    when (tier) {
        SubscriptionTier.SUBSCRIBER ->
            setOf(Capability.GRILLES_ALL, Capability.GRILLES_GENERATE, Capability.MULTIPLAYER_HOST_UNLIMITED)
        null, SubscriptionTier.FREE -> emptySet()
    }
