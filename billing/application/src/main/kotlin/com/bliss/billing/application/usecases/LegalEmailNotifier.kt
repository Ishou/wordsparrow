package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ConsentRepository
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.OfferPrice
import com.bliss.billing.application.ports.OutboundEmail
import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.application.ports.OutboundEmailStore
import com.bliss.billing.application.ports.PreRenewalNotice
import com.bliss.billing.application.ports.RenewalReceipt
import com.bliss.billing.application.ports.SellerIdentity
import com.bliss.billing.application.ports.SubscriptionOffer
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.OutboundEmailKind
import com.bliss.billing.domain.OutboundEmailStatus
import com.bliss.billing.domain.Tier
import com.bliss.billing.domain.VatBreakdown
import org.slf4j.LoggerFactory
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

/** Content of one durable-medium email before the recipient is known; the address is resolved at send time. */
data class RenderedEmail(
    val subject: String,
    val htmlBody: String,
    val textBody: String,
)

/** Composes the durable-medium legal emails (ADR-0094 §1-3, §5, CGV Art. 7/9/13/14.1) and hands them to the outbox for guaranteed delivery: each kind renders once, enqueues idempotently, then sends immediately; a failed or address-less send stays pending for the drain to retry. Copy is tutoiement; the seller block is factual. */
class LegalEmailNotifier(
    private val store: OutboundEmailStore,
    private val emailSender: EmailSender,
    private val resolver: SubscriberEmailResolver,
    private val consents: ConsentRepository,
    private val offer: SubscriptionOffer,
    private val clock: Clock,
    private val seller: SellerIdentity = SellerIdentity(),
) : ContractConfirmationNotifier {
    private val log = LoggerFactory.getLogger(LegalEmailNotifier::class.java)

    override suspend fun confirmContractFormation(confirmation: ContractConfirmation) {
        val price = requirePrice(confirmation.userId, confirmation.cadence, OutboundEmailKind.CONTRACT) ?: return
        val waiverAcknowledged = consents.findLatest(confirmation.userId)?.withdrawalWaiver == true
        enqueueAndSend(
            confirmation.userId,
            OutboundEmailKind.CONTRACT,
            dedupeKey(OutboundEmailKind.CONTRACT, confirmation.userId, confirmation.periodEnd),
            contractEmail(
                confirmation.tier,
                confirmation.cadence,
                price,
                confirmation.formedAt,
                confirmation.periodEnd,
                waiverAcknowledged,
            ),
        )
    }

    override suspend fun confirmRenewal(receipt: RenewalReceipt) {
        val price = requirePrice(receipt.userId, receipt.cadence, OutboundEmailKind.RENEWAL) ?: return
        enqueueAndSend(
            receipt.userId,
            OutboundEmailKind.RENEWAL,
            dedupeKey(OutboundEmailKind.RENEWAL, receipt.userId, receipt.periodEnd),
            renewalEmail(receipt.tier, receipt.cadence, price, receipt.chargedAt, receipt.periodEnd),
        )
    }

    override suspend fun confirmCancellation(confirmation: CancellationConfirmation) {
        enqueueAndSend(
            confirmation.userId,
            OutboundEmailKind.CANCEL,
            // canceledAt discriminates each résiliation event: cancel→reactivate→cancel keeps the same periodEnd, so without it the legally-required 2nd confirmation would collide on the dedupe key and never send.
            dedupeKey(
                OutboundEmailKind.CANCEL,
                confirmation.userId,
                confirmation.periodEnd,
                confirmation.canceledAt.toEpochMilli().toString(),
            ),
            cancellationEmail(confirmation.tier, confirmation.canceledAt, confirmation.periodEnd),
        )
    }

    override suspend fun sendChatelPreRenewalNotice(notice: PreRenewalNotice) {
        val price = requirePrice(notice.userId, notice.cadence, OutboundEmailKind.CHATEL) ?: return
        enqueueAndSend(
            notice.userId,
            OutboundEmailKind.CHATEL,
            dedupeKey(OutboundEmailKind.CHATEL, notice.userId, notice.periodEnd),
            preRenewalEmail(notice.tier, notice.cadence, price, notice.periodEnd),
        )
    }

    // Enqueue is the durable commitment (idempotent across webhook redeliveries); the immediate send is a best-effort head start that never blocks — the drain owns guaranteed delivery.
    private suspend fun enqueueAndSend(
        userId: UUID,
        kind: OutboundEmailKind,
        dedupeKey: String,
        rendered: RenderedEmail,
    ) {
        val now = clock.now()
        val record =
            OutboundEmailRecord(
                id = UUID.randomUUID(),
                userId = userId,
                kind = kind,
                dedupeKey = dedupeKey,
                subject = rendered.subject,
                htmlBody = rendered.htmlBody,
                textBody = rendered.textBody,
                status = OutboundEmailStatus.PENDING,
                attempts = 0,
                nextAttemptAt = now,
                lastError = null,
                createdAt = now,
                sentAt = null,
            )
        if (!store.enqueue(record)) return
        val to = resolver.resolve(userId)
        if (to == null) {
            log.warn("billing_email_pending_no_address kind={} user_id={}", kind.wire, userId)
            return
        }
        // Claim the row before the immediate send so a concurrent drain cannot also send it; a lost claim means the drain already owns delivery.
        if (!store.claim(record.id, now)) {
            log.info("billing_email_claim_lost_to_drain kind={} user_id={}", kind.wire, userId)
            return
        }
        runCatching { emailSender.send(OutboundEmail(to, rendered.subject, rendered.htmlBody, rendered.textBody)) }
            .onSuccess { store.markSent(record.id, clock.now()) }
            .onFailure { error ->
                store.recordFailure(record.id, 1, clock.now().plus(EmailRetryPolicy.backoffAfter(1)), errorText(error))
                log.warn("billing_email_deferred kind={} user_id={} attempt=1", kind.wire, userId, error)
            }
    }

    private fun dedupeKey(
        kind: OutboundEmailKind,
        userId: UUID,
        periodEnd: Instant?,
        discriminator: String? = null,
    ): String =
        buildString {
            append(kind.wire)
                .append(':')
                .append(userId)
                .append(':')
                .append(periodEnd?.toEpochMilli() ?: "none")
            if (discriminator != null) append(':').append(discriminator)
        }

    private fun errorText(error: Throwable): String = error.message ?: error.javaClass.simpleName

    // A missing price is un-renderable (a config regression: the offer must price both cadences). Do NOT enqueue — a poisoned dedupe key would block the corrected email after a redeploy — but fire the delivery-failure symptom (ADR-0032) so the mandated non-delivery is observable and a webhook redelivery re-sends once fixed.
    private fun requirePrice(
        userId: UUID,
        cadence: Cadence,
        kind: OutboundEmailKind,
    ): OfferPrice? {
        val price = offer.priceFor(cadence)
        if (price == null) {
            log.error("billing_email_undeliverable kind={} user_id={} cadence={} reason=no_price", kind.wire, userId, cadence.wire)
        }
        return price
    }

    private fun contractEmail(
        tier: Tier,
        cadence: Cadence,
        price: OfferPrice,
        formedAt: Instant,
        periodEnd: Instant?,
        waiverAcknowledged: Boolean,
    ): RenderedEmail {
        val vat = VatBreakdown.ofTtc(price.ttcMinorUnits)
        val lines = mutableListOf<String>()
        lines += "Merci ! Ton abonnement WordSparrow est confirmé."
        lines += "Formule : ${formuleLabel(tier)}"
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
        lines += mediationLine()
        lines += legalGuaranteeLine()
        lines += sellerLine()
        return rendered("Confirmation de ton abonnement WordSparrow", lines)
    }

    private fun renewalEmail(
        tier: Tier,
        cadence: Cadence,
        price: OfferPrice,
        chargedAt: Instant,
        periodEnd: Instant?,
    ): RenderedEmail {
        val vat = VatBreakdown.ofTtc(price.ttcMinorUnits)
        val lines = mutableListOf<String>()
        lines += "Ton abonnement WordSparrow (${formuleLabel(tier)}) a été renouvelé."
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
        return rendered("Reçu de ton abonnement WordSparrow", lines)
    }

    private fun cancellationEmail(
        tier: Tier,
        canceledAt: Instant,
        periodEnd: Instant?,
    ): RenderedEmail {
        val lines = mutableListOf<String>()
        lines += "Ta demande de résiliation de l'abonnement WordSparrow (${formuleLabel(tier)}) a bien été prise en compte."
        lines += "Date de la demande : ${date(canceledAt)}"
        if (periodEnd != null) {
            lines += "Date de fin d'effet : ${date(periodEnd)}"
            lines += "Tu gardes l'accès à toutes tes grilles jusqu'à cette date ; la période en cours n'est pas remboursée."
        }
        lines += "Aucune action de ta part n'est nécessaire ; ton abonnement ne sera pas reconduit."
        lines += sellerLine()
        return rendered("Confirmation de la résiliation de ton abonnement WordSparrow", lines)
    }

    private fun preRenewalEmail(
        tier: Tier,
        cadence: Cadence,
        price: OfferPrice,
        periodEnd: Instant,
    ): RenderedEmail {
        val lines = mutableListOf<String>()
        lines += "Ton abonnement WordSparrow (${formuleLabel(tier)}) arrive à échéance le ${date(periodEnd)}."
        lines +=
            "Sauf action de ta part, il sera reconduit tacitement pour une nouvelle période ${perPeriodNoun(
                cadence,
            )} au prix de ${money(price)} TTC, prélevé le ${date(periodEnd)}."
        lines +=
            "Tu peux choisir de ne pas le reconduire : résilie à tout moment, sans frais, depuis tes réglages avant l'échéance."
        lines +=
            "Information légale (art. L215-1 du Code de la consommation) : tu es informé·e de ta faculté de ne pas reconduire ton abonnement."
        lines += sellerLine()
        return rendered("Ton abonnement WordSparrow arrive bientôt à échéance", lines)
    }

    private fun money(price: OfferPrice): String = money(price.ttcMinorUnits, price.currency)

    private fun money(
        minorUnits: Long,
        currency: String,
    ): String {
        val amount = String.format(Locale.FRANCE, "%,.2f", minorUnits / 100.0)
        return if (currency == "EUR") "$amount €" else "$amount $currency"
    }

    // French formule label for the durable-medium copy; the paid tier set is config-driven (ADR-0078), so any non-free tier reads as full access.
    private fun formuleLabel(tier: Tier): String = if (tier == Tier.free) "Version gratuite" else "Accès complet"

    private fun cadenceLabel(cadence: Cadence): String = if (cadence == Cadence.YEARLY) "annuel" else "mensuel"

    private fun perPeriod(cadence: Cadence): String = if (cadence == Cadence.YEARLY) "par an" else "par mois"

    private fun perPeriodNoun(cadence: Cadence): String = if (cadence == Cadence.YEARLY) "annuelle" else "mensuelle"

    private fun date(instant: Instant): String = DATE_FORMAT.format(instant)

    private fun cgvLine(): String = "Conditions générales de vente : ${seller.cgvUrl}"

    private fun mediationLine(): String =
        "En cas de litige non résolu, tu peux recourir gratuitement au médiateur de la consommation AME Conso, " +
            "197 boulevard Saint-Germain, 75007 Paris (https://www.mediationconso-ame.com)."

    private fun legalGuaranteeLine(): String =
        "Ton abonnement bénéficie de la garantie légale de conformité (art. L224-25-1 du Code de la consommation)."

    private fun sellerLine(): String =
        "Vendeur : ${seller.legalName}, ${seller.postalAddress} — SIRET ${seller.siret} — TVA ${seller.vatNumber} — " +
            "Contact : ${seller.contactEmail}"

    private fun rendered(
        subject: String,
        lines: List<String>,
    ): RenderedEmail = RenderedEmail(subject, lines.joinToString(separator = "") { "<p>$it</p>" }, lines.joinToString("\n"))

    private companion object {
        val DATE_FORMAT: DateTimeFormatter =
            DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH).withZone(ZoneId.of("Europe/Paris"))
    }
}
