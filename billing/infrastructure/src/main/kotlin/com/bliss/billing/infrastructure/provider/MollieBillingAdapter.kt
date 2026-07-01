package com.bliss.billing.infrastructure.provider

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CheckoutUrls
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.Tier
import org.slf4j.LoggerFactory
import java.util.UUID

/** Mollie [BillingProviderPort] implementation (ADR-0078): hosted SAQ-A checkout, re-fetch-by-id webhook auth. */
class MollieBillingAdapter(
    private val client: MollieClient,
    private val customerStore: MollieCustomerStore,
    private val config: MollieConfig,
) : BillingProviderPort {
    private val log = LoggerFactory.getLogger(MollieBillingAdapter::class.java)

    override suspend fun createCheckout(
        userId: UUID,
        tier: Tier,
        cadence: Cadence,
    ): CheckoutUrls {
        val customerId = customerStore.findOrCreate(userId) { client.createCustomer(userId.toString()) }
        val payment =
            client.createFirstPayment(
                customerId = customerId,
                amountValue = config.firstPaymentAmount,
                currency = config.currency,
                description = config.description,
                redirectUrl = config.successUrl,
                cancelUrl = config.cancelUrl,
                webhookUrl = config.webhookUrl,
                // Cadence rides in metadata so the recurring subscription (created later, webhook-side) derives its price/interval server-side.
                metadata = metadataOf(userId, tier, cadence),
            )
        val checkoutUrl =
            requireNotNull(payment.checkoutUrl) { "Mollie payment ${payment.id} returned no checkout URL" }
        return CheckoutUrls(checkoutUrl = checkoutUrl, successUrl = config.successUrl, cancelUrl = config.cancelUrl)
    }

    override suspend fun createSubscription(
        userId: UUID,
        firstPaymentRef: String,
        tier: Tier,
    ): ProviderSubscriptionState {
        val ref = MollieReference.decode(firstPaymentRef)
        require(ref is MollieReference.Payment) { "createSubscription expects a first-payment reference: $firstPaymentRef" }
        val payment = requireNotNull(client.getPayment(ref.paymentId)) { "first payment $firstPaymentRef not found" }
        val customerId = requireNotNull(payment.customerId) { "first payment ${payment.id} has no customer" }
        val mandateId = requireNotNull(payment.mandateId) { "first payment ${payment.id} established no mandate" }
        // The cadence chosen at checkout was stored in the first-payment metadata; it drives the recurring price/interval.
        val cadence = cadenceFrom(payment.metadata)
        val subscription =
            client.createSubscription(
                customerId = customerId,
                mandateId = mandateId,
                amountValue = config.subscriptionAmountFor(cadence),
                currency = config.currency,
                interval = config.subscriptionIntervalFor(cadence),
                description = config.description,
                webhookUrl = config.webhookUrl,
                metadata = metadataOf(userId, tier, cadence),
            )
        val status =
            checkNotNull(MollieStatusMapping.fromSubscriptionStatus(subscription.status)) {
                "created subscription ${subscription.id} has non-actionable status ${subscription.status}"
            }
        return ProviderSubscriptionState(
            externalRef = MollieReference.subscription(subscription.customerId, subscription.id),
            userId = userId,
            tier = tier,
            status = status,
            source = BillingSource.MOLLIE,
            periodEnd = subscription.nextPaymentDate,
        )
    }

    override suspend fun fetchByReference(externalRef: String): ProviderSubscriptionState? =
        when (val ref = MollieReference.decode(externalRef)) {
            is MollieReference.Subscription ->
                client.getSubscription(ref.customerId, ref.subscriptionId)?.toState()
            is MollieReference.Payment ->
                client.getPayment(ref.paymentId)?.toState()
        }

    override suspend fun cancel(externalRef: String) {
        val ref = MollieReference.decode(externalRef)
        if (ref !is MollieReference.Subscription) return
        try {
            client.cancelSubscription(ref.customerId, ref.subscriptionId)
        } catch (e: MollieResourceGoneException) {
            log.info("mollie_cancel_noop external_ref={} reason={}", externalRef, e.message)
        }
    }

    override suspend fun listActiveSubscriptions(): List<ProviderSubscriptionRef> =
        client
            .listAllSubscriptions()
            .filter { MollieStatusMapping.fromSubscriptionStatus(it.status)?.isLive() == true }
            .map {
                ProviderSubscriptionRef(
                    externalRef = MollieReference.subscription(it.customerId, it.id),
                    userId = userIdFrom(it.metadata),
                )
            }

    private fun userIdFrom(metadata: Map<String, String>): UUID? =
        metadata[USER_ID_KEY]?.let { runCatching { UUID.fromString(it) }.getOrNull() }

    private fun MolliePayment.toState(): ProviderSubscriptionState? {
        val mapped = MollieStatusMapping.fromPaymentStatus(status) ?: return null
        val identity = identityFrom(metadata) ?: return null
        val ref =
            if (subscriptionId != null && customerId != null) {
                MollieReference.subscription(customerId, subscriptionId)
            } else {
                id
            }
        return ProviderSubscriptionState(
            externalRef = ref,
            userId = identity.first,
            tier = identity.second,
            status = mapped,
            source = BillingSource.MOLLIE,
            periodEnd = null,
        )
    }

    private fun MollieSubscription.toState(): ProviderSubscriptionState? {
        val mapped = MollieStatusMapping.fromSubscriptionStatus(status) ?: return null
        val identity = identityFrom(metadata) ?: return null
        return ProviderSubscriptionState(
            externalRef = MollieReference.subscription(customerId, id),
            userId = identity.first,
            tier = identity.second,
            status = mapped,
            source = BillingSource.MOLLIE,
            periodEnd = nextPaymentDate,
        )
    }

    private fun metadataOf(
        userId: UUID,
        tier: Tier,
        cadence: Cadence,
    ): Map<String, String> = mapOf(USER_ID_KEY to userId.toString(), TIER_KEY to tier.value, CADENCE_KEY to cadence.wire)

    // Legacy first payments (pre-cadence) carry no cadence key; default to monthly so their subscription still creates.
    private fun cadenceFrom(metadata: Map<String, String>): Cadence =
        metadata[CADENCE_KEY]?.let { runCatching { Cadence.fromWire(it) }.getOrNull() } ?: Cadence.default

    private fun identityFrom(metadata: Map<String, String>): Pair<UUID, Tier>? {
        val rawUserId = metadata[USER_ID_KEY] ?: return null
        val rawTier = metadata[TIER_KEY] ?: return null
        val userId = runCatching { UUID.fromString(rawUserId) }.getOrNull() ?: return null
        val tier = runCatching { Tier.of(rawTier) }.getOrNull() ?: return null
        return userId to tier
    }

    private companion object {
        const val USER_ID_KEY = "userId"
        const val TIER_KEY = "tier"
        const val CADENCE_KEY = "cadence"
    }
}
