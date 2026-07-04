package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isSameInstanceAs
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import java.util.UUID

class SubscriptionTest {
    private val period = Instant.parse("2026-07-29T00:00:00Z")

    private fun subscription(
        status: SubscriptionStatus,
        externalRef: String = "sub_abc",
        periodEnd: Instant? = period,
    ) = Subscription(
        userId = UUID.randomUUID(),
        tier = Tier.of("supporter"),
        status = status,
        source = BillingSource.MOLLIE,
        externalRef = externalRef,
        periodEnd = periodEnd,
    )

    @Test
    fun `requestCancellation moves a live subscription to pending cancellation`() {
        assertThat(subscription(SubscriptionStatus.ACTIVE).requestCancellation().status)
            .isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
        assertThat(subscription(SubscriptionStatus.PAST_DUE).requestCancellation().status)
            .isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
    }

    @Test
    fun `requestCancellation is rejected from a non-live state`() {
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.EXPIRED).requestCancellation() }
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.CANCELED).requestCancellation() }
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.PENDING_CANCELLATION).requestCancellation() }
    }

    @Test
    fun `confirmCanceled finalizes a pending cancellation`() {
        assertThat(subscription(SubscriptionStatus.PENDING_CANCELLATION).confirmCanceled().status)
            .isEqualTo(SubscriptionStatus.CANCELED)
    }

    @Test
    fun `confirmCanceled is idempotent on an already canceled subscription`() {
        val canceled = subscription(SubscriptionStatus.CANCELED)
        assertThat(canceled.confirmCanceled()).isSameInstanceAs(canceled)
    }

    @Test
    fun `confirmCanceled is rejected without a prior cancellation request`() {
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.ACTIVE).confirmCanceled() }
    }

    @Test
    fun `confirmCanceled retains the external ref`() {
        assertThat(subscription(SubscriptionStatus.PENDING_CANCELLATION).confirmCanceled().externalRef)
            .isEqualTo("sub_abc")
    }

    @Test
    fun `markPastDue moves an active subscription to past due`() {
        assertThat(subscription(SubscriptionStatus.ACTIVE).markPastDue().status)
            .isEqualTo(SubscriptionStatus.PAST_DUE)
    }

    @Test
    fun `markPastDue is rejected from a non-active state`() {
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.PENDING_CANCELLATION).markPastDue() }
    }

    @Test
    fun `expire is allowed from active and past due`() {
        assertThat(subscription(SubscriptionStatus.ACTIVE).expire().status).isEqualTo(SubscriptionStatus.EXPIRED)
        assertThat(subscription(SubscriptionStatus.PAST_DUE).expire().status).isEqualTo(SubscriptionStatus.EXPIRED)
    }

    @Test
    fun `renew extends the period of an active subscription`() {
        val next = period.plusSeconds(3600)
        val renewed = subscription(SubscriptionStatus.ACTIVE).renew(next)
        assertThat(renewed.status).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(renewed.periodEnd).isEqualTo(next)
    }

    @Test
    fun `renew reactivates a past due or expired subscription`() {
        val next = period.plusSeconds(3600)
        assertThat(subscription(SubscriptionStatus.PAST_DUE).renew(next).status).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(subscription(SubscriptionStatus.EXPIRED).renew(next).status).isEqualTo(SubscriptionStatus.ACTIVE)
    }

    @Test
    fun `renew is rejected on a canceled subscription`() {
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.CANCELED).renew(period) }
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.PENDING_CANCELLATION).renew(period) }
    }

    @Test
    fun `reactivate returns a pending cancellation to active with the new ref and period`() {
        val newEnd = period.plusSeconds(3600)
        val reactivated =
            subscription(SubscriptionStatus.PENDING_CANCELLATION, externalRef = "cust:sub_old").reactivate("cust:sub_new", newEnd)

        assertThat(reactivated.status).isEqualTo(SubscriptionStatus.ACTIVE)
        assertThat(reactivated.externalRef).isEqualTo("cust:sub_new")
        assertThat(reactivated.periodEnd).isEqualTo(newEnd)
    }

    @Test
    fun `reactivate is rejected on an already active subscription`() {
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.ACTIVE).reactivate("cust:sub_new", period) }
    }

    @Test
    fun `reactivate is rejected on a canceled subscription`() {
        assertThrows<IllegalArgumentException> { subscription(SubscriptionStatus.CANCELED).reactivate("cust:sub_new", period) }
    }

    @Test
    fun `blocksNewSubscription is true for a live subscription that is not pending cancellation`() {
        assertThat(subscription(SubscriptionStatus.ACTIVE).blocksNewSubscription(period)).isEqualTo(true)
        assertThat(subscription(SubscriptionStatus.PAST_DUE).blocksNewSubscription(period)).isEqualTo(true)
    }

    @Test
    fun `blocksNewSubscription is true for a pending cancellation whose period has not lapsed`() {
        val now = period.minusSeconds(3600)
        assertThat(subscription(SubscriptionStatus.PENDING_CANCELLATION, periodEnd = period).blocksNewSubscription(now))
            .isEqualTo(true)
    }

    @Test
    fun `blocksNewSubscription is false for a pending cancellation whose period has lapsed`() {
        val now = period.plusSeconds(3600)
        assertThat(subscription(SubscriptionStatus.PENDING_CANCELLATION, periodEnd = period).blocksNewSubscription(now))
            .isEqualTo(false)
        assertThat(subscription(SubscriptionStatus.PENDING_CANCELLATION, periodEnd = null).blocksNewSubscription(now))
            .isEqualTo(false)
    }

    @Test
    fun `blocksNewSubscription is false for terminal states`() {
        assertThat(subscription(SubscriptionStatus.CANCELED).blocksNewSubscription(period)).isEqualTo(false)
        assertThat(subscription(SubscriptionStatus.EXPIRED).blocksNewSubscription(period)).isEqualTo(false)
    }

    @Test
    fun `statusView projects the current state`() {
        val active = subscription(SubscriptionStatus.ACTIVE)
        assertThat(active.statusView()).isEqualTo(SubscriptionStatusView.from(active))
    }
}
