package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import com.bliss.billing.application.testdoubles.FakeBillingProvider
import com.bliss.billing.application.testdoubles.FakeSubscriptionRepository
import com.bliss.billing.application.testdoubles.FixedClock
import com.bliss.billing.application.testdoubles.InMemoryRenewalNoticeLedger
import com.bliss.billing.application.testdoubles.RecordingContractConfirmationNotifier
import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.ChatelWindow
import com.bliss.billing.domain.RenewalNoticeKind
import com.bliss.billing.domain.SubscriptionStatus
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class SendRenewalNoticesTest {
    private val now = Instant.parse("2026-07-04T12:00:00Z")
    private val provider = FakeBillingProvider()
    private val repository = FakeSubscriptionRepository()
    private val notifier = RecordingContractConfirmationNotifier()
    private val ledger = InMemoryRenewalNoticeLedger()
    private val useCase =
        SendRenewalNotices(repository, provider, notifier, ledger, FixedClock(now), ChatelWindow.DEFAULT)

    private val userId = UUID.randomUUID()
    private val inWindowEnd = now.plus(Duration.ofDays(38))

    private suspend fun seed(
        externalRef: String,
        cadence: Cadence?,
        periodEnd: Instant?,
        status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
        user: UUID = userId,
    ) {
        repository.save(subscription(userId = user, externalRef = externalRef, status = status, periodEnd = periodEnd))
        provider.seed(providerState(userId = user, externalRef = externalRef, status = status, periodEnd = periodEnd, cadence = cadence))
    }

    @Test
    fun `sends the notice for an annual subscription inside the window`() =
        runTest {
            seed("sub_annual", Cadence.YEARLY, inWindowEnd)

            val summary = useCase.execute()

            assertThat(notifier.preRenewalNotices).hasSize(1)
            assertThat(notifier.preRenewalNotices.single().cadence).isEqualTo(Cadence.YEARLY)
            assertThat(notifier.preRenewalNotices.single().periodEnd).isEqualTo(inWindowEnd)
            assertThat(summary).isEqualTo(RenewalNoticeSummary(annualInWindow = 1, noticesSent = 1, alreadyNotified = 0))
        }

    @Test
    fun `records the notice keyed by user, external ref and period end`() =
        runTest {
            seed("sub_annual", Cadence.YEARLY, inWindowEnd)

            useCase.execute()

            assertThat(ledger.entries).containsExactly(
                InMemoryRenewalNoticeLedger.Entry(
                    userId = userId,
                    externalRef = "sub_annual",
                    periodEnd = inWindowEnd,
                    kind = RenewalNoticeKind.CHATEL_PRE_RENEWAL,
                    sentAt = now,
                ),
            )
        }

    @Test
    fun `excludes a monthly subscription even inside the window`() =
        runTest {
            seed("sub_monthly", Cadence.MONTHLY, inWindowEnd)

            val summary = useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
            assertThat(summary.annualInWindow).isEqualTo(0)
        }

    @Test
    fun `excludes an annual subscription whose term is still too far off`() =
        runTest {
            seed("sub_far", Cadence.YEARLY, now.plus(Duration.ofDays(60)))

            useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
        }

    @Test
    fun `excludes an annual subscription past the one-month deadline`() =
        runTest {
            seed("sub_late", Cadence.YEARLY, now.plus(Duration.ofDays(20)))

            useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
        }

    @Test
    fun `skips a subscription already notified for the same period`() =
        runTest {
            seed("sub_annual", Cadence.YEARLY, inWindowEnd)
            ledger.record(userId, "sub_annual", inWindowEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL, now.minusSeconds(3600))

            val summary = useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
            assertThat(summary).isEqualTo(RenewalNoticeSummary(annualInWindow = 1, noticesSent = 0, alreadyNotified = 1))
        }

    @Test
    fun `does not record the ledger when the notice cannot be delivered, so the next run retries`() =
        runTest {
            seed("sub_annual", Cadence.YEARLY, inWindowEnd)
            notifier.chatelSendSucceeds = false

            val summary = useCase.execute()

            assertThat(ledger.entries).isEmpty()
            assertThat(summary).isEqualTo(RenewalNoticeSummary(annualInWindow = 1, noticesSent = 0, alreadyNotified = 0))

            notifier.chatelSendSucceeds = true
            val retrySummary = useCase.execute()

            assertThat(notifier.preRenewalNotices).hasSize(1)
            assertThat(retrySummary).isEqualTo(RenewalNoticeSummary(annualInWindow = 1, noticesSent = 1, alreadyNotified = 0))
        }

    @Test
    fun `running twice sends only one notice`() =
        runTest {
            seed("sub_annual", Cadence.YEARLY, inWindowEnd)

            useCase.execute()
            useCase.execute()

            assertThat(notifier.preRenewalNotices).hasSize(1)
        }

    @Test
    fun `excludes a non-active annual subscription`() =
        runTest {
            seed("sub_pending", Cadence.YEARLY, inWindowEnd, status = SubscriptionStatus.PENDING_CANCELLATION)

            useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
        }

    @Test
    fun `excludes an annual subscription whose cadence is unknown at the provider`() =
        runTest {
            seed("sub_nocadence", cadence = null, periodEnd = inWindowEnd)

            useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
        }

    @Test
    fun `excludes a subscription the provider no longer knows`() =
        runTest {
            repository.save(subscription(userId = userId, externalRef = "sub_gone", periodEnd = inWindowEnd))

            useCase.execute()

            assertThat(notifier.preRenewalNotices).isEmpty()
        }
}
