package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import com.bliss.grid.domain.correction.ClueCorrection
import com.bliss.grid.domain.generation.WordRepository
import com.bliss.grid.domain.model.Word
import com.bliss.grid.domain.model.WordClue
import org.junit.jupiter.api.Test
import java.util.UUID

class RecordCorrectionUseCaseTest {
    private val maintainer = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")

    private class FakeWordRepository(
        private val words: List<Word>,
    ) : WordRepository {
        override fun findByLength(length: Int): List<Word> = words.filter { it.text.length == length }

        override fun findByLengthAndPattern(
            length: Int,
            pattern: Map<Int, Char>,
        ): List<Word> = findByLength(length).filter { w -> pattern.all { (i, c) -> w.text[i] == c } }

        override fun containsLemma(text: String): Boolean = words.any { it.text == text.uppercase() }
    }

    private class RecordingCorrectionRepository : CorrectionRepository {
        val recorded = mutableListOf<Pair<ClueCorrection, UUID>>()
        var guardSawActive: List<ClueCorrection>? = null

        override fun record(
            correction: ClueCorrection,
            createdBy: UUID,
        ): UUID {
            recorded += correction to createdBy
            return UUID.randomUUID()
        }

        // Mirrors the adapters' atomic guard: evaluate the predicate before inserting.
        override fun recordForbidGuarded(
            correction: ClueCorrection,
            createdBy: UUID,
            wouldEmptyWord: (active: List<ClueCorrection>) -> Boolean,
        ): GuardedRecord {
            val active = recorded.map { it.first }
            guardSawActive = active
            return if (wouldEmptyWord(active)) {
                GuardedRecord.LastClueForbidden
            } else {
                GuardedRecord.Recorded(record(correction, createdBy))
            }
        }

        override fun active(): List<ClueCorrection> = recorded.map { it.first }

        override fun progress(correctionId: UUID): CorrectionProgress? = null

        override fun findReversible(
            oldClueText: String,
            wordText: String?,
        ): List<ReversibleCorrection> = emptyList()

        override fun deactivate(correctionId: UUID) = Unit

        override fun reverseGuarded(
            oldClueText: String,
            wordText: String?,
            reversedBy: UUID,
            compensate: (ReversibleCorrection) -> ClueCorrection?,
        ): ClueCorrection.Kind? = null
    }

    @Test
    fun `records a valid replace and returns the new id`() {
        val words = FakeWordRepository(listOf(Word("PARIS", "Capitale")))
        val repo = RecordingCorrectionRepository()
        val useCase = RecordCorrectionUseCase(repo, words)

        val result =
            useCase.execute(
                ClueCorrection(
                    ClueCorrection.Kind.REPLACE,
                    oldClueText = "Capitale",
                    wordText = "PARIS",
                    newClueText = "Capitale de la France",
                ),
                maintainer,
            )

        assertThat(result).isInstanceOf(RecordCorrectionUseCase.Result.Recorded::class)
        assertThat(repo.recorded.size).isEqualTo(1)
        assertThat(repo.recorded.single().second).isEqualTo(maintainer)
    }

    @Test
    fun `records a blocklist directly without the last-clue guard`() {
        val repo = RecordingCorrectionRepository()
        val useCase = RecordCorrectionUseCase(repo, FakeWordRepository(listOf(Word("GROSMOT", "Une definition"))))

        val result =
            useCase.execute(
                ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "GROSMOT", reason = "Injure"),
                maintainer,
            )

        assertThat(result).isInstanceOf(RecordCorrectionUseCase.Result.Recorded::class)
        assertThat(repo.recorded.size).isEqualTo(1)
        // The guard never ran: a blocklist skips it entirely (ADR-0110).
        assertThat(repo.guardSawActive == null).isEqualTo(true)
        assertThat(
            repo.recorded
                .single()
                .first.reason,
        ).isEqualTo("Injure")
    }

    @Test
    fun `records a forbid when the word keeps another clue`() {
        val subject = Word("EST", listOf(WordClue("Verbe etre"), WordClue("Point cardinal", theme = "compass")))
        val repo = RecordingCorrectionRepository()
        val useCase = RecordCorrectionUseCase(repo, FakeWordRepository(listOf(subject)))

        val result =
            useCase.execute(
                ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Verbe etre", wordText = "EST"),
                maintainer,
            )

        assertThat(result).isInstanceOf(RecordCorrectionUseCase.Result.Recorded::class)
    }

    @Test
    fun `rejects a forbid that would empty the word`() {
        val repo = RecordingCorrectionRepository()
        val useCase = RecordCorrectionUseCase(repo, FakeWordRepository(listOf(Word("PARIS", "Capitale"))))

        val result =
            useCase.execute(
                ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Capitale", wordText = "PARIS"),
                maintainer,
            )

        assertThat(result).isEqualTo(RecordCorrectionUseCase.Result.LastClueForbidden)
        assertThat(repo.recorded.isEmpty()).isEqualTo(true)
    }

    @Test
    fun `re-reads active corrections in the guard so a second forbid draining the last clue is rejected`() {
        val subject = Word("EST", listOf(WordClue("Verbe etre"), WordClue("Point cardinal", theme = "compass")))
        val repo = RecordingCorrectionRepository()
        val useCase = RecordCorrectionUseCase(repo, FakeWordRepository(listOf(subject)))

        val first =
            useCase.execute(
                ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Verbe etre", wordText = "EST"),
                maintainer,
            )
        val second =
            useCase.execute(
                ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Point cardinal", wordText = "EST"),
                maintainer,
            )

        assertThat(first).isInstanceOf(RecordCorrectionUseCase.Result.Recorded::class)
        assertThat(second).isEqualTo(RecordCorrectionUseCase.Result.LastClueForbidden)
        // The second forbid is rejected only because the guard folded the first (active) forbid in.
        assertThat(repo.guardSawActive!!.map { it.oldClueText }).isEqualTo(listOf("Verbe etre"))
        assertThat(repo.recorded.size).isEqualTo(1)
    }
}
