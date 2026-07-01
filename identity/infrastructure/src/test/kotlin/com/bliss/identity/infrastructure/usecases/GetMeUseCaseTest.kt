package com.bliss.identity.infrastructure.usecases

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import com.bliss.identity.application.usecases.GetMeError
import com.bliss.identity.application.usecases.GetMeQuery
import com.bliss.identity.application.usecases.GetMeResult
import com.bliss.identity.application.usecases.GetMeUseCase
import com.bliss.identity.domain.provider.Provider
import com.bliss.identity.domain.provider.Subject
import com.bliss.identity.domain.provider.UserProvider
import com.bliss.identity.domain.user.Capability
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.Role
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.UserSubscription
import com.bliss.identity.infrastructure.persistence.InMemorySubscriptionTierRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserProviderRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class GetMeUseCaseTest {
    private val now: Instant = Instant.parse("2026-05-17T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())

    private fun newCase(
        users: InMemoryUserRepository = InMemoryUserRepository(),
        providers: InMemoryUserProviderRepository = InMemoryUserProviderRepository(),
    ): Triple<GetMeUseCase, InMemoryUserRepository, InMemoryUserProviderRepository> =
        Triple(GetMeUseCase(users, providers), users, providers)

    private suspend fun seedUser(users: InMemoryUserRepository): User {
        val u = User(userId, DisplayName.of("Alice"), now, now)
        users.create(u)
        return u
    }

    @Test
    fun `unknown user throws UserNotFound`() =
        runTest {
            val (sut, _, _) = newCase()
            assertFailure { sut.execute(GetMeQuery(userId)) }
                .isInstanceOf(GetMeError.UserNotFound::class)
        }

    @Test
    fun `known user with no linked providers returns empty list`() =
        runTest {
            val (sut, users, _) = newCase()
            seedUser(users)
            val result = sut.execute(GetMeQuery(userId))
            assertThat(result.userId).isEqualTo(userId)
            assertThat(result.displayName).isEqualTo(DisplayName.of("Alice"))
            assertThat(result.linkedProviders).isEmpty()
        }

    @Test
    fun `multiple linked providers are all returned`() =
        runTest {
            val (sut, users, providers) = newCase()
            seedUser(users)
            providers.link(
                UserProvider(userId, Provider.GOOGLE, Subject.of("g-sub"), "alice@example.com", now),
            )
            providers.link(
                UserProvider(userId, Provider.APPLE, Subject.of("a-sub"), null, now.plusSeconds(60)),
            )
            val result = sut.execute(GetMeQuery(userId))
            assertThat(result.linkedProviders).hasSize(2)
            val providerNames = result.linkedProviders.map { it.provider }
            assertThat(providerNames)
                .containsExactlyInAnyOrder(Provider.GOOGLE, Provider.APPLE)
        }

    @Test
    fun `result fields map user domain fields correctly`() =
        runTest {
            val (sut, users, _) = newCase()
            val u = User(userId, DisplayName.of("Bob"), now.minusSeconds(3600), now.minusSeconds(60))
            users.create(u)
            val result = sut.execute(GetMeQuery(userId))
            assertThat(result).isEqualTo(
                GetMeResult(
                    userId = userId,
                    displayName = DisplayName.of("Bob"),
                    createdAt = now.minusSeconds(3600),
                    lastSeenAt = now.minusSeconds(60),
                    role = Role.PLAYER,
                    capabilities = setOf(Capability.HINT),
                    linkedProviders = emptyList(),
                    email = null,
                ),
            )
        }

    @Test
    fun `email is exposed in the result when the user has one`() =
        runTest {
            val (sut, users, _) = newCase()
            users.create(User(userId, DisplayName.of("Alice"), now, now, email = "alice@example.com"))
            val result = sut.execute(GetMeQuery(userId))
            assertThat(result.email).isEqualTo("alice@example.com")
        }

    @Test
    fun `email is null when the user has none`() =
        runTest {
            val (sut, users, _) = newCase()
            seedUser(users)
            assertThat(sut.execute(GetMeQuery(userId)).email).isEqualTo(null)
        }

    @Test
    fun `maintainer result carries the billing subscribe capability`() =
        runTest {
            val (sut, users, _) = newCase()
            users.create(User(userId, DisplayName.of("Alice"), now, now, Role.MAINTAINER))
            val result = sut.execute(GetMeQuery(userId))
            assertThat(result.capabilities)
                .isEqualTo(setOf(Capability.HINT, Capability.CONTRIBUER, Capability.BILLING_SUBSCRIBE))
        }

    @Test
    fun `subscriber tier adds grilles capabilities to a player result`() =
        runTest {
            val users = InMemoryUserRepository()
            val providers = InMemoryUserProviderRepository()
            val subscriptions = InMemorySubscriptionTierRepository()
            users.create(User(userId, DisplayName.of("Alice"), now, now))
            subscriptions.upsert(UserSubscription(userId, SubscriptionTier.SUBSCRIBER, now))
            val sut = GetMeUseCase(users, providers, subscriptions)
            val result = sut.execute(GetMeQuery(userId))
            assertThat(result.capabilities)
                .containsExactlyInAnyOrder(Capability.HINT, Capability.GRILLES_ALL, Capability.GRILLES_GENERATE)
        }
}
