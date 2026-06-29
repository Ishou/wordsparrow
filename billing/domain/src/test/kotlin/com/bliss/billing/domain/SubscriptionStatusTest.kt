package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.billing.domain.SubscriptionStatus.ACTIVE
import com.bliss.billing.domain.SubscriptionStatus.CANCELED
import com.bliss.billing.domain.SubscriptionStatus.EXPIRED
import com.bliss.billing.domain.SubscriptionStatus.PAST_DUE
import com.bliss.billing.domain.SubscriptionStatus.PENDING_CANCELLATION
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SubscriptionStatusTest {
    private val legalTransitions: Set<Pair<SubscriptionStatus, SubscriptionStatus>> =
        setOf(
            ACTIVE to PAST_DUE,
            ACTIVE to EXPIRED,
            ACTIVE to PENDING_CANCELLATION,
            PAST_DUE to ACTIVE,
            PAST_DUE to EXPIRED,
            PAST_DUE to PENDING_CANCELLATION,
            EXPIRED to ACTIVE,
            PENDING_CANCELLATION to CANCELED,
        )

    @Test
    fun `every legal transition is permitted and returns the target`() {
        legalTransitions.forEach { (from, to) ->
            assertThat(from.canTransitionTo(to)).isTrue()
            assertThat(from.transition(to)).isEqualTo(to)
        }
    }

    @Test
    fun `every non-legal pair is rejected including self transitions`() {
        SubscriptionStatus.entries.forEach { from ->
            SubscriptionStatus.entries.forEach { to ->
                if ((from to to) !in legalTransitions) {
                    assertThat(from.canTransitionTo(to)).isFalse()
                    assertThrows<IllegalArgumentException> { from.transition(to) }
                }
            }
        }
    }

    @Test
    fun `pending cancellation is reachable from every live state`() {
        assertThat(ACTIVE.canTransitionTo(PENDING_CANCELLATION)).isTrue()
        assertThat(PAST_DUE.canTransitionTo(PENDING_CANCELLATION)).isTrue()
    }

    @Test
    fun `canceled is reachable only from pending cancellation`() {
        SubscriptionStatus.entries.forEach { from ->
            assertThat(from.canTransitionTo(CANCELED)).isEqualTo(from == PENDING_CANCELLATION)
        }
    }

    @Test
    fun `canceled is terminal`() {
        SubscriptionStatus.entries.forEach { to ->
            assertThat(CANCELED.canTransitionTo(to)).isFalse()
        }
    }

    @Test
    fun `wire roundtrips for every status`() {
        SubscriptionStatus.entries.forEach { status ->
            assertThat(SubscriptionStatus.fromWire(status.wire)).isEqualTo(status)
        }
    }

    @Test
    fun `wire spellings match the contract`() {
        assertThat(ACTIVE.wire).isEqualTo("active")
        assertThat(PAST_DUE.wire).isEqualTo("past_due")
        assertThat(CANCELED.wire).isEqualTo("canceled")
        assertThat(EXPIRED.wire).isEqualTo("expired")
        assertThat(PENDING_CANCELLATION.wire).isEqualTo("pending_cancellation")
    }

    @Test
    fun `fromWire rejects an unknown spelling`() {
        assertThrows<IllegalArgumentException> { SubscriptionStatus.fromWire("paused") }
    }

    @Test
    fun `isLive is true for every state except the terminal canceled and expired`() {
        SubscriptionStatus.entries.forEach { status ->
            assertThat(status.isLive()).isEqualTo(status != CANCELED && status != EXPIRED)
        }
    }
}
