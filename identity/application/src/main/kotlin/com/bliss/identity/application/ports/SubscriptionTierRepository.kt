package com.bliss.identity.application.ports

import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.UserSubscription

interface SubscriptionTierRepository {
    suspend fun find(userId: UserId): UserSubscription?

    /** Unconditional upsert keyed by userId; last-write-wins is decided by the caller. */
    suspend fun upsert(subscription: UserSubscription)

    companion object {
        /** Null-object default so whoami/me read FREE for users that never received a subscription event. */
        fun empty(): SubscriptionTierRepository =
            object : SubscriptionTierRepository {
                override suspend fun find(userId: UserId): UserSubscription? = null

                override suspend fun upsert(subscription: UserSubscription) = Unit
            }
    }
}
