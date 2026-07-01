package com.bliss.billing.application.ports

import java.time.Instant
import java.util.UUID

/** One payment receipt as non-identifying facts only; the provider stays system-of-record for the invoice PII (ADR-0078). */
data class ProviderReceipt(
    val paidAt: Instant,
    val amountMinorUnits: Int,
    val currency: String,
    val status: String,
    val receiptUrl: String?,
)

/** One page of the caller's receipts, newest-first; [nextCursor] is an opaque cursor or null on the last page (ADR-0003 §6). */
data class ReceiptsPage(
    val receipts: List<ProviderReceipt>,
    val nextCursor: String?,
)

/** Anti-corruption port over the provider's payment history for the caller's receipts list; provider shapes never leak past it (ADR-0078). */
interface ReceiptProvider {
    suspend fun listReceipts(
        userId: UUID,
        cursor: String?,
        limit: Int,
    ): ReceiptsPage
}
