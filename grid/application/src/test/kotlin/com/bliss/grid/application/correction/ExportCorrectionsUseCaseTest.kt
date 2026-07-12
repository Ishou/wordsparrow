package com.bliss.grid.application.correction

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.bliss.grid.domain.correction.ClueCorrection
import org.junit.jupiter.api.Test
import java.util.UUID

class ExportCorrectionsUseCaseTest {
    private val replaceId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6d")
    private val forbidId = UUID.fromString("0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6e")

    private class RecordingAppender : ClueOverrideAppender {
        val rows = mutableListOf<ClueOverrideRow>()

        override fun append(rows: List<ClueOverrideRow>) {
            this.rows += rows
        }
    }

    @Test
    fun `exports a replace as a lower-cased word clue row and stamps it`() {
        val store =
            FakeWorkStore().apply {
                seed(
                    replaceId,
                    ClueCorrection(
                        ClueCorrection.Kind.REPLACE,
                        oldClueText = "Souffrance",
                        wordText = "PAIN",
                        newClueText = "Aliment de base",
                    ),
                    reason = "english-leak",
                )
            }
        val appender = RecordingAppender()

        val exported = ExportCorrectionsUseCase(store, appender).run()

        assertThat(exported).isEqualTo(1)
        assertThat(appender.rows).containsExactly(ClueOverrideRow("pain", "Aliment de base", "english-leak"))
        assertThat(store.states.getValue(replaceId).exported).isEqualTo(true)
    }

    @Test
    fun `exporting twice writes each correction once`() {
        val store =
            FakeWorkStore().apply {
                seed(
                    replaceId,
                    ClueCorrection(ClueCorrection.Kind.REPLACE, oldClueText = "old", wordText = "MOT", newClueText = "new"),
                )
            }
        val appender = RecordingAppender()
        val useCase = ExportCorrectionsUseCase(store, appender)

        useCase.run()
        val secondCount = useCase.run()

        assertThat(secondCount).isEqualTo(0)
        assertThat(appender.rows).hasSize(1)
    }

    @Test
    fun `a forbid without a replacement clue is not exportable`() {
        val store =
            FakeWorkStore().apply {
                seed(forbidId, ClueCorrection(ClueCorrection.Kind.FORBID_CLUE, oldClueText = "old", wordText = "MOT"))
            }
        val appender = RecordingAppender()

        val exported = ExportCorrectionsUseCase(store, appender).run()

        assertThat(exported).isEqualTo(0)
        assertThat(appender.rows).hasSize(0)
    }
}
