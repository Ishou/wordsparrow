package com.bliss.billing.infrastructure.provider

import assertk.assertThat
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class MollieReceiptAdapterTest {
    private val userId = UUID.fromString("55555555-5555-7555-8555-555555555555")
    private val client = FakeMollieClient()
    private val store = InMemoryMollieCustomerStore(mapOf(userId to "cust_1"))
    private val adapter = MollieReceiptAdapter(client, store)

    @Test
    fun `a user with no Mollie customer yet gets an empty page without calling the provider`() =
        runTest {
            val adapterNoCustomer = MollieReceiptAdapter(client, InMemoryMollieCustomerStore())

            val page = adapterNoCustomer.listReceipts(userId, cursor = null, limit = 20)

            assertThat(page.receipts).isEmpty()
            assertThat(page.nextCursor).isNull()
            assertThat(client.lastListCustomerId).isNull()
        }

    @Test
    fun `maps a paid payment converting the decimal amount to minor units`() =
        runTest {
            client.customerPayments =
                MolliePaymentPage(
                    payments =
                        listOf(
                            MolliePaymentRecord(
                                amountValue = "2.00",
                                currency = "EUR",
                                status = "paid",
                                paidAt = Instant.parse("2026-06-29T14:03:00Z"),
                                createdAt = Instant.parse("2026-06-29T14:00:00Z"),
                            ),
                        ),
                    nextCursor = null,
                )

            val receipt = adapter.listReceipts(userId, cursor = null, limit = 20).receipts.single()

            assertThat(receipt.amountMinorUnits).isEqualTo(200)
            assertThat(receipt.currency).isEqualTo("EUR")
            assertThat(receipt.status).isEqualTo("paid")
            assertThat(receipt.paidAt).isEqualTo(Instant.parse("2026-06-29T14:03:00Z"))
            // Mollie has no customer receipt link for a payment.
            assertThat(receipt.receiptUrl).isNull()
        }

    @Test
    fun `converts a larger decimal amount to minor units`() =
        runTest {
            client.customerPayments =
                MolliePaymentPage(
                    payments = listOf(record(amountValue = "20.00")),
                    nextCursor = null,
                )

            val receipt = adapter.listReceipts(userId, cursor = null, limit = 20).receipts.single()

            assertThat(receipt.amountMinorUnits).isEqualTo(2000)
        }

    @Test
    fun `falls back to createdAt when the payment has no paidAt`() =
        runTest {
            client.customerPayments =
                MolliePaymentPage(
                    payments =
                        listOf(
                            record(
                                status = "open",
                                paidAt = null,
                                createdAt = Instant.parse("2026-06-01T09:00:00Z"),
                            ),
                        ),
                    nextCursor = null,
                )

            val receipt = adapter.listReceipts(userId, cursor = null, limit = 20).receipts.single()

            assertThat(receipt.paidAt).isEqualTo(Instant.parse("2026-06-01T09:00:00Z"))
        }

    @Test
    fun `forwards the resolved customer, cursor and limit and returns the provider nextCursor`() =
        runTest {
            client.customerPayments = MolliePaymentPage(payments = emptyList(), nextCursor = "tr_next")

            val page = adapter.listReceipts(userId, cursor = "tr_from", limit = 50)

            assertThat(client.lastListCustomerId).isEqualTo("cust_1")
            assertThat(client.lastListFrom).isEqualTo("tr_from")
            assertThat(client.lastListLimit).isEqualTo(50)
            assertThat(page.nextCursor).isEqualTo("tr_next")
        }

    private fun record(
        amountValue: String = "2.00",
        currency: String = "EUR",
        status: String = "paid",
        paidAt: Instant? = Instant.parse("2026-06-29T14:03:00Z"),
        createdAt: Instant = Instant.parse("2026-06-29T14:00:00Z"),
    ) = MolliePaymentRecord(amountValue, currency, status, paidAt, createdAt)
}
