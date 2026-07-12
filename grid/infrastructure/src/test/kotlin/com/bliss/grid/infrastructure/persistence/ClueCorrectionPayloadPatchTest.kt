package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.grid.domain.correction.ClueCorrection
import org.junit.jupiter.api.Test

class ClueCorrectionPayloadPatchTest {
    private fun placement(
        wordText: String,
        clues: List<PuzzlePayload.SerializedClue>,
        chosenClueIndex: Int,
    ): PuzzlePayload.SerializedPlacement =
        PuzzlePayload.SerializedPlacement(
            wordText = wordText,
            wordLemma = wordText,
            clues = clues,
            chosenClueIndex = chosenClueIndex,
            cluePositionRow = 0,
            cluePositionColumn = 0,
            direction = PuzzlePayload.SerializedDirection.DOWN_RIGHT,
        )

    private fun payloadOf(vararg placements: PuzzlePayload.SerializedPlacement): PuzzlePayload =
        PuzzlePayload(width = 10, height = 10, placements = placements.toList())

    @Test
    fun `replace rewrites the chosen clue text so the placement no longer matches`() {
        val payload = payloadOf(placement("PAIN", listOf(PuzzlePayload.SerializedClue("Souffrance")), 0))
        val correction =
            ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Souffrance", wordText = "PAIN", newClueText = "Aliment de base")

        val patched = ClueCorrectionPayloadPatch.apply(payload, correction)

        val chosen = patched.placements.single().let { it.clues[it.chosenClueIndex] }
        assertThat(chosen.text).isEqualTo("Aliment de base")
    }

    @Test
    fun `forbid drops the clue and re-points the chosen index to a survivor`() {
        val payload =
            payloadOf(
                placement(
                    "EST",
                    listOf(PuzzlePayload.SerializedClue("Verbe etre"), PuzzlePayload.SerializedClue("Point cardinal", theme = "compass")),
                    0,
                ),
            )
        val correction = ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "Verbe etre", wordText = "EST")

        val patched = ClueCorrectionPayloadPatch.apply(payload, correction)

        val placement = patched.placements.single()
        assertThat(placement.clues).hasSize(1)
        assertThat(placement.clues[placement.chosenClueIndex].text).isEqualTo("Point cardinal")
    }

    @Test
    fun `a placement whose chosen clue differs is left untouched`() {
        val payload = payloadOf(placement("MOT", listOf(PuzzlePayload.SerializedClue("Autre chose")), 0))
        val correction = ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", newClueText = "new")

        val patched = ClueCorrectionPayloadPatch.apply(payload, correction)

        assertThat(patched).isEqualTo(payload)
    }

    @Test
    fun `a word-narrowed correction skips a matching clue on a different word`() {
        val payload = payloadOf(placement("PARIS", listOf(PuzzlePayload.SerializedClue("Capitale")), 0))
        val correction =
            ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "Capitale", wordText = "LYON", newClueText = "Autre")

        val patched = ClueCorrectionPayloadPatch.apply(payload, correction)

        assertThat(patched).isEqualTo(payload)
    }
}
