package com.bliss.billing.application.usecases

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.billing.application.ports.ProviderReceipt
import com.bliss.billing.application.ports.ReceiptsPage
import com.bliss.billing.application.testdoubles.FakeReceiptProvider
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class ListReceiptsTest {
    private val provider = FakeReceiptProvider()
    private val useCase = ListReceipts(provider)
    private val userId = UUID.randomUUID()

    @Test
    fun `returns the provider page for the caller`() =
        runTest {
            provider.page =
                ReceiptsPage(
                    receipts = listOf(ProviderReceipt(Instant.parse("2026-06-29T14:03:00Z"), 200, "EUR", "paid", null)),
                    nextCursor = "tr_next",
                )

            val page = useCase.execute(userId, cursor = null, limit = 20)

            assertThat(page.nextCursor).isEqualTo("tr_next")
            assertThat(page.receipts.single().amountMinorUnits).isEqualTo(200)
            assertThat(provider.lastUserId).isEqualTo(userId)
        }

    @Test
    fun `clamps limit above the maximum to 100`() =
        runTest {
            useCase.execute(userId, cursor = null, limit = 500)

            assertThat(provider.lastLimit).isEqualTo(100)
        }

    @Test
    fun `clamps a non-positive limit to 1`() =
        runTest {
            useCase.execute(userId, cursor = null, limit = 0)

            assertThat(provider.lastLimit).isEqualTo(1)
        }

    @Test
    fun `normalises a blank cursor to null`() =
        runTest {
            useCase.execute(userId, cursor = "   ", limit = 20)

            assertThat(provider.lastCursor).isNull()
        }

    @Test
    fun `passes a present cursor through unchanged`() =
        runTest {
            useCase.execute(userId, cursor = "tr_abc", limit = 20)

            assertThat(provider.lastCursor).isEqualTo("tr_abc")
        }
}
