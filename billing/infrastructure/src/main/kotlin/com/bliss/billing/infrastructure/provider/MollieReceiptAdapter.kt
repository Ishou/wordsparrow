package com.bliss.billing.infrastructure.provider

import com.bliss.billing.application.ports.ProviderReceipt
import com.bliss.billing.application.ports.ReceiptProvider
import com.bliss.billing.application.ports.ReceiptsPage
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Currency
import java.util.UUID

/** Mollie [ReceiptProvider] (ADR-0078): resolves the caller's Customer, lists its payments as opaque receipts; no PII crosses this boundary. */
class MollieReceiptAdapter(
    private val client: MollieClient,
    private val customerStore: MollieCustomerStore,
) : ReceiptProvider {
    override suspend fun listReceipts(
        userId: UUID,
        cursor: String?,
        limit: Int,
    ): ReceiptsPage {
        // A never-checked-out user has no Mollie Customer yet, so there is nothing to list (ADR-0078).
        val customerId = customerStore.findCustomerId(userId) ?: return ReceiptsPage(emptyList(), null)
        val page = client.listCustomerPayments(customerId, cursor, limit)
        return ReceiptsPage(receipts = page.payments.map { it.toReceipt() }, nextCursor = page.nextCursor)
    }

    private fun MolliePaymentRecord.toReceipt(): ProviderReceipt =
        ProviderReceipt(
            // Mollie sets paidAt only once paid; fall back to createdAt so the required wire field is always present.
            paidAt = paidAt ?: createdAt,
            amountMinorUnits = toMinorUnits(amountValue, currency),
            currency = currency,
            status = status,
            // Mollie exposes no customer-facing receipt link on a payment (only a merchant dashboard URL); null per the schema.
            receiptUrl = null,
        )

    private fun toMinorUnits(
        value: String,
        currency: String,
    ): Int {
        val digits = runCatching { Currency.getInstance(currency).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
        return BigDecimal(value).movePointRight(digits).setScale(0, RoundingMode.HALF_UP).intValueExact()
    }
}
