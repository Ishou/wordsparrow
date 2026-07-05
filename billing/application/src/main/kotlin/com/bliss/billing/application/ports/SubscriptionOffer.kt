package com.bliss.billing.application.ports

import com.bliss.billing.domain.Cadence

/** The published TTC price for one cadence, minor units in [currency] (ADR-0080: 2 €/mois, 20 €/an). */
data class OfferPrice(
    val ttcMinorUnits: Long,
    val currency: String,
)

/** Seller identity mentions the durable-medium confirmation must carry (ADR-0094 §5, CGV Art. 2 and 7; art. L221-5). Defaults are ISHO IT's legal identifiers. */
data class SellerIdentity(
    val legalName: String = "ISHO IT",
    val postalAddress: String = "32 rue Avaulée, 92240 Malakoff, France",
    val siret: String = "851 880 401 00019",
    val vatNumber: String = "FR63 851880401",
    val contactEmail: String = "contact@wordsparrow.io",
    val cgvUrl: String = "https://wordsparrow.io/conditions-abonnement",
)

/** Cadence to published TTC price; wired from the same source as the Mollie charge so the receipt can never misstate what was billed. */
class SubscriptionOffer(
    private val pricesByCadence: Map<Cadence, OfferPrice>,
) {
    fun priceFor(cadence: Cadence): OfferPrice? = pricesByCadence[cadence]
}
