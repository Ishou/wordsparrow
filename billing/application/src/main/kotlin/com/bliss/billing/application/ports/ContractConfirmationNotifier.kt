package com.bliss.billing.application.ports

import com.bliss.billing.domain.Cadence
import com.bliss.billing.domain.Tier
import java.time.Instant
import java.util.UUID

/** Contract-formation facts for the durable-medium confirmation (ADR-0094 §1, CGV Art. 7 and 13). */
data class ContractConfirmation(
    val userId: UUID,
    val tier: Tier,
    val cadence: Cadence,
    val formedAt: Instant,
    val periodEnd: Instant?,
)

/** One recurring charge, for the per-charge B2C receipt on durable medium (ADR-0094 §5). */
data class RenewalReceipt(
    val userId: UUID,
    val tier: Tier,
    val cadence: Cadence,
    val chargedAt: Instant,
    val periodEnd: Instant?,
)

/** A confirmed résiliation, for the durable-medium confirmation of the request and its end-of-effect date (ADR-0094 §5, CGV Art. 14.1). */
data class CancellationConfirmation(
    val userId: UUID,
    val tier: Tier,
    val canceledAt: Instant,
    val periodEnd: Instant?,
)

/** Facts for the annual Chatel pre-renewal notice (art. L215-1, ADR-0094 §3, CGV Art. 9). [periodEnd] is the upcoming échéance the tacit reconduction lands on. */
data class PreRenewalNotice(
    val userId: UUID,
    val tier: Tier,
    val cadence: Cadence,
    val periodEnd: Instant,
)

/** Sends the legally-mandated durable-medium emails on contract formation, each renewal charge, résiliation, and before an annual reconduction (ADR-0094 §1-3, §5). */
interface ContractConfirmationNotifier {
    suspend fun confirmContractFormation(confirmation: ContractConfirmation)

    suspend fun confirmRenewal(receipt: RenewalReceipt)

    suspend fun confirmCancellation(confirmation: CancellationConfirmation)

    /** Returns true once the notice was actually delivered; false means the caller must not mark this notice period as sent. */
    suspend fun sendChatelPreRenewalNotice(notice: PreRenewalNotice): Boolean
}
