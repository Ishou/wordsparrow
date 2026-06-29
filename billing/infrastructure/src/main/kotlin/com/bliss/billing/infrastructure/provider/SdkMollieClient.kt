package com.bliss.billing.infrastructure.provider

import com.mollie.mollie.Client
import com.mollie.mollie.models.components.Amount
import com.mollie.mollie.models.components.EntityCustomer
import com.mollie.mollie.models.components.Metadata
import com.mollie.mollie.models.components.PaymentRequest
import com.mollie.mollie.models.components.PaymentResponse
import com.mollie.mollie.models.components.Security
import com.mollie.mollie.models.components.SequenceType
import com.mollie.mollie.models.components.SubscriptionRequest
import com.mollie.mollie.models.components.SubscriptionResponse
import com.mollie.mollie.models.errors.APIException
import com.mollie.mollie.models.operations.GetPaymentRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.openapitools.jackson.nullable.JsonNullable
import java.time.LocalDate
import java.time.ZoneOffset

/** Sole Mollie SDK import (ADR-0078): blocking calls run on IO dispatcher, responses flattened to [MollieClient] primitives. */
class SdkMollieClient(
    private val sdk: Client,
) : MollieClient {
    constructor(config: MollieConfig) : this(
        Client
            .builder()
            .security(Security.builder().apiKey(config.apiKey).build())
            .build(),
    )

    override suspend fun createCustomer(userReference: String): String =
        withContext(Dispatchers.IO) {
            val response =
                sdk
                    .customers()
                    .create()
                    .entityCustomer(EntityCustomer.builder().metadata(metadataOf(userReference)).build())
                    .call()
            response.customerResponse().orElseThrow { IllegalStateException("Mollie returned no customer body") }.id()
        }

    override suspend fun createFirstPayment(
        customerId: String,
        amountValue: String,
        currency: String,
        description: String,
        redirectUrl: String,
        cancelUrl: String,
        webhookUrl: String,
        metadata: Map<String, String>,
    ): MolliePayment =
        withContext(Dispatchers.IO) {
            val request =
                PaymentRequest
                    .builder()
                    .description(description)
                    .amount(
                        Amount
                            .builder()
                            .currency(currency)
                            .value(amountValue)
                            .build(),
                    ).redirectUrl(redirectUrl)
                    .cancelUrl(cancelUrl)
                    .webhookUrl(webhookUrl)
                    .sequenceType(SequenceType.FIRST)
                    .customerId(customerId)
                    .metadata(metadataOf(metadata))
                    .build()
            val response =
                sdk
                    .payments()
                    .create()
                    .paymentRequest(request)
                    .call()
            response.paymentResponse().orElseThrow { IllegalStateException("Mollie returned no payment body") }.toDto()
        }

    override suspend fun getPayment(paymentId: String): MolliePayment? =
        withContext(Dispatchers.IO) {
            notFoundToNull {
                sdk
                    .payments()
                    .get()
                    .request(GetPaymentRequest.builder().paymentId(paymentId).build())
                    .call()
                    .paymentResponse()
                    .map { it.toDto() }
                    .orElse(null)
            }
        }

    override suspend fun createSubscription(
        customerId: String,
        mandateId: String,
        amountValue: String,
        currency: String,
        interval: String,
        description: String,
        webhookUrl: String,
        metadata: Map<String, String>,
    ): MollieSubscription =
        withContext(Dispatchers.IO) {
            val request =
                SubscriptionRequest
                    .builder()
                    .amount(
                        Amount
                            .builder()
                            .currency(currency)
                            .value(amountValue)
                            .build(),
                    ).interval(interval)
                    .description(description)
                    .mandateId(mandateId)
                    .webhookUrl(webhookUrl)
                    .metadata(metadataOf(metadata))
                    .build()
            sdk
                .subscriptions()
                .create()
                .customerId(customerId)
                .subscriptionRequest(request)
                .call()
                .subscriptionResponse()
                .orElseThrow { IllegalStateException("Mollie returned no subscription body") }
                .toDto()
        }

    override suspend fun getSubscription(
        customerId: String,
        subscriptionId: String,
    ): MollieSubscription? =
        withContext(Dispatchers.IO) {
            notFoundToNull {
                sdk
                    .subscriptions()
                    .get()
                    .customerId(customerId)
                    .subscriptionId(subscriptionId)
                    .call()
                    .subscriptionResponse()
                    .map { it.toDto() }
                    .orElse(null)
            }
        }

    override suspend fun cancelSubscription(
        customerId: String,
        subscriptionId: String,
    ) {
        withContext(Dispatchers.IO) {
            try {
                sdk
                    .subscriptions()
                    .cancel()
                    .customerId(customerId)
                    .subscriptionId(subscriptionId)
                    .call()
            } catch (e: APIException) {
                if (e.code() in GONE_CODES) throw MollieResourceGoneException("subscription $subscriptionId is gone (${e.code()})")
                throw e
            }
        }
    }

    private fun PaymentResponse.toDto(): MolliePayment =
        MolliePayment(
            id = id(),
            status = status().value(),
            checkoutUrl = links().checkout().map { it.href() }.orElse(null),
            customerId = customerId().orElse(null),
            subscriptionId = subscriptionId().toNullable(),
            metadata = metadata().toNullable()?.toStringMap() ?: emptyMap(),
            mandateId = mandateId().toNullable(),
        )

    private fun SubscriptionResponse.toDto(): MollieSubscription =
        MollieSubscription(
            id = id(),
            customerId = customerId(),
            status = status().value(),
            nextPaymentDate =
                nextPaymentDate().toNullable()?.let {
                    LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant()
                },
            metadata = metadata().orElse(null)?.toStringMap() ?: emptyMap(),
        )

    private fun <T> notFoundToNull(block: () -> T?): T? =
        try {
            block()
        } catch (e: APIException) {
            if (e.code() == NOT_FOUND) null else throw e
        }

    private fun Metadata.toStringMap(): Map<String, String> =
        (value() as? Map<*, *>)
            ?.entries
            ?.mapNotNull { (k, v) -> if (k != null && v != null) k.toString() to v.toString() else null }
            ?.toMap()
            ?: emptyMap()

    private fun <T> JsonNullable<T>.toNullable(): T? = if (isPresent) get() else null

    private fun metadataOf(value: String): Metadata = Metadata.of(value)

    private fun metadataOf(value: Map<String, String>): Metadata = Metadata.of(HashMap<String, Any>(value))

    private companion object {
        const val NOT_FOUND = 404
        val GONE_CODES = setOf(404, 410, 422)
    }
}
