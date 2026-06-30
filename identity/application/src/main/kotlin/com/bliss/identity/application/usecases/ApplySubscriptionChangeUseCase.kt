package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.SubscriptionTierRepository
import com.bliss.identity.application.ports.UserRepository
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.UserSubscription
import java.time.Instant

data class SubscriptionChange(
    val userId: UserId,
    val tier: String,
    val status: String,
    val changedAt: Instant,
)

sealed interface SubscriptionChangeOutcome {
    data class Applied(
        val tier: SubscriptionTier,
    ) : SubscriptionChangeOutcome

    /** Event's changedAt was not newer than the stored one (also covers JetStream redelivery). */
    data object Stale : SubscriptionChangeOutcome

    data object UserNotFound : SubscriptionChangeOutcome
}

class ApplySubscriptionChangeUseCase(
    private val users: UserRepository,
    private val subscriptions: SubscriptionTierRepository,
) {
    suspend fun execute(change: SubscriptionChange): SubscriptionChangeOutcome {
        if (users.findById(change.userId) == null) return SubscriptionChangeOutcome.UserNotFound
        val existing = subscriptions.find(change.userId)
        if (existing != null && !change.changedAt.isAfter(existing.changedAt)) return SubscriptionChangeOutcome.Stale
        val tier =
            if (change.status.lowercase() in TERMINAL_STATUSES) {
                SubscriptionTier.FREE
            } else {
                SubscriptionTier.fromWire(change.tier)
            }
        subscriptions.upsert(UserSubscription(change.userId, tier, change.changedAt))
        return SubscriptionChangeOutcome.Applied(tier)
    }

    private companion object {
        // A terminated subscription drops the user to free regardless of the event's tier field (ADR-0080).
        val TERMINAL_STATUSES = setOf("cancelled", "expired")
    }
}
