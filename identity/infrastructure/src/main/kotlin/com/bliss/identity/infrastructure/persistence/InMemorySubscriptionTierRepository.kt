package com.bliss.identity.infrastructure.persistence

import com.bliss.identity.application.ports.SubscriptionTierRepository
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.UserSubscription
import java.util.concurrent.ConcurrentHashMap

class InMemorySubscriptionTierRepository : SubscriptionTierRepository {
    private val byId = ConcurrentHashMap<UserId, UserSubscription>()

    override suspend fun find(userId: UserId): UserSubscription? = byId[userId]

    override suspend fun upsert(subscription: UserSubscription) {
        byId[subscription.userId] = subscription
    }
}
