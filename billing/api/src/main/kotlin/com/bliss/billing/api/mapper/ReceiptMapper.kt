package com.bliss.billing.api.mapper

import com.bliss.billing.api.dto.Receipt
import com.bliss.billing.api.dto.ReceiptsView
import com.bliss.billing.application.ports.ReceiptsPage

// Maps the application receipts page to the wire view; Instant.toString() emits the ISO-8601 date-time the schema requires.
fun ReceiptsPage.toView(): ReceiptsView =
    ReceiptsView(
        receipts =
            receipts.map {
                Receipt(
                    paidAt = it.paidAt.toString(),
                    amountMinorUnits = it.amountMinorUnits,
                    currency = it.currency,
                    status = it.status,
                    receiptUrl = it.receiptUrl,
                )
            },
        nextCursor = nextCursor,
    )
