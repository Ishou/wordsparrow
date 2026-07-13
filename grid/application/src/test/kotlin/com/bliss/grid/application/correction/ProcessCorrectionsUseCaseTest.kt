package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThanOrEqualTo
import assertk.assertions.isNull
import com.bliss.grid.domain.correction.ClueCorrection
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class ProcessCorrectionsUseCaseTest {
    private val correctionId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val blocklistId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6e")

    private fun replace(): ClueCorrection =
        ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", wordText = "MOT", newClueText = "new")

    private fun blocklist(): ClueCorrection = ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "GROSMOT")

    @Test
    fun `pending correction drains to done with grids patched equal to grids matched`() {
        val store = FakeWorkStore().apply { seed(correctionId, replace()) }
        val backfill = FakeBackfill(mutableListOf(grid(1), grid(2), grid(3)))
        val useCase = ProcessCorrectionsUseCase(store, backfill, batchSize = 2)

        val processed = useCase.run()

        assertThat(processed).isEqualTo(1)
        val state = store.states.getValue(correctionId)
        assertThat(state.status).isEqualTo(BackfillStatus.DONE)
        assertThat(state.gridsMatched).isEqualTo(3)
        assertThat(state.gridsPatched).isEqualTo(3)
        assertThat(backfill.countMatching(replace())).isEqualTo(0)
    }

    @Test
    fun `resumes a running correction on the remainder and keeps counters monotonic`() {
        val store =
            FakeWorkStore().apply {
                seed(correctionId, replace(), status = BackfillStatus.RUNNING, matched = 5, patched = 2)
            }
        val backfill = FakeBackfill(mutableListOf(grid(1), grid(2), grid(3)))
        val useCase = ProcessCorrectionsUseCase(store, backfill)

        useCase.run()

        val state = store.states.getValue(correctionId)
        assertThat(state.status).isEqualTo(BackfillStatus.DONE)
        assertThat(state.gridsMatched).isEqualTo(5)
        assertThat(state.gridsPatched).isEqualTo(5)
        assertThat(state.gridsPatched).isGreaterThanOrEqualTo(2)
    }

    @Test
    fun `second full run is idempotent and patches nothing`() {
        val store = FakeWorkStore().apply { seed(correctionId, replace()) }
        val backfill = FakeBackfill(mutableListOf(grid(1), grid(2)))
        val useCase = ProcessCorrectionsUseCase(store, backfill)

        useCase.run()
        val afterFirst = store.states.getValue(correctionId).gridsPatched
        val processedAgain = useCase.run()

        assertThat(processedAgain).isEqualTo(0)
        assertThat(store.states.getValue(correctionId).gridsPatched).isEqualTo(afterFirst)
    }

    @Test
    fun `a failing grid is isolated, recorded, and does not abort the batch`() {
        val store = FakeWorkStore().apply { seed(correctionId, replace()) }
        val backfill = FakeBackfill(mutableListOf(grid(1), grid(2, failing = true), grid(3)))
        val useCase = ProcessCorrectionsUseCase(store, backfill)

        useCase.run()

        val state = store.states.getValue(correctionId)
        assertThat(state.status).isEqualTo(BackfillStatus.FAILED)
        assertThat(state.gridsPatched).isEqualTo(2)
        assertThat(state.error).isEqualTo("boom 2")
    }

    @Test
    fun `dispatches a blocklist_word job to the scrub processor and still patches a replace`() {
        val store =
            FakeWorkStore().apply {
                seed(correctionId, replace())
                seed(blocklistId, blocklist())
            }
        val backfill = FakeBackfill(mutableListOf(grid(1)))
        val scrubbed = mutableListOf<UUID>()
        val useCase = ProcessCorrectionsUseCase(store, backfill, { job -> scrubbed.add(job.correctionId) })

        val processed = useCase.run()

        assertThat(processed).isEqualTo(2)
        assertThat(scrubbed).containsExactly(blocklistId)
        assertThat(store.states.getValue(correctionId).status).isEqualTo(BackfillStatus.DONE)
        // The blocklist job never went through the patch path, so it is untouched by the FakeBackfill.
        assertThat(store.states.getValue(blocklistId).status).isEqualTo(BackfillStatus.PENDING)
    }

    @Test
    fun `leaves a blocklist_word job pending when no scrub processor is wired`() {
        val store = FakeWorkStore().apply { seed(blocklistId, blocklist()) }
        val backfill = FakeBackfill(mutableListOf())

        val processed = ProcessCorrectionsUseCase(store, backfill).run()

        assertThat(processed).isEqualTo(0)
        assertThat(store.states.getValue(blocklistId).status).isEqualTo(BackfillStatus.PENDING)
        assertThat(store.states.getValue(blocklistId).error).isNull()
    }

    @Test
    fun `accumulates patched daily dates across batches for edge purge and excludes failures`() {
        val day1 = LocalDate.of(2026, 7, 12)
        val day2 = LocalDate.of(2026, 7, 13)
        val store = FakeWorkStore().apply { seed(correctionId, replace()) }
        val backfill =
            FakeBackfill(
                mutableListOf(
                    grid(1, date = day1),
                    grid(2, failing = true, date = LocalDate.of(2026, 7, 20)),
                    grid(3, date = day2),
                    grid(4, date = day1),
                ),
            )
        val useCase = ProcessCorrectionsUseCase(store, backfill, batchSize = 2)

        useCase.run()

        // Deduped, in first-seen order; the failing grid's date is never purged.
        assertThat(useCase.patchedDailyDates).containsExactly(day1, day2)
    }

    @Test
    fun `patched daily dates is empty when a solo grid without a date is patched`() {
        val store = FakeWorkStore().apply { seed(correctionId, replace()) }
        val backfill = FakeBackfill(mutableListOf(grid(1), grid(2)))
        val useCase = ProcessCorrectionsUseCase(store, backfill)

        useCase.run()

        assertThat(useCase.patchedDailyDates).isEmpty()
    }

    private fun grid(
        id: Int,
        failing: Boolean = false,
        date: LocalDate? = null,
    ): FakeGrid = FakeGrid(id, clueText = "old", failing = failing, date = date)

    private data class FakeGrid(
        val id: Int,
        var clueText: String,
        val failing: Boolean = false,
        val date: LocalDate? = null,
    )

    private class FakeBackfill(
        private val grids: MutableList<FakeGrid>,
    ) : GridBackfillPort {
        override fun countMatching(correction: ClueCorrection): Int = grids.count { it.clueText == correction.oldClueText }

        override fun patchBatch(
            correction: ClueCorrection,
            limit: Int,
        ): PatchBatchResult {
            var patched = 0
            var failed = 0
            var lastError: String? = null
            val patchedDates = mutableListOf<LocalDate>()
            for (g in grids.filter { it.clueText == correction.oldClueText }.take(limit)) {
                if (g.failing) {
                    failed++
                    lastError = "boom ${g.id}"
                    continue
                }
                g.clueText = correction.newClueText ?: g.clueText
                patched++
                if (g.date != null) patchedDates.add(g.date)
            }
            return PatchBatchResult(patched, failed, lastError, patchedDates)
        }
    }
}
