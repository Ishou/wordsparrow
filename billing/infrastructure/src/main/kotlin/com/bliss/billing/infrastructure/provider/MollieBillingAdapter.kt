package com.bliss.billing.infrastructure.provider

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CheckoutUrls
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.domain.BillingSource
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
    ): CheckoutUrls {
        val customerId =
            customerStore.findCustomerId(userId)
                ?: client.createCustomer(userId.toString()).also { customerStore.save(userId, it) }
        val payment =
            client.createFirstPayment(
                customerId = customerId,
                amountValue = config.firstPaymentAmount,
                currency = config.currency,
                description = config.description,
                redirectUrl = config.successUrl,
                cancelUrl = config.cancelUrl,
                webhookUrl = config.webhookUrl,
                metadata = metadataOf(userId, tier),
            )
        val checkoutUrl =
            requireNotNull(payment.checkoutUrl) { "Mollie payment ${payment.id} returned no checkout URL" }
        return CheckoutUrls(checkoutUrl = checkoutUrl, successUrl = config.successUrl, cancelUrl = config.cancelUrl)
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
    ): Map<String, String> = mapOf(USER_ID_KEY to userId.toString(), TIER_KEY to tier.value)

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
    }
}
