package com.bliss.billing.infrastructure.provider

class FakeMollieClient : MollieClient {
    var nextCustomerId: String = "cust_created"
    var firstPayment: MolliePayment = MolliePayment("tr_first", "open", "https://checkout.test/1", "cust_created", null, emptyMap())

    val createdCustomers = mutableListOf<String>()
    val payments = mutableMapOf<String, MolliePayment>()
    val subscriptions = mutableMapOf<String, MollieSubscription>()
    val cancelCalls = mutableListOf<Pair<String, String>>()
    val goneSubscriptions = mutableSetOf<String>()

    var lastPaymentCustomerId: String? = null
    var lastPaymentMetadata: Map<String, String> = emptyMap()
    var lastPaymentAmount: String? = null

    override suspend fun createCustomer(userReference: String): String {
        createdCustomers.add(userReference)
        return nextCustomerId
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
    ): MolliePayment {
        lastPaymentCustomerId = customerId
        lastPaymentMetadata = metadata
        lastPaymentAmount = amountValue
        return firstPayment
    }

    override suspend fun getPayment(paymentId: String): MolliePayment? = payments[paymentId]

    override suspend fun getSubscription(
        customerId: String,
        subscriptionId: String,
    ): MollieSubscription? = subscriptions[subscriptionId]

    override suspend fun cancelSubscription(
        customerId: String,
        subscriptionId: String,
    ) {
        cancelCalls.add(customerId to subscriptionId)
        if (subscriptionId in goneSubscriptions) throw MollieResourceGoneException("gone $subscriptionId")
    }
}

class InMemoryMollieCustomerStore(
    seed: Map<java.util.UUID, String> = emptyMap(),
) : MollieCustomerStore {
    val saved = linkedMapOf<java.util.UUID, String>().apply { putAll(seed) }

    override suspend fun findCustomerId(userId: java.util.UUID): String? = saved[userId]

    override suspend fun findOrCreate(
        userId: java.util.UUID,
        lazyCreate: suspend () -> String,
    ): String = saved[userId] ?: lazyCreate().also { saved[userId] = it }

    override suspend fun save(
        userId: java.util.UUID,
        mollieCustomerId: String,
    ) {
        saved[userId] = mollieCustomerId
    }
}
