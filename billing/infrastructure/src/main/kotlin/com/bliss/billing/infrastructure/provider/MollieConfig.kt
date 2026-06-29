package com.bliss.billing.infrastructure.provider

/** Mollie adapter configuration: API key (`test_…`/`live_…`) is the sole test-vs-live switch; no code path differs (ADR-0078). */
data class MollieConfig(
    val apiKey: String,
    val currency: String,
    val firstPaymentAmount: String,
    val description: String,
    val successUrl: String,
    val cancelUrl: String,
    val webhookUrl: String,
) {
    companion object {
        private fun env(key: String): String? = System.getenv(key) ?: System.getProperty(key)

        /** Fail-fast at boot (ADR-0007): a missing API key aborts startup rather than failing the first checkout. */
        fun fromEnv(): MollieConfig {
            val apiKey = env("MOLLIE_API_KEY")
            require(!apiKey.isNullOrBlank()) { "MOLLIE_API_KEY is required for the billing Mollie adapter" }
            val successUrl = requireUrl("BILLING_CHECKOUT_SUCCESS_URL")
            val cancelUrl = requireUrl("BILLING_CHECKOUT_CANCEL_URL")
            val webhookUrl = requireUrl("BILLING_WEBHOOK_URL")
            return MollieConfig(
                apiKey = apiKey,
                currency = env("BILLING_CHECKOUT_CURRENCY") ?: "EUR",
                firstPaymentAmount = env("BILLING_CHECKOUT_AMOUNT") ?: "0.00",
                description = env("BILLING_CHECKOUT_DESCRIPTION") ?: "WordSparrow abonnement",
                successUrl = successUrl,
                cancelUrl = cancelUrl,
                webhookUrl = webhookUrl,
            )
        }

        private fun requireUrl(key: String): String {
            val value = env(key)
            require(!value.isNullOrBlank()) { "$key is required for the billing Mollie adapter" }
            return value
        }
    }
}
