package com.bliss.billing.domain

/** Billing cadence chosen at checkout; `wire` is the stable spelling shared with the openapi contract (ADR-0080, 2 €/mois · 20 €/an). */
enum class Cadence(
    val wire: String,
) {
    MONTHLY("monthly"),
    YEARLY("yearly"),
    ;

    override fun toString(): String = wire

    companion object {
        /** The default when a caller omits the cadence (expand phase, ADR-0080 openapi). */
        val default: Cadence = MONTHLY

        fun fromWire(raw: String): Cadence =
            entries.firstOrNull { it.wire == raw.trim() }
                ?: throw IllegalArgumentException("Unknown cadence: $raw")
    }
}
