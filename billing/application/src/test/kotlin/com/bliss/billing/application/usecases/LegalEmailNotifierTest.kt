package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.doesNotContain
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.OfferPrice
import com.bliss.billing.application.ports.RenewalReceipt
import com.bliss.billing.application.ports.SubscriptionOffer
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeConsentRepository
import com.bliss.billing.application.testdoubles.FakeEmailSender
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.CheckoutConsent
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LegalEmailNotifierTest {
    private val userId = UUID.randomUUID()
    private val formedAt = Instant.parse("2026-07-04T09:30:00Z")

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
    private val notifier = LegalEmailNotifier(sender, provider, consents, offer)

    private fun contract(cadence: Cadence = Cadence.MONTHLY) =
        ContractConfirmation(userId, Tier.of("premium"), cadence, formedAt, Instant.parse("2026-08-04T00:00:00Z"))

    private suspend fun recordConsent(waiver: Boolean) {
        consents.record(userId, CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = waiver), formedAt)
    }

    @Test
    fun `contract confirmation carries the recap, VAT split and seller identity`() =
        runTest {
            recordConsent(waiver = false)

            notifier.confirmContractFormation(contract(Cadence.YEARLY))

            val email = sender.sent.single()
            assertThat(email.to).isEqualTo("joueuse@example.com")
            assertThat(email.subject).isEqualTo("Confirmation de ton abonnement WordSparrow")
            assertThat(email.textBody).contains("premium")
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
    fun `no cancellation email is sent when the address cannot be resolved`() =
        runTest {
            provider.setCustomerEmail(userId, null)

            notifier.confirmCancellation(
                CancellationConfirmation(userId, Tier.of("premium"), formedAt, Instant.parse("2026-08-04T00:00:00Z")),
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
}
