package com.bliss.billing.domain

/** Legally-mandated pre-renewal notice kinds (ADR-0094 §3). `wire` is the persisted spelling in billing_renewal_notices. */
enum class RenewalNoticeKind(
    val wire: String,
) {
    CHATEL_PRE_RENEWAL("chatel_pre_renewal"),
    ;

    override fun toString(): String = wire

    companion object {
        fun fromWire(raw: String): RenewalNoticeKind =
            entries.firstOrNull { it.wire == raw.trim() }
                ?: throw IllegalArgumentException("Unknown renewal notice kind: $raw")
    }
}
