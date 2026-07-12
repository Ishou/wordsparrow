package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isGreaterThanOrEqualTo
import com.bliss.grid.domain.correction.ClueCorrection
import org.junit.jupiter.api.Test
import java.util.UUID

class ProcessCorrectionsUseCaseTest {
    private val correctionId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")

    private fun replace(): ClueCorrection =
        ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", wordText = "MOT", newClueText = "new")

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

    private fun grid(
        id: Int,
        failing: Boolean = false,
    ): FakeGrid = FakeGrid(id, clueText = "old", failing = failing)

    private data class FakeGrid(
        val id: Int,
        var clueText: String,
        val failing: Boolean = false,
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
            for (g in grids.filter { it.clueText == correction.oldClueText }.take(limit)) {
                if (g.failing) {
                    failed++
                    lastError = "boom ${g.id}"
                    continue
                }
                g.clueText = correction.newClueText ?: g.clueText
                patched++
            }
            return PatchBatchResult(patched, failed, lastError)
        }
    }
}
