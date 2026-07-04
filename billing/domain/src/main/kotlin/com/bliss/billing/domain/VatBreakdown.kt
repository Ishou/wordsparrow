package com.bliss.billing.domain

/** VAT split of a TTC (tax-inclusive) amount in minor units; the receipt must disclose HT + TVA + TTC (ADR-0094 §5, CGV Art. 7). */
data class VatBreakdown(
    val ttcMinorUnits: Long,
    val vatMinorUnits: Long,
    val htMinorUnits: Long,
    val ratePercent: Int,
) {
    init {
        require(ttcMinorUnits >= 0) { "TTC amount must not be negative: $ttcMinorUnits" }
        require(ratePercent in 0..100) { "VAT rate must be a percentage: $ratePercent" }
    }

    companion object {
        const val STANDARD_RATE_PERCENT: Int = 20

        /** Extract the VAT from a tax-inclusive amount; TVA is rounded half-up and HT is the remainder so HT + TVA always equals TTC exactly. */
        fun ofTtc(
            ttcMinorUnits: Long,
            ratePercent: Int = STANDARD_RATE_PERCENT,
        ): VatBreakdown {
            require(ttcMinorUnits >= 0) { "TTC amount must not be negative: $ttcMinorUnits" }
            require(ratePercent in 0..100) { "VAT rate must be a percentage: $ratePercent" }
            val denominator = 100L + ratePercent
            val vat = (ttcMinorUnits * ratePercent + denominator / 2) / denominator
            return VatBreakdown(
                ttcMinorUnits = ttcMinorUnits,
                vatMinorUnits = vat,
                htMinorUnits = ttcMinorUnits - vat,
                ratePercent = ratePercent,
            )
        }
    }
}
