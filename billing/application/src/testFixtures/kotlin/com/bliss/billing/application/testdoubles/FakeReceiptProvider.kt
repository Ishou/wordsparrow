package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.ReceiptProvider
import com.bliss.billing.application.ports.ReceiptsPage
import java.util.UUID

/** In-memory [ReceiptProvider] recording the resolved query args so use-case and route tests run the real use case (CLAUDE.md: mock only at boundaries). */
class FakeReceiptProvider(
    var page: ReceiptsPage = ReceiptsPage(emptyList(), null),
) : ReceiptProvider {
    var lastUserId: UUID? = null
    var lastCursor: String? = null
    var lastLimit: Int? = null

    override suspend fun listReceipts(
        userId: UUID,
        cursor: String?,
        limit: Int,
    ): ReceiptsPage {
        lastUserId = userId
        lastCursor = cursor
        lastLimit = limit
        return page
    }
}
