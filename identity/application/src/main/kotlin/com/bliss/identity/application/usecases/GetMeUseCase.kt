package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.SubscriptionTierRepository
import com.bliss.identity.application.ports.UserProviderRepository
import com.bliss.identity.application.ports.UserRepository
import com.bliss.identity.domain.provider.Provider
import com.bliss.identity.domain.user.Capability
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.Role
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.capabilitiesFor
import java.time.Instant

data class GetMeQuery(
    val userId: UserId,
)

data class LinkedProviderView(
    val provider: Provider,
    val linkedAt: Instant,
)

data class GetMeResult(
    val userId: UserId,
    val displayName: DisplayName,
    val createdAt: Instant,
    val lastSeenAt: Instant,
    val role: Role,
    val capabilities: Set<Capability>,
    val linkedProviders: List<LinkedProviderView>,
    val email: String? = null,
)

sealed class GetMeError(
    message: String,
) : RuntimeException(message) {
    class UserNotFound : GetMeError("User does not exist.")
}

class GetMeUseCase(
    private val users: UserRepository,
    private val userProviders: UserProviderRepository,
    private val subscriptions: SubscriptionTierRepository = SubscriptionTierRepository.empty(),
) {
    suspend fun execute(query: GetMeQuery): GetMeResult {
        val user = users.findById(query.userId) ?: throw GetMeError.UserNotFound()
        val providers =
            userProviders.listForUser(query.userId).map { up ->
                LinkedProviderView(
                    provider = up.provider,
                    linkedAt = up.linkedAt,
                )
            }
        val tier = subscriptions.find(query.userId)?.tier
        return user.toResult(providers, tier)
    }

    private fun User.toResult(
        linkedProviders: List<LinkedProviderView>,
        tier: SubscriptionTier?,
    ): GetMeResult =
        GetMeResult(
            userId = id,
            displayName = displayName,
            createdAt = createdAt,
            lastSeenAt = lastSeenAt,
            role = role,
            capabilities = capabilitiesFor(role, tier),
            linkedProviders = linkedProviders,
            email = email,
        )
}
