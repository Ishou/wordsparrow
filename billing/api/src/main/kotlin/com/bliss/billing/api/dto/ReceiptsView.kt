package com.bliss.billing.api.dto

import kotlinx.serialization.Serializable

// One page of the caller's receipts; receipts + nextCursor are always on the wire (ADR-0003 §6).
@Serializable
data class ReceiptsView(
    val receipts: List<Receipt>,
    val nextCursor: String?,
)

// A single payment receipt: opaque non-identifying facts only (ADR-0078). receiptUrl is null when the provider exposes none.
@Serializable
data class Receipt(
    val paidAt: String,
    val amountMinorUnits: Int,
    val currency: String,
    val status: String,
    val receiptUrl: String?,
)
