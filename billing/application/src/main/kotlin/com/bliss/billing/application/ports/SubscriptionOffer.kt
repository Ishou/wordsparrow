package com.bliss.billing.application.ports

import com.bliss.billing.domain.Cadence

/** The published TTC price for one cadence, minor units in [currency] (ADR-0080: 2 €/mois, 20 €/an). */
data class OfferPrice(
    val ttcMinorUnits: Long,
    val currency: String,
)

/** Seller identity mentions the durable-medium receipt must carry (ADR-0094 §5, CGV Art. 7). Defaults are ISHO IT's legal identifiers. */
data class SellerIdentity(
    val legalName: String = "ISHO IT",
    val siret: String = "851 880 401 00019",
    val vatNumber: String = "FR63 851880401",
    val cgvUrl: String = "https://wordsparrow.io/conditions-abonnement",
)

/** Cadence to published TTC price; wired from the same source as the Mollie charge so the receipt can never misstate what was billed. */
class SubscriptionOffer(
    private val pricesByCadence: Map<Cadence, OfferPrice>,
) {
    fun priceFor(cadence: Cadence): OfferPrice? = pricesByCadence[cadence]
}
