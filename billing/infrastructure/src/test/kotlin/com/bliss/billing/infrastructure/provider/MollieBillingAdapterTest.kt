package com.bliss.billing.infrastructure.provider

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class MollieBillingAdapterTest {
    private val userId = UUID.fromString("018f9d4e-0000-7000-8000-000000000001")
    private val tier = Tier.of("premium")
    private val config =
        MollieConfig(
            apiKey = "test_dummy",
            currency = "EUR",
            firstPaymentAmount = "0.00",
            description = "WordSparrow abonnement",
            successUrl = "https://app.test/merci",
            cancelUrl = "https://app.test/abonnement",
            webhookUrl = "https://api.test/v1/billing/webhook",
        )

    private fun adapter(
        client: FakeMollieClient,
        store: InMemoryMollieCustomerStore,
    ) = MollieBillingAdapter(client, store, config)

    private fun metadata() = mapOf("userId" to userId.toString(), "tier" to "premium")

    @Test
    fun `createCheckout creates a customer when absent and returns hosted urls`() =
        runTest {
            val client = FakeMollieClient().apply { nextCustomerId = "cust_new" }
            val store = InMemoryMollieCustomerStore()

            val urls = adapter(client, store).createCheckout(userId, tier)

            assertThat(urls.checkoutUrl).isEqualTo("https://checkout.test/1")
            assertThat(urls.successUrl).isEqualTo(config.successUrl)
            assertThat(urls.cancelUrl).isEqualTo(config.cancelUrl)
            assertThat(client.createdCustomers).containsExactly(userId.toString())
            assertThat(store.saved[userId]).isEqualTo("cust_new")
            assertThat(client.lastPaymentCustomerId).isEqualTo("cust_new")
            assertThat(client.lastPaymentMetadata).isEqualTo(metadata())
            assertThat(client.lastPaymentAmount).isEqualTo("0.00")
        }

    @Test
    fun `createCheckout reuses the stored customer for a returning user`() =
        runTest {
            val client = FakeMollieClient()
            val store = InMemoryMollieCustomerStore(mapOf(userId to "cust_existing"))

            adapter(client, store).createCheckout(userId, tier)

            assertThat(client.createdCustomers).isEmpty()
            assertThat(client.lastPaymentCustomerId).isEqualTo("cust_existing")
        }

    @Test
    fun `createCheckout fails when the provider returns no checkout url`() =
        runTest {
            val client =
                FakeMollieClient().apply {
                    firstPayment = firstPayment.copy(checkoutUrl = null)
                }
            val result = runCatching { adapter(client, InMemoryMollieCustomerStore()).createCheckout(userId, tier) }
            assertThat(result.exceptionOrNull()).isNotNull().isInstanceOf(IllegalArgumentException::class)
        }

    @Test
    fun `createSubscription creates the recurring subscription against the first payment mandate`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "paid", null, "cust_x", null, metadata(), mandateId = "mdt_1")
            val nextPayment = Instant.parse("2026-07-29T00:00:00Z")
            client.nextSubscription = MollieSubscription("sub_y", "cust_x", "active", nextPayment, metadata())

            val state = adapter(client, InMemoryMollieCustomerStore()).createSubscription(userId, "tr_1", tier)

            assertThat(client.lastSubscriptionMandateId).isEqualTo("mdt_1")
            assertThat(client.lastSubscriptionInterval).isEqualTo("1 month")
            assertThat(state.externalRef).isEqualTo("cust_x:sub_y")
            assertThat(state.userId).isEqualTo(userId)
            assertThat(state.tier).isEqualTo(tier)
            assertThat(state.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(state.source).isEqualTo(BillingSource.MOLLIE)
            assertThat(state.periodEnd).isEqualTo(nextPayment)
        }

    @Test
    fun `createSubscription fails when the first payment established no mandate`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "paid", null, "cust_x", null, metadata(), mandateId = null)

            val result = runCatching { adapter(client, InMemoryMollieCustomerStore()).createSubscription(userId, "tr_1", tier) }

            assertThat(result.exceptionOrNull()).isNotNull().isInstanceOf(IllegalArgumentException::class)
            assertThat(client.createdSubscriptions).isEmpty()
        }

    @Test
    fun `fetchByReference maps a paid first payment to an active state keyed by the payment id`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "paid", null, "cust_x", null, metadata())

            val state = adapter(client, InMemoryMollieCustomerStore()).fetchByReference("tr_1")

            assertThat(state).isNotNull()
            assertThat(state!!.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(state.externalRef).isEqualTo("tr_1")
            assertThat(state.userId).isEqualTo(userId)
            assertThat(state.tier).isEqualTo(tier)
            assertThat(state.source).isEqualTo(BillingSource.MOLLIE)
            assertThat(state.periodEnd).isNull()
        }

    @Test
    fun `fetchByReference keys a paid payment with a subscription by the customer-subscription composite`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "paid", null, "cust_x", "sub_y", metadata())

            val state = adapter(client, InMemoryMollieCustomerStore()).fetchByReference("tr_1")

            assertThat(state!!.externalRef).isEqualTo("cust_x:sub_y")
        }

    @Test
    fun `fetchByReference returns null for a not-yet-paid payment`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "open", "https://checkout", "cust_x", null, metadata())

            assertThat(adapter(client, InMemoryMollieCustomerStore()).fetchByReference("tr_1")).isNull()
        }

    @Test
    fun `fetchByReference maps a failed payment to expired`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "failed", null, "cust_x", null, metadata())

            assertThat(adapter(client, InMemoryMollieCustomerStore()).fetchByReference("tr_1")!!.status)
                .isEqualTo(SubscriptionStatus.EXPIRED)
        }

    @Test
    fun `fetchByReference returns null when the provider has no such resource`() =
        runTest {
            assertThat(adapter(FakeMollieClient(), InMemoryMollieCustomerStore()).fetchByReference("tr_missing")).isNull()
        }

    @Test
    fun `fetchByReference returns null when payment metadata cannot identify the user`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] = MolliePayment("tr_1", "paid", null, "cust_x", null, emptyMap())

            assertThat(adapter(client, InMemoryMollieCustomerStore()).fetchByReference("tr_1")).isNull()
        }

    @Test
    fun `fetchByReference returns null when payment metadata has an invalid tier value`() =
        runTest {
            val client = FakeMollieClient()
            client.payments["tr_1"] =
                MolliePayment(
                    "tr_1",
                    "paid",
                    null,
                    "cust_x",
                    null,
                    mapOf("userId" to userId.toString(), "tier" to "PREMIUM"),
                )

            assertThat(adapter(client, InMemoryMollieCustomerStore()).fetchByReference("tr_1")).isNull()
        }

    @Test
    fun `fetchByReference resolves a subscription composite to its authoritative state`() =
        runTest {
            val client = FakeMollieClient()
            val nextPayment = Instant.parse("2026-07-29T00:00:00Z")
            client.subscriptions["sub_y"] = MollieSubscription("sub_y", "cust_x", "active", nextPayment, metadata())

            val state = adapter(client, InMemoryMollieCustomerStore()).fetchByReference("cust_x:sub_y")

            assertThat(state!!.status).isEqualTo(SubscriptionStatus.ACTIVE)
            assertThat(state.externalRef).isEqualTo("cust_x:sub_y")
            assertThat(state.periodEnd).isEqualTo(nextPayment)
        }

    @Test
    fun `fetchByReference maps a suspended subscription to past due`() =
        runTest {
            val client = FakeMollieClient()
            client.subscriptions["sub_y"] = MollieSubscription("sub_y", "cust_x", "suspended", null, metadata())

            assertThat(adapter(client, InMemoryMollieCustomerStore()).fetchByReference("cust_x:sub_y")!!.status)
                .isEqualTo(SubscriptionStatus.PAST_DUE)
        }

    @Test
    fun `cancel cancels the mollie subscription parsed from the composite reference`() =
        runTest {
            val client = FakeMollieClient()

            adapter(client, InMemoryMollieCustomerStore()).cancel("cust_x:sub_y")

            assertThat(client.cancelCalls).containsExactly("cust_x" to "sub_y")
        }

    @Test
    fun `cancel is idempotent when the provider reports the subscription already gone`() =
        runTest {
            val client = FakeMollieClient().apply { goneSubscriptions.add("sub_y") }

            adapter(client, InMemoryMollieCustomerStore()).cancel("cust_x:sub_y")

            assertThat(client.cancelCalls).containsExactly("cust_x" to "sub_y")
        }

    @Test
    fun `cancel is a no-op when the reference has no provider subscription yet`() =
        runTest {
            val client = FakeMollieClient()

            adapter(client, InMemoryMollieCustomerStore()).cancel("tr_first")

            assertThat(client.cancelCalls).isEmpty()
        }
}
