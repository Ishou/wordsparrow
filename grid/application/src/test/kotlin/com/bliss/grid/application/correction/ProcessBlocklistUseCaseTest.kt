package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.grid.domain.correction.ClueCorrection
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class ProcessBlocklistUseCaseTest {
    private val correctionId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val dateA = LocalDate.parse("2026-07-12")
    private val dateB = LocalDate.parse("2026-07-13")

    private fun blocklist(): ClueCorrection = ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "GROSMOT")

    private fun run(
        backfill: FakeBlocklistBackfill,
        status: BackfillStatus = BackfillStatus.PENDING,
        matched: Int? = null,
        patched: Int = 0,
    ): FakeWorkStore.State {
        val store = FakeWorkStore().apply { seed(correctionId, blocklist(), status = status, matched = matched, patched = patched) }
        val useCase = ProcessBlocklistUseCase(store, backfill, backfill.regeneration())
        useCase.scrub(store.backfillJobs().single())
        return store.states.getValue(correctionId)
    }

    @Test
    fun `regenerates dailies and deletes solos to done with grids patched equal to grids matched`() {
        val soloA = UUID.randomUUID()
        val soloB = UUID.randomUUID()
        val backfill = FakeBlocklistBackfill(mutableListOf(dateA, dateB), mutableListOf(soloA, soloB))

        val state = run(backfill)

        assertThat(state.status).isEqualTo(BackfillStatus.DONE)
        assertThat(state.gridsMatched).isEqualTo(4)
        assertThat(state.gridsPatched).isEqualTo(4)
        assertThat(backfill.remainingWork("GROSMOT").total).isEqualTo(0)
    }

    @Test
    fun `second full run over the same drained backfill is idempotent and scrubs nothing`() {
        val backfill = FakeBlocklistBackfill(mutableListOf(dateA), mutableListOf(UUID.randomUUID()))
        run(backfill)

        // Re-seed pending and re-run against the now-drained backfill: a regenerated daily and a deleted solo are gone.
        val store = FakeWorkStore().apply { seed(correctionId, blocklist()) }
        ProcessBlocklistUseCase(store, backfill, backfill.regeneration()).scrub(store.backfillJobs().single())

        val state = store.states.getValue(correctionId)
        assertThat(state.status).isEqualTo(BackfillStatus.DONE)
        assertThat(state.gridsMatched).isEqualTo(0)
        assertThat(state.gridsPatched).isEqualTo(0)
    }

    @Test
    fun `resumes a running correction on the remainder`() {
        val backfill = FakeBlocklistBackfill(mutableListOf(dateA), mutableListOf(UUID.randomUUID()))

        val state = run(backfill, status = BackfillStatus.RUNNING, matched = 2, patched = 0)

        assertThat(state.status).isEqualTo(BackfillStatus.DONE)
        assertThat(state.gridsMatched).isEqualTo(2)
        assertThat(state.gridsPatched).isEqualTo(2)
    }

    @Test
    fun `a failing daily is isolated and does not abort the solo deletions`() {
        val soloA = UUID.randomUUID()
        val backfill =
            FakeBlocklistBackfill(
                dailyDates = mutableListOf(dateA, dateB),
                soloIds = mutableListOf(soloA),
                failingDates = setOf(dateB),
            )

        val state = run(backfill)

        assertThat(state.status).isEqualTo(BackfillStatus.FAILED)
        assertThat(state.gridsPatched).isEqualTo(2)
        assertThat(state.error).isEqualTo("daily regeneration failed for $dateB")
        assertThat(backfill.remainingWork("GROSMOT").dailyDates).isEqualTo(listOf(dateB))
    }

    @Test
    fun `a throwing solo delete is isolated and recorded`() {
        val failingSolo = UUID.randomUUID()
        val backfill =
            FakeBlocklistBackfill(
                dailyDates = mutableListOf(dateA),
                soloIds = mutableListOf(failingSolo),
                failingSolos = setOf(failingSolo),
            )

        val state = run(backfill)

        assertThat(state.status).isEqualTo(BackfillStatus.FAILED)
        assertThat(state.gridsPatched).isEqualTo(1)
        assertThat(state.error).isEqualTo("solo delete boom")
    }

    private class FakeBlocklistBackfill(
        private val dailyDates: MutableList<LocalDate>,
        private val soloIds: MutableList<UUID>,
        private val failingDates: Set<LocalDate> = emptySet(),
        private val failingSolos: Set<UUID> = emptySet(),
    ) : BlocklistBackfillPort {
        override fun remainingWork(word: String): BlocklistWork = BlocklistWork(dailyDates.toList(), soloIds.toList())

        override fun deleteSolo(puzzleId: UUID): Boolean {
            if (puzzleId in failingSolos) error("solo delete boom")
            return soloIds.remove(puzzleId)
        }

        // A successful regeneration drops the date; a failing one keeps it so it stays in the remaining queue.
        fun regeneration(): DailyRegenerationPort =
            DailyRegenerationPort { date ->
                if (date in failingDates) return@DailyRegenerationPort false
                dailyDates.remove(date)
            }
    }
}
