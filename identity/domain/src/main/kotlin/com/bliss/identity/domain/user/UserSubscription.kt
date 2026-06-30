package com.bliss.identity.domain.user

import java.time.Instant

/** A user's persisted subscription tier (ADR-0080); last-write-wins is decided by [changedAt]. */
data class UserSubscription(
    val userId: UserId,
    val tier: SubscriptionTier,
    val changedAt: Instant,
)
