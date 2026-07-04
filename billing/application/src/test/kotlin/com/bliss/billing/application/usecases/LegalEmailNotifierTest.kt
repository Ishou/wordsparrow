package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.doesNotContain
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.OfferPrice
import com.bliss.billing.application.ports.PreRenewalNotice
import com.bliss.billing.application.ports.RenewalReceipt
import com.bliss.billing.application.ports.SubscriptionOffer
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeConsentRepository
import com.bliss.billing.application.testdoubles.FakeEmailSender
import com.bliss.billing.application.testdoubles.InMemoryOutboundEmailStore
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.CheckoutConsent
import com.bliss.billing.domain.OutboundEmailStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LegalEmailNotifierTest {
    private val userId = UUID.randomUUID()
    private val formedAt = Instant.parse("2026-07-04T09:30:00Z")
    private val now = Instant.parse("2026-07-04T10:00:00Z")

    private val store = InMemoryOutboundEmailStore()
    private val sender = FakeEmailSender()
    private val consents = FakeConsentRepository()
    private val provider = FakeBillingProvider().apply { defaultCustomerEmail = "joueuse@example.com" }
    private val offer =
        SubscriptionOffer(
            mapOf(
                Cadence.MONTHLY to OfferPrice(200, "EUR"),
                Cadence.YEARLY to OfferPrice(2000, "EUR"),
            ),
        )
    private val notifier =
        LegalEmailNotifier(store, sender, SubscriberEmailResolver(consents, provider), consents, offer, Clock { now })

    private fun contract(cadence: Cadence = Cadence.MONTHLY) =
        ContractConfirmation(userId, Tier.of("premium"), cadence, formedAt, Instant.parse("2026-08-04T00:00:00Z"))

    private suspend fun recordConsent(
        waiver: Boolean,
        email: String? = null,
    ) {
        consents.record(userId, CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = waiver), email, formedAt)
    }

    @Test
    fun `contract confirmation carries the recap, VAT split and seller identity`() =
        runTest {
            recordConsent(waiver = false)

            notifier.confirmContractFormation(contract(Cadence.YEARLY))

            val email = sender.sent.single()
            assertThat(email.to).isEqualTo("joueuse@example.com")
            assertThat(email.subject).isEqualTo("Confirmation de ton abonnement WordSparrow")
            assertThat(email.textBody).contains("Formule : Accès complet")
            assertThat(email.textBody).doesNotContain("premium")
            assertThat(email.textBody).doesNotContain("subscriber")
            assertThat(email.subject).doesNotContain("premium")
            assertThat(email.subject).doesNotContain("subscriber")
            assertThat(email.textBody).contains("annuel")
            assertThat(email.textBody).contains("20,00 €")
            assertThat(email.textBody).contains("TVA (20 %)")
            assertThat(email.textBody).contains("3,33 €")
            assertThat(email.textBody).contains("16,67 €")
            assertThat(email.textBody).contains("4 juillet 2026")
            assertThat(email.textBody).contains("Reconduction tacite")
            assertThat(email.textBody).contains("https://wordsparrow.io/conditions-abonnement")
            assertThat(email.textBody).contains("851 880 401 00019")
            assertThat(email.textBody).contains("FR63 851880401")
        }

    @Test
    fun `contract confirmation echoes the retractation waiver when it was accepted`() =
        runTest {
            recordConsent(waiver = true)

            notifier.confirmContractFormation(contract())

            assertThat(sender.sent.single().textBody).contains("renoncé à ton droit de rétractation")
        }

    @Test
    fun `contract confirmation omits the waiver line when it was not accepted`() =
        runTest {
            recordConsent(waiver = false)

            notifier.confirmContractFormation(contract())

            assertThat(sender.sent.single().textBody).doesNotContain("renoncé à ton droit de rétractation")
        }

    @Test
    fun `renewal receipt carries amount, VAT and seller identity under a distinct subject`() =
        runTest {
            notifier.confirmRenewal(
                RenewalReceipt(userId, Tier.of("premium"), Cadence.MONTHLY, formedAt, Instant.parse("2026-09-04T00:00:00Z")),
            )

            val email = sender.sent.single()
            assertThat(email.subject).isEqualTo("Reçu de ton abonnement WordSparrow")
            assertThat(email.textBody).contains("(Accès complet)")
            assertThat(email.textBody).doesNotContain("premium")
            assertThat(email.textBody).doesNotContain("subscriber")
            assertThat(email.textBody).contains("2,00 €")
            assertThat(email.textBody).contains("TVA (20 %)")
            assertThat(email.textBody).contains("851 880 401 00019")
        }

    @Test
    fun `cancellation confirmation states the end-of-effect date, retained access and seller identity`() =
        runTest {
            notifier.confirmCancellation(
                CancellationConfirmation(userId, Tier.of("premium"), formedAt, Instant.parse("2026-08-04T00:00:00Z")),
            )

            val email = sender.sent.single()
            assertThat(email.to).isEqualTo("joueuse@example.com")
            assertThat(email.subject).isEqualTo("Confirmation de la résiliation de ton abonnement WordSparrow")
            assertThat(email.textBody).contains("(Accès complet)")
            assertThat(email.textBody).doesNotContain("premium")
            assertThat(email.textBody).doesNotContain("subscriber")
            assertThat(email.textBody).contains("prise en compte")
            assertThat(email.textBody).contains("Date de fin d'effet : 4 août 2026")
            assertThat(email.textBody).contains("jusqu'à cette date")
            assertThat(email.textBody).contains("n'est pas remboursée")
            assertThat(email.textBody).contains("851 880 401 00019")
            assertThat(email.textBody).contains("FR63 851880401")
        }

    @Test
    fun `cancellation confirmation addresses the player with tutoiement`() =
        runTest {
            notifier.confirmCancellation(
                CancellationConfirmation(userId, Tier.of("premium"), formedAt, Instant.parse("2026-08-04T00:00:00Z")),
            )

            val body = sender.sent.single().textBody
            assertThat(Regex("\\bvous\\b", RegexOption.IGNORE_CASE).find(body)).isNull()
        }

    @Test
    fun `chatel pre-renewal notice states reconduction, the right not to renew, amount, echeance and seller`() =
        runTest {
            notifier.sendChatelPreRenewalNotice(
                PreRenewalNotice(userId, Tier.of("premium"), Cadence.YEARLY, Instant.parse("2026-08-15T00:00:00Z")),
            )

            val email = sender.sent.single()
            assertThat(email.subject).isEqualTo("Ton abonnement WordSparrow arrive bientôt à échéance")
            assertThat(email.textBody).contains("(Accès complet)")
            assertThat(email.textBody).doesNotContain("premium")
            assertThat(email.textBody).doesNotContain("subscriber")
            assertThat(email.textBody).contains("reconduit tacitement")
            assertThat(email.textBody).contains("ne pas le reconduire")
            assertThat(email.textBody).contains("20,00 €")
            assertThat(email.textBody).contains("15 août 2026")
            assertThat(email.textBody).contains("L215-1")
            assertThat(email.textBody).contains("851 880 401 00019")
            assertThat(Regex("\\bvous\\b", RegexOption.IGNORE_CASE).find(email.textBody)).isNull()
        }

    @Test
    fun `no cancellation email is sent when the address cannot be resolved`() =
        runTest {
            provider.setCustomerEmail(userId, null)

            notifier.confirmCancellation(
                CancellationConfirmation(userId, Tier.of("premium"), formedAt, Instant.parse("2026-08-04T00:00:00Z")),
            )

            assertThat(sender.sent).isEmpty()
        }

    @Test
    fun `no pre-renewal notice is sent when the address cannot be resolved`() =
        runTest {
            provider.setCustomerEmail(userId, null)

            notifier.sendChatelPreRenewalNotice(
                PreRenewalNotice(userId, Tier.of("premium"), Cadence.YEARLY, Instant.parse("2026-08-15T00:00:00Z")),
            )

            assertThat(sender.sent).isEmpty()
        }

    @Test
    fun `no email is sent when the address cannot be resolved`() =
        runTest {
            provider.setCustomerEmail(userId, null)
            recordConsent(waiver = true)

            notifier.confirmContractFormation(contract())

            assertThat(sender.sent).isEmpty()
        }

    @Test
    fun `copy addresses the player with tutoiement`() =
        runTest {
            recordConsent(waiver = true)

            notifier.confirmContractFormation(contract())

            val body = sender.sent.single().textBody
            assertThat(Regex("\\bvous\\b", RegexOption.IGNORE_CASE).find(body)).isNull()
        }

    @Test
    fun `contract confirmation prefers the stored checkout email over the provider`() =
        runTest {
            provider.setCustomerEmail(userId, "stale@example.com")
            recordConsent(waiver = false, email = "checkout@example.com")

            notifier.confirmContractFormation(contract())

            assertThat(sender.sent.single().to).isEqualTo("checkout@example.com")
        }

    @Test
    fun `contract confirmation falls back to the provider when no email was stored`() =
        runTest {
            provider.setCustomerEmail(userId, "provider@example.com")
            recordConsent(waiver = false, email = null)

            notifier.confirmContractFormation(contract())

            assertThat(sender.sent.single().to).isEqualTo("provider@example.com")
        }

    @Test
    fun `renewal receipt prefers the stored checkout email over the provider`() =
        runTest {
            provider.setCustomerEmail(userId, "stale@example.com")
            recordConsent(waiver = false, email = "checkout@example.com")

            notifier.confirmRenewal(
                RenewalReceipt(userId, Tier.of("premium"), Cadence.MONTHLY, formedAt, Instant.parse("2026-09-04T00:00:00Z")),
            )

            assertThat(sender.sent.single().to).isEqualTo("checkout@example.com")
        }

    @Test
    fun `cancellation confirmation prefers the stored checkout email over the provider`() =
        runTest {
            provider.setCustomerEmail(userId, "stale@example.com")
            recordConsent(waiver = false, email = "checkout@example.com")

            notifier.confirmCancellation(
                CancellationConfirmation(userId, Tier.of("premium"), formedAt, Instant.parse("2026-08-04T00:00:00Z")),
            )

            assertThat(sender.sent.single().to).isEqualTo("checkout@example.com")
        }

    @Test
    fun `chatel pre-renewal notice prefers the stored checkout email over the provider`() =
        runTest {
            provider.setCustomerEmail(userId, "stale@example.com")
            recordConsent(waiver = false, email = "checkout@example.com")

            notifier.sendChatelPreRenewalNotice(
                PreRenewalNotice(userId, Tier.of("premium"), Cadence.YEARLY, Instant.parse("2026-08-15T00:00:00Z")),
            )

            assertThat(sender.sent.single().to).isEqualTo("checkout@example.com")
        }

    @Test
    fun `contract confirmation enqueues one row and immediate send marks it sent`() =
        runTest {
            recordConsent(waiver = false)

            notifier.confirmContractFormation(contract())

            val row = store.rows.single()
            assertThat(row.dedupeKey).isEqualTo("contract:$userId:${contract().periodEnd?.toEpochMilli()}")
            assertThat(row.status).isEqualTo(OutboundEmailStatus.SENT)
            assertThat(row.sentAt).isEqualTo(now)
            assertThat(sender.sent).hasSize(1)
        }

    @Test
    fun `renewal receipt enqueues and sends exactly one row`() =
        runTest {
            notifier.confirmRenewal(
                RenewalReceipt(userId, Tier.of("premium"), Cadence.MONTHLY, formedAt, Instant.parse("2026-09-04T00:00:00Z")),
            )

            assertThat(store.rows.single().status).isEqualTo(OutboundEmailStatus.SENT)
        }

    @Test
    fun `cancellation confirmation enqueues and sends exactly one row`() =
        runTest {
            notifier.confirmCancellation(
                CancellationConfirmation(userId, Tier.of("premium"), formedAt, Instant.parse("2026-08-04T00:00:00Z")),
            )

            assertThat(store.rows.single().status).isEqualTo(OutboundEmailStatus.SENT)
        }

    @Test
    fun `chatel notice enqueues and sends exactly one row`() =
        runTest {
            notifier.sendChatelPreRenewalNotice(
                PreRenewalNotice(userId, Tier.of("premium"), Cadence.YEARLY, Instant.parse("2026-08-15T00:00:00Z")),
            )

            assertThat(store.rows.single().status).isEqualTo(OutboundEmailStatus.SENT)
        }

    @Test
    fun `a repeated notification enqueues only one row and does not resend`() =
        runTest {
            recordConsent(waiver = false)

            notifier.confirmContractFormation(contract())
            notifier.confirmContractFormation(contract())

            assertThat(store.rows).hasSize(1)
            assertThat(sender.sent).hasSize(1)
        }

    @Test
    fun `a send failure leaves the row pending with a backed-off next attempt`() =
        runTest {
            recordConsent(waiver = false)
            sender.failOnce = true

            notifier.confirmContractFormation(contract())

            val row = store.rows.single()
            assertThat(row.status).isEqualTo(OutboundEmailStatus.PENDING)
            assertThat(row.attempts).isEqualTo(1)
            assertThat(row.nextAttemptAt).isEqualTo(now.plus(EmailRetryPolicy.backoffAfter(1)))
            assertThat(row.lastError).isNotNull()
        }

    @Test
    fun `an unresolvable address leaves the enqueued row pending for the drain`() =
        runTest {
            provider.setCustomerEmail(userId, null)
            recordConsent(waiver = false)

            notifier.confirmContractFormation(contract())

            val row = store.rows.single()
            assertThat(row.status).isEqualTo(OutboundEmailStatus.PENDING)
            assertThat(sender.sent).isEmpty()
        }
}
