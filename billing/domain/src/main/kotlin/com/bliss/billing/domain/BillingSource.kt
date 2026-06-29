package com.bliss.billing.domain

/** Source that produced an entitlement, source-tagged from day one (ADR-0078). PLAY/APPLE land with their adapters (YAGNI until then). */
enum class BillingSource(
    val wire: String,
) {
    MOLLIE("mollie"),
    ;

    companion object {
        fun fromWire(raw: String): BillingSource =
            entries.firstOrNull { it.wire == raw }
                ?: throw IllegalArgumentException("Unknown billing source: $raw")
    }
}
