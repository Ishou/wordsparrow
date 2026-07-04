package com.bliss.billing.domain

/** Delivery state of an outbox row (ADR-0094): pending until sent, or failed once retries are exhausted. `wire` is the persisted spelling in billing_outbound_emails. */
enum class OutboundEmailStatus(
    val wire: String,
) {
    PENDING("pending"),
    SENT("sent"),
    FAILED("failed"),
    ;

    override fun toString(): String = wire

    companion object {
        fun fromWire(raw: String): OutboundEmailStatus =
            entries.firstOrNull { it.wire == raw.trim() }
                ?: throw IllegalArgumentException("Unknown outbound email status: $raw")
    }
}
