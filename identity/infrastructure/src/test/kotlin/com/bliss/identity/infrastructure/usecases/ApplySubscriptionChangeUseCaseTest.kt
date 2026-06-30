package com.bliss.identity.infrastructure.usecases

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNull
import com.bliss.identity.application.usecases.ApplySubscriptionChangeUseCase
import com.bliss.identity.application.usecases.SubscriptionChange
import com.bliss.identity.application.usecases.SubscriptionChangeOutcome
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemorySubscriptionTierRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class ApplySubscriptionChangeUseCaseTest {
    private val now: Instant = Instant.parse("2026-06-30T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())

    private suspend fun newCase(
        seedUser: Boolean = true,
    ): Triple<ApplySubscriptionChangeUseCase, InMemoryUserRepository, InMemorySubscriptionTierRepository> {
        val users = InMemoryUserRepository()
        val subscriptions = InMemorySubscriptionTierRepository()
        if (seedUser) users.create(User(userId, DisplayName.of("Alice"), now, now))
        return Triple(ApplySubscriptionChangeUseCase(users, subscriptions), users, subscriptions)
    }

    private fun change(
        tier: String,
        status: String,
        changedAt: Instant,
    ) = SubscriptionChange(userId = userId, tier = tier, status = status, changedAt = changedAt)

    @Test
    fun `an active subscriber event persists the subscriber tier`() =
        runTest {
            val (sut, _, subscriptions) = newCase()
            val outcome = sut.execute(change("subscriber", "active", now))
            assertThat(outcome).isInstanceOf(SubscriptionChangeOutcome.Applied::class)
            assertThat(subscriptions.find(userId)?.tier).isEqualTo(SubscriptionTier.SUBSCRIBER)
        }

    @Test
    fun `an event for an unknown user is ignored`() =
        runTest {
            val (sut, _, subscriptions) = newCase(seedUser = false)
            val outcome = sut.execute(change("subscriber", "active", now))
            assertThat(outcome).isInstanceOf(SubscriptionChangeOutcome.UserNotFound::class)
            assertThat(subscriptions.find(userId)).isNull()
        }

    @Test
    fun `an older changedAt is ignored by last-write-wins`() =
        runTest {
            val (sut, _, subscriptions) = newCase()
            sut.execute(change("subscriber", "active", now))
            val outcome = sut.execute(change("free", "active", now.minusSeconds(60)))
            assertThat(outcome).isInstanceOf(SubscriptionChangeOutcome.Stale::class)
            assertThat(subscriptions.find(userId)?.tier).isEqualTo(SubscriptionTier.SUBSCRIBER)
        }

    @Test
    fun `an equal changedAt is ignored by last-write-wins`() =
        runTest {
            val (sut, _, subscriptions) = newCase()
            sut.execute(change("subscriber", "active", now))
            val outcome = sut.execute(change("free", "cancelled", now))
            assertThat(outcome).isInstanceOf(SubscriptionChangeOutcome.Stale::class)
            assertThat(subscriptions.find(userId)?.tier).isEqualTo(SubscriptionTier.SUBSCRIBER)
        }

    @Test
    fun `a newer cancelled event drops the user back to free`() =
        runTest {
            val (sut, _, subscriptions) = newCase()
            sut.execute(change("subscriber", "active", now))
            val outcome = sut.execute(change("subscriber", "cancelled", now.plusSeconds(60)))
            assertThat(outcome).isEqualTo(SubscriptionChangeOutcome.Applied(SubscriptionTier.FREE))
            assertThat(subscriptions.find(userId)?.tier).isEqualTo(SubscriptionTier.FREE)
        }

    @Test
    fun `an expired status maps to free regardless of the event tier`() =
        runTest {
            val (sut, _, subscriptions) = newCase()
            val outcome = sut.execute(change("subscriber", "expired", now))
            assertThat(outcome).isEqualTo(SubscriptionChangeOutcome.Applied(SubscriptionTier.FREE))
            assertThat(subscriptions.find(userId)?.tier).isEqualTo(SubscriptionTier.FREE)
        }
}
