package com.bliss.billing.domain

/** The four legally-mandated durable-medium email kinds (ADR-0094 §1-3, §5). `wire` is the persisted spelling and the dedupe-key prefix in billing_outbound_emails. */
enum class OutboundEmailKind(
    val wire: String,
) {
    CONTRACT("contract"),
    RENEWAL("renewal"),
    CANCEL("cancel"),
    CHATEL("chatel"),
    ;

    override fun toString(): String = wire

    companion object {
        fun fromWire(raw: String): OutboundEmailKind =
            entries.firstOrNull { it.wire == raw.trim() }
                ?: throw IllegalArgumentException("Unknown outbound email kind: $raw")
    }
}
