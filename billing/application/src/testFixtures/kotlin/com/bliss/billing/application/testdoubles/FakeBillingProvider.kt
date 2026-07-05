package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CheckoutUrls
import com.bliss.billing.application.ports.NoValidMandateException
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.ports.ReactivationCadenceUnresolvableException
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID

/** In-memory BillingProviderPort: states are seeded per reference; `cancel` is idempotent and records calls; failures are configurable per reference. */
class FakeBillingProvider : BillingProviderPort {
    private val states = LinkedHashMap<String, ProviderSubscriptionState>()
    private val cancelFailures = mutableSetOf<String>()

    /** Subscriptions the provider still considers active, enumerated by the reconciliation backstop. */
    val activeSubscriptions = mutableListOf<ProviderSubscriptionRef>()

    val cancelCalls = mutableListOf<String>()
    val createSubscriptionCalls = mutableListOf<Triple<UUID, String, Tier>>()
    var lastCheckout: Triple<UUID, Tier, Cadence>? = null
    var lastCheckoutEmail: String? = null
    var checkoutUrls: CheckoutUrls = CheckoutUrls("https://checkout.test/abc", "https://app.test/merci", "https://app.test/abonnement")

    /** The recurring subscription `createSubscription` returns; defaults to an active subscription keyed by a composite ref derived from the first-payment ref. */
    var subscriptionToCreate: ProviderSubscriptionState? = null

    /** When true, the next `createCheckout` call throws and resets this flag, simulating a transient Mollie failure. */
    var failCheckoutOnce = false

    /** When true, the next `createSubscription` call throws and resets this flag, simulating a transient Mollie failure. */
    var failCreateSubscriptionOnce = false

    fun seed(state: ProviderSubscriptionState) {
        states[state.externalRef] = state
    }

    fun failCancelFor(externalRef: String) {
        cancelFailures.add(externalRef)
    }

    override suspend fun createCheckout(
        userId: UUID,
        tier: Tier,
        cadence: Cadence,
        email: String?,
    ): CheckoutUrls {
        lastCheckout = Triple(userId, tier, cadence)
        lastCheckoutEmail = email
        if (failCheckoutOnce) {
            failCheckoutOnce = false
            throw IllegalStateException("provider checkout failed (simulated)")
        }
        return checkoutUrls
    }

    override suspend fun createSubscription(
        userId: UUID,
        firstPaymentRef: String,
        tier: Tier,
    ): ProviderSubscriptionState {
        createSubscriptionCalls.add(Triple(userId, firstPaymentRef, tier))
        if (failCreateSubscriptionOnce) {
            failCreateSubscriptionOnce = false
            throw IllegalStateException("provider create-subscription failed (simulated)")
        }
        return subscriptionToCreate
            ?: ProviderSubscriptionState(
                externalRef = "cust:sub_$firstPaymentRef",
                userId = userId,
                tier = tier,
                status = SubscriptionStatus.ACTIVE,
                source = BillingSource.MOLLIE,
                periodEnd = null,
            )
    }

    override suspend fun fetchByReference(externalRef: String): ProviderSubscriptionState? = states[externalRef]

    /** Provider-held customer email per user; defaults to [defaultCustomerEmail], overridable (incl. to null) via [setCustomerEmail]. */
    var defaultCustomerEmail: String? = "joueur@example.com"
    private val customerEmails = mutableMapOf<UUID, String?>()

    fun setCustomerEmail(
        userId: UUID,
        email: String?,
    ) {
        customerEmails[userId] = email
    }

    override suspend fun fetchCustomerEmail(userId: UUID): String? =
        if (customerEmails.containsKey(userId)) customerEmails[userId] else defaultCustomerEmail

    override suspend fun cancel(externalRef: String) {
        if (externalRef in cancelFailures) throw IllegalStateException("provider cancel failed for $externalRef")
        cancelCalls.add(externalRef)
    }

    data class ReactivateCall(
        val userId: UUID,
        val currentExternalRef: String,
        val tier: Tier,
        val startDate: Instant,
    )

    val reactivateCalls = mutableListOf<ReactivateCall>()

    /** The state `reactivate` returns; defaults to an active subscription keyed by a fresh composite ref. */
    var subscriptionToReactivate: ProviderSubscriptionState? = null

    /** When true, the next `reactivate` throws [NoValidMandateException] and resets this flag, simulating a customer with no reusable mandate. */
    var failReactivateNoMandateOnce = false

    /** When true, the next `reactivate` throws [ReactivationCadenceUnresolvableException] and resets this flag, simulating an old subscription whose cadence can't be recovered. */
    var failReactivateCadenceUnresolvableOnce = false

    /** When true, the next `reactivate` throws a transient failure and resets this flag. */
    var failReactivateOnce = false

    override suspend fun reactivate(
        userId: UUID,
        currentExternalRef: String,
        tier: Tier,
        startDate: Instant,
    ): ProviderSubscriptionState {
        reactivateCalls.add(ReactivateCall(userId, currentExternalRef, tier, startDate))
        if (failReactivateNoMandateOnce) {
            failReactivateNoMandateOnce = false
            throw NoValidMandateException("no valid mandate for $userId")
        }
        if (failReactivateCadenceUnresolvableOnce) {
            failReactivateCadenceUnresolvableOnce = false
            throw ReactivationCadenceUnresolvableException("cannot resolve cadence for $userId")
        }
        if (failReactivateOnce) {
            failReactivateOnce = false
            throw IllegalStateException("provider reactivate failed (simulated)")
        }
        return subscriptionToReactivate
            ?: ProviderSubscriptionState(
                externalRef = "cust:sub_reactivated",
                userId = userId,
                tier = tier,
                status = SubscriptionStatus.ACTIVE,
                source = BillingSource.MOLLIE,
                periodEnd = startDate,
            )
    }

    override suspend fun listActiveSubscriptions(): List<ProviderSubscriptionRef> = activeSubscriptions.toList()
}
