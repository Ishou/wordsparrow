package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.ConsentRepository
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.OfferPrice
import com.bliss.billing.application.ports.OutboundEmail
import com.bliss.billing.application.ports.PreRenewalNotice
import com.bliss.billing.application.ports.RenewalReceipt
import com.bliss.billing.application.ports.SellerIdentity
import com.bliss.billing.application.ports.SubscriptionOffer
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.VatBreakdown
import org.slf4j.LoggerFactory
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/** Composes and sends the durable-medium contract-confirmation and renewal-receipt emails (ADR-0094 §1-2, CGV Art. 7 & 13). Copy is tutoiement; the seller block is factual. */
class LegalEmailNotifier(
    private val emailSender: EmailSender,
    private val provider: BillingProviderPort,
    private val consents: ConsentRepository,
    private val offer: SubscriptionOffer,
    private val seller: SellerIdentity = SellerIdentity(),
) : ContractConfirmationNotifier {
    private val log = LoggerFactory.getLogger(LegalEmailNotifier::class.java)

    override suspend fun confirmContractFormation(confirmation: ContractConfirmation) {
        val price = priceOrNull(confirmation.userId, confirmation.cadence) ?: return
        val to = emailOrNull(confirmation.userId) ?: return
        val waiverAcknowledged = consents.findLatest(confirmation.userId)?.withdrawalWaiver == true
        emailSender.send(
            contractEmail(
                to,
                confirmation.tier.value,
                confirmation.cadence,
                price,
                confirmation.formedAt,
                confirmation.periodEnd,
                waiverAcknowledged,
            ),
        )
    }

    override suspend fun confirmRenewal(receipt: RenewalReceipt) {
        val price = priceOrNull(receipt.userId, receipt.cadence) ?: return
        val to = emailOrNull(receipt.userId) ?: return
        emailSender.send(renewalEmail(to, receipt.tier.value, receipt.cadence, price, receipt.chargedAt, receipt.periodEnd))
    }

    override suspend fun confirmCancellation(confirmation: CancellationConfirmation) {
        val to = emailOrNull(confirmation.userId) ?: return
        emailSender.send(cancellationEmail(to, confirmation.tier.value, confirmation.canceledAt, confirmation.periodEnd))
    }

    override suspend fun sendChatelPreRenewalNotice(notice: PreRenewalNotice) {
        val price = priceOrNull(notice.userId, notice.cadence) ?: return
        val to = emailOrNull(notice.userId) ?: return
        emailSender.send(preRenewalEmail(to, notice.tier.value, notice.cadence, price, notice.periodEnd))
    }

    private suspend fun emailOrNull(userId: UUID): String? {
        val email = consents.findLatestEmail(userId) ?: provider.fetchCustomerEmail(userId)
        if (email.isNullOrBlank()) {
            log.warn("billing_email_skipped_no_address user_id={}", userId)
            return null
        }
        return email
    }

    private fun priceOrNull(
        userId: UUID,
        cadence: Cadence,
    ): OfferPrice? {
        val price = offer.priceFor(cadence)
        if (price == null) {
            log.error("billing_email_skipped_no_price user_id={} cadence={}", userId, cadence.wire)
            return null
        }
        return price
    }

    private fun contractEmail(
        to: String,
        tier: String,
        cadence: Cadence,
        price: OfferPrice,
        formedAt: Instant,
        periodEnd: Instant?,
        waiverAcknowledged: Boolean,
    ): OutboundEmail {
        val vat = VatBreakdown.ofTtc(price.ttcMinorUnits)
        val lines = mutableListOf<String>()
        lines += "Merci ! Ton abonnement WordSparrow est confirmé."
        lines += "Formule : $tier"
        lines += "Cadence : ${cadenceLabel(cadence)}"
        lines += "Prix : ${money(price)} TTC ${perPeriod(cadence)}"
        lines +=
            "dont TVA (${vat.ratePercent} %) : ${money(
                vat.vatMinorUnits,
                price.currency,
            )} — HT : ${money(vat.htMinorUnits, price.currency)}"
        lines += "Date : ${date(formedAt)}"
        if (periodEnd != null) lines += "Première échéance de renouvellement : ${date(periodEnd)}"
        lines +=
            "Reconduction tacite : ton abonnement est reconduit automatiquement à chaque échéance. Tu peux le résilier à tout moment depuis tes réglages, sans frais."
        if (waiverAcknowledged) {
            lines +=
                "Tu as demandé expressément que ton abonnement démarre immédiatement et tu as renoncé à ton droit de rétractation de 14 jours (art. L221-28 du Code de la consommation)."
        }
        lines += cgvLine()
        lines += sellerLine()
        return OutboundEmail(
            to = to,
            subject = "Confirmation de ton abonnement WordSparrow",
            htmlBody = html(lines),
            textBody = text(lines),
        )
    }

    private fun renewalEmail(
        to: String,
        tier: String,
        cadence: Cadence,
        price: OfferPrice,
        chargedAt: Instant,
        periodEnd: Instant?,
    ): OutboundEmail {
        val vat = VatBreakdown.ofTtc(price.ttcMinorUnits)
        val lines = mutableListOf<String>()
        lines += "Ton abonnement WordSparrow ($tier) a été renouvelé."
        lines +=
            "Montant : ${money(
                price,
            )} TTC — dont TVA (${vat.ratePercent} %) : ${money(
                vat.vatMinorUnits,
                price.currency,
            )}, HT : ${money(vat.htMinorUnits, price.currency)}"
        lines += "Date : ${date(chargedAt)}"
        if (periodEnd != null) lines += "Prochaine échéance : ${date(periodEnd)}"
        lines += sellerLine()
        return OutboundEmail(to = to, subject = "Reçu de ton abonnement WordSparrow", htmlBody = html(lines), textBody = text(lines))
    }

    private fun cancellationEmail(
        to: String,
        tier: String,
        canceledAt: Instant,
        periodEnd: Instant?,
    ): OutboundEmail {
        val lines = mutableListOf<String>()
        lines += "Ta demande de résiliation de l'abonnement WordSparrow ($tier) a bien été prise en compte."
        lines += "Date de la demande : ${date(canceledAt)}"
        if (periodEnd != null) {
            lines += "Date de fin d'effet : ${date(periodEnd)}"
            lines += "Tu gardes l'accès à toutes tes grilles jusqu'à cette date ; la période en cours n'est pas remboursée."
        }
        lines += "Aucune action de ta part n'est nécessaire ; ton abonnement ne sera pas reconduit."
        lines += sellerLine()
        return OutboundEmail(
            to = to,
            subject = "Confirmation de la résiliation de ton abonnement WordSparrow",
            htmlBody = html(lines),
            textBody = text(lines),
        )
    }

    private fun preRenewalEmail(
        to: String,
        tier: String,
        cadence: Cadence,
        price: OfferPrice,
        periodEnd: Instant,
    ): OutboundEmail {
        val lines = mutableListOf<String>()
        lines += "Ton abonnement WordSparrow ($tier) arrive à échéance le ${date(periodEnd)}."
        lines +=
            "Sauf action de ta part, il sera reconduit tacitement pour une nouvelle période ${perPeriodNoun(
                cadence,
            )} au prix de ${money(price)} TTC, prélevé le ${date(periodEnd)}."
        lines +=
            "Tu peux choisir de ne pas le reconduire : résilie à tout moment, sans frais, depuis tes réglages avant l'échéance."
        lines +=
            "Information légale (art. L215-1 du Code de la consommation) : tu es informé·e de ta faculté de ne pas reconduire ton abonnement."
        lines += sellerLine()
        return OutboundEmail(
            to = to,
            subject = "Ton abonnement WordSparrow arrive bientôt à échéance",
            htmlBody = html(lines),
            textBody = text(lines),
        )
    }

    private fun money(price: OfferPrice): String = money(price.ttcMinorUnits, price.currency)

    private fun money(
        minorUnits: Long,
        currency: String,
    ): String {
        val amount = String.format(Locale.FRANCE, "%,.2f", minorUnits / 100.0)
        return if (currency == "EUR") "$amount €" else "$amount $currency"
    }

    private fun cadenceLabel(cadence: Cadence): String = if (cadence == Cadence.YEARLY) "annuel" else "mensuel"

    private fun perPeriod(cadence: Cadence): String = if (cadence == Cadence.YEARLY) "par an" else "par mois"

    private fun perPeriodNoun(cadence: Cadence): String = if (cadence == Cadence.YEARLY) "annuelle" else "mensuelle"

    private fun date(instant: Instant): String = DATE_FORMAT.format(instant)

    private fun cgvLine(): String = "Conditions générales de vente : ${seller.cgvUrl}"

    private fun sellerLine(): String = "Vendeur : ${seller.legalName} — SIRET ${seller.siret} — TVA ${seller.vatNumber}"

    private fun text(lines: List<String>): String = lines.joinToString("\n")

    private fun html(lines: List<String>): String = lines.joinToString(separator = "") { "<p>$it</p>" }

    private companion object {
        val DATE_FORMAT: DateTimeFormatter =
            DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH).withZone(ZoneId.of("Europe/Paris"))
    }
}
