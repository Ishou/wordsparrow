package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.ReceiptProvider
import com.bliss.billing.application.ports.ReceiptsPage
import java.util.UUID

/** Lists the caller's own payment receipts for `GET /v1/receipts`, newest-first; clamps the page size and normalises a blank cursor (ADR-0078). */
class ListReceipts(
    private val provider: ReceiptProvider,
) {
    suspend fun execute(
        userId: UUID,
        cursor: String?,
        limit: Int,
    ): ReceiptsPage =
        provider.listReceipts(
            userId = userId,
            cursor = cursor?.takeIf { it.isNotBlank() },
            limit = limit.coerceIn(MIN_LIMIT, MAX_LIMIT),
        )

    private companion object {
        const val MIN_LIMIT = 1
        const val MAX_LIMIT = 100
    }
}
