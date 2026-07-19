package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.grid.domain.correction.ClueCorrection
import org.junit.jupiter.api.Test
import java.util.UUID

class ReverseCorrectionUseCaseTest {
    private val by = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")

    private class FakeCorrections : CorrectionRepository {
        private data class Row(
            val id: UUID,
            val correction: ClueCorrection,
            var reverted: Boolean = false,
        )

        private val rows = mutableListOf<Row>()

        override fun record(
            correction: ClueCorrection,
            createdBy: UUID,
        ): UUID = UUID.randomUUID().also { rows += Row(it, correction) }

        override fun recordForbidGuarded(
            correction: ClueCorrection,
            createdBy: UUID,
            wouldEmptyWord: (active: List<ClueCorrection>) -> Boolean,
        ): GuardedRecord = GuardedRecord.Recorded(record(correction, createdBy))

        override fun active(): List<ClueCorrection> = rows.filterNot { it.reverted }.map { it.correction }

        override fun progress(correctionId: UUID): CorrectionProgress? = null

        override fun findReversible(
            oldClueText: String,
            wordText: String?,
        ): List<ReversibleCorrection> {
            val folded = wordText?.uppercase()
            return rows
                .filterNot { it.reverted }
                .filter { row ->
                    (row.correction.oldClueText == oldClueText && (folded == null || row.correction.wordText?.uppercase() == folded)) ||
                        (
                            row.correction.kind == ClueCorrection.Kind.BLOCKLIST_WORD &&
                                folded != null &&
                                row.correction.wordText?.uppercase() == folded
                        )
                }.map {
                    ReversibleCorrection(
                        it.id,
                        it.correction.kind,
                        it.correction.oldClueText,
                        it.correction.newClueText,
                        it.correction.wordText,
                    )
                }.reversed()
        }

        override fun deactivate(correctionId: UUID) {
            rows.firstOrNull { it.id == correctionId }?.reverted = true
        }

        override fun reverseGuarded(
            oldClueText: String,
            wordText: String?,
            reversedBy: UUID,
            compensate: (ReversibleCorrection) -> ClueCorrection?,
        ): ClueCorrection.Kind? {
            val match = findReversible(oldClueText, wordText).firstOrNull() ?: return null
            compensate(match)?.let { record(it, reversedBy) }
            deactivate(match.id)
            return match.kind
        }
    }

    @Test
    fun `reverses a replace by recording a compensating replace and deactivating the original`() {
        val repo = FakeCorrections()
        repo.record(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", newClueText = "new", wordText = "CHAT"), by)

        val kind = ReverseCorrectionUseCase(repo).execute("old", "CHAT", by)

        assertThat(kind).isEqualTo(ClueCorrection.Kind.REPLACE)
        val active = repo.active()
        assertThat(active).hasSize(1)
        assertThat(active.single().oldClueText).isEqualTo("new")
        assertThat(active.single().newClueText).isEqualTo("old")
    }

    @Test
    fun `reverses a forbid by deactivating it`() {
        val repo = FakeCorrections()
        repo.record(ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "old", wordText = "CHAT"), by)

        val kind = ReverseCorrectionUseCase(repo).execute("old", "CHAT", by)

        assertThat(kind).isEqualTo(ClueCorrection.Kind.FORBID_CLUE)
        assertThat(repo.active()).isEmpty()
    }

    @Test
    fun `wordText narrows which replace is reversed when two share the same old clue text`() {
        val repo = FakeCorrections()
        repo.record(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", newClueText = "new chat", wordText = "CHAT"), by)
        repo.record(ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", newClueText = "new chien", wordText = "CHIEN"), by)

        ReverseCorrectionUseCase(repo).execute("old", "chat", by)

        val active = repo.active()
        assertThat(active).hasSize(2)
        assertThat(active.map { it.oldClueText to it.newClueText }).containsExactlyInAnyOrder(
            "old" to "new chien",
            "new chat" to "old",
        )
    }

    @Test
    fun `reverses a blocklist matched by wordText, not clue text`() {
        val repo = FakeCorrections()
        repo.record(ClueCorrection(ClueCorrection.Kind.BLOCKLIST_WORD, wordText = "CHAT"), by)

        val kind = ReverseCorrectionUseCase(repo).execute("the reported clue", "chat", by)

        assertThat(kind).isEqualTo(ClueCorrection.Kind.BLOCKLIST_WORD)
        assertThat(repo.active()).isEmpty()
    }

    @Test
    fun `no matching active correction returns null and changes nothing`() {
        val repo = FakeCorrections()

        val kind = ReverseCorrectionUseCase(repo).execute("nothing here", null, by)

        assertThat(kind).isNull()
        assertThat(repo.active()).isEmpty()
    }
}
