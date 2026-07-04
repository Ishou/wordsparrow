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

/** Sends the legally-mandated durable-medium emails on contract formation and on each renewal charge (ADR-0094 §1-2). */
interface ContractConfirmationNotifier {
    suspend fun confirmContractFormation(confirmation: ContractConfirmation)

    suspend fun confirmRenewal(receipt: RenewalReceipt)
}
