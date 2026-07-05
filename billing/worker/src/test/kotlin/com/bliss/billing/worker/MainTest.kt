package com.bliss.billing.worker

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.application.ports.ProviderSubscriptionRef
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeConsentRepository
import com.bliss.billing.application.testdoubles.FakeEmailSender
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.InMemoryOutboundEmailStore
import com.bliss.billing.application.testdoubles.InMemoryRenewalNoticeLedger
import com.bliss.billing.application.testdoubles.RecordingContractConfirmationNotifier
import com.bliss.billing.application.usecases.SubscriberEmailResolver
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.ChatelWindow
import com.bliss.billing.domain.OutboundEmailKind
import com.bliss.billing.domain.OutboundEmailStatus
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class MainTest {
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val clock = FixedClock(Instant.parse("2026-06-29T12:00:00Z"))
    private val orphanUser = UUID.randomUUID()

    @Test
    fun `reconcileAndExit cancels orphans and returns success`() {
        provider.activeSubscriptions.add(ProviderSubscriptionRef(externalRef = "sub_orphan", userId = UUID.randomUUID()))

        val exit = reconcileAndExit(provider, repository, clock, Duration.ofHours(24))

        assertThat(exit).isEqualTo(0)
        assertThat(provider.cancelCalls).containsExactly("sub_orphan")
    }

    @Test
    fun `reconcileAndExit returns success on an empty provider`() {
        val exit = reconcileAndExit(provider, repository, clock, Duration.ofHours(24))

        assertThat(exit).isEqualTo(0)
    }

    @Test
    fun `sendRenewalNoticesAndExit sends the notice for an in-window annual sub and returns success`() =
        runTest {
            val userId = UUID.randomUUID()
            val periodEnd = clock.now().plus(Duration.ofDays(38))
            repository.save(
                Subscription(
                    userId = userId,
                    tier = Tier.of("supporter"),
                    status = SubscriptionStatus.ACTIVE,
                    source = BillingSource.MOLLIE,
                    externalRef = "sub_annual",
                    periodEnd = periodEnd,
                ),
            )
            provider.seed(
                ProviderSubscriptionState(
                    externalRef = "sub_annual",
                    userId = userId,
                    tier = Tier.of("supporter"),
                    status = SubscriptionStatus.ACTIVE,
                    source = BillingSource.MOLLIE,
                    periodEnd = periodEnd,
                    cadence = Cadence.YEARLY,
                ),
            )
            val notifier = RecordingContractConfirmationNotifier()

            val exit =
                sendRenewalNoticesAndExit(repository, provider, notifier, InMemoryRenewalNoticeLedger(), clock, ChatelWindow.DEFAULT)

            assertThat(exit).isEqualTo(0)
            assertThat(notifier.preRenewalNotices).hasSize(1)
        }

    @Test
    fun `drainEmailOutboxAndExit delivers a due pending row and returns success`() =
        runTest {
            val store = InMemoryOutboundEmailStore()
            val sender = FakeEmailSender()
            val consents = FakeConsentRepository()
            provider.setCustomerEmail(userId = orphanUser, email = "joueuse@example.com")
            store.enqueue(
                OutboundEmailRecord(
                    id = UUID.randomUUID(),
                    userId = orphanUser,
                    kind = OutboundEmailKind.CONTRACT,
                    dedupeKey = "contract:$orphanUser:1",
                    subject = "Sujet",
                    htmlBody = "<p>corps</p>",
                    textBody = "corps",
                    status = OutboundEmailStatus.PENDING,
                    attempts = 0,
                    nextAttemptAt = clock.now(),
                    lastError = null,
                    createdAt = clock.now(),
                    sentAt = null,
                ),
            )

            val exit = drainEmailOutboxAndExit(store, sender, SubscriberEmailResolver(consents, provider), clock)

            assertThat(exit).isEqualTo(0)
            assertThat(sender.sent).hasSize(1)
            assertThat(store.rows.single().status).isEqualTo(OutboundEmailStatus.SENT)
        }

    @Test
    fun `drainEmailOutboxAndExit returns success with an empty outbox`() =
        runTest {
            val exit =
                drainEmailOutboxAndExit(
                    InMemoryOutboundEmailStore(),
                    FakeEmailSender(),
                    SubscriberEmailResolver(FakeConsentRepository(), provider),
                    clock,
                )

            assertThat(exit).isEqualTo(0)
        }

    @Test
    fun `resolveBrevoConfig is null when email is disabled`() {
        assertThat(resolveBrevoConfig { null }).isEqualTo(null)
    }

    @Test
    fun `resolveBrevoConfig fails fast when email is enabled without a key`() {
        val env = mapOf("BILLING_EMAIL_ENABLED" to "true").let { m -> { k: String -> m[k] } }
        val result = runCatching { resolveBrevoConfig(env) }
        assertThat(result.exceptionOrNull()?.message ?: "").contains("BREVO_API_KEY")
    }

    @Test
    fun `resolveBrevoConfig builds the config with sender defaults when the key is present`() {
        val env =
            mapOf(
                "BILLING_EMAIL_ENABLED" to "true",
                "BREVO_API_KEY" to "xkeysib-test",
            ).let { m -> { k: String -> m[k] } }
        val config = resolveBrevoConfig(env)
        assertThat(config?.apiKey ?: "").isEqualTo("xkeysib-test")
        assertThat(config?.senderEmail ?: "").isEqualTo("abonnement@wordsparrow.io")
    }

    @Test
    fun `sendRenewalNoticesAndExit returns success with nothing to send`() =
        runTest {
            val exit =
                sendRenewalNoticesAndExit(
                    repository,
                    provider,
                    RecordingContractConfirmationNotifier(),
                    InMemoryRenewalNoticeLedger(),
                    clock,
                    ChatelWindow.DEFAULT,
                )

            assertThat(exit).isEqualTo(0)
        }
}
