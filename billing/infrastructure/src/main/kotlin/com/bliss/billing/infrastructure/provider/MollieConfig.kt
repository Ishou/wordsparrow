package com.bliss.billing.infrastructure.provider

import com.bliss.billing.domain.Cadence
import java.time.Period

/** Mollie adapter configuration: API key (`test_…`/`live_…`) is the sole test-vs-live switch; no code path differs (ADR-0078). */
data class MollieConfig(
    val apiKey: String,
    val currency: String,
    val description: String,
    val successUrl: String,
    val cancelUrl: String,
    val webhookUrl: String,
    // Per-cadence recurring price + Mollie interval; the amount/interval is server-derived from the cadence (ADR-0080, 2 €/mois · 20 €/an).
    val monthlyAmount: String = "2.00",
    val monthlyInterval: String = "1 month",
    val yearlyAmount: String = "20.00",
    val yearlyInterval: String = "12 months",
) {
    /** Recurring price for the chosen cadence, server-derived (the client never supplies an amount — ADR-0080). */
    fun subscriptionAmountFor(cadence: Cadence): String =
        when (cadence) {
            Cadence.MONTHLY -> monthlyAmount
            Cadence.YEARLY -> yearlyAmount
        }

    /** Mollie recurring interval for the chosen cadence (e.g. "1 month" / "12 months"). */
    fun subscriptionIntervalFor(cadence: Cadence): String =
        when (cadence) {
            Cadence.MONTHLY -> monthlyInterval
            Cadence.YEARLY -> yearlyInterval
        }

    /** One interval as a [Period]; the subscription starts this far after the first payment so period one is not billed twice. */
    fun startOffsetFor(cadence: Cadence): Period = parseInterval(subscriptionIntervalFor(cadence))

    /**
     * Customer-facing checkout label that discloses the recurrence up front (French consumer law, ADR-0080 factual framing):
     * e.g. "Abonnement WordSparrow — 20 €/an, renouvellement automatique".
     */
    fun descriptionFor(cadence: Cadence): String = "$description — ${priceLabelFor(cadence)}, renouvellement automatique"

    private fun priceLabelFor(cadence: Cadence): String {
        val amount = subscriptionAmountFor(cadence).removeSuffix(".00").replace('.', ',')
        val unit = if (currency == "EUR") "€" else currency
        val period = if (cadence == Cadence.YEARLY) "an" else "mois"
        return "$amount $unit/$period"
    }

    private fun parseInterval(interval: String): Period {
        val parts = interval.trim().split(Regex("\\s+"), limit = 2)
        val count = parts.getOrNull(0)?.toIntOrNull()
        require(parts.size == 2 && count != null) { "Unsupported Mollie interval: $interval" }
        return when {
            parts[1].startsWith("year") -> Period.ofYears(count)
            parts[1].startsWith("month") -> Period.ofMonths(count)
            parts[1].startsWith("week") -> Period.ofWeeks(count)
            parts[1].startsWith("day") -> Period.ofDays(count)
            else -> throw IllegalArgumentException("Unsupported Mollie interval unit: $interval")
        }
    }

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
                description = env("BILLING_CHECKOUT_DESCRIPTION") ?: "Abonnement WordSparrow",
                successUrl = successUrl,
                cancelUrl = cancelUrl,
                webhookUrl = webhookUrl,
                monthlyAmount = env("BILLING_MONTHLY_AMOUNT") ?: "2.00",
                monthlyInterval = env("BILLING_MONTHLY_INTERVAL") ?: "1 month",
                yearlyAmount = env("BILLING_YEARLY_AMOUNT") ?: "20.00",
                yearlyInterval = env("BILLING_YEARLY_INTERVAL") ?: "12 months",
            )
        }

        private fun requireUrl(key: String): String {
            val value = env(key)
            require(!value.isNullOrBlank()) { "$key is required for the billing Mollie adapter" }
            return value
        }
    }
}
