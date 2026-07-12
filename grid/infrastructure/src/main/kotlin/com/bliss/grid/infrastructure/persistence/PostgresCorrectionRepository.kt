package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.CorrectionProgress
import com.bliss.grid.application.correction.CorrectionRepository
import com.bliss.grid.domain.correction.ClueCorrection
import com.fasterxml.uuid.Generators
import java.sql.ResultSet
import java.util.UUID
import javax.sql.DataSource

/** Postgres-backed [CorrectionRepository] (ADR-0108). Correction ids are UUID v7 (ADR-0003 §6). */
class PostgresCorrectionRepository(
    private val dataSource: DataSource,
) : CorrectionRepository {
    private val idGenerator = Generators.timeBasedEpochGenerator()

    override fun record(
        correction: ClueCorrection,
        createdBy: UUID,
    ): UUID {
        val id = idGenerator.generate()
        dataSource.connection.use { conn ->
            conn.prepareStatement(INSERT_SQL).use { stmt ->
                stmt.setObject(1, id)
                stmt.setString(2, correction.kind.wire)
                stmt.setString(3, correction.wordText)
                stmt.setString(4, correction.oldClueText)
                stmt.setString(5, correction.newClueText)
                stmt.setObject(6, createdBy)
                stmt.executeUpdate()
            }
        }
        return id
    }

    override fun active(): List<ClueCorrection> =
        dataSource.connection.use { conn ->
            conn.prepareStatement(ACTIVE_SQL).use { stmt ->
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) add(rs.toClueCorrection())
                    }
                }
            }
        }

    override fun progress(correctionId: UUID): CorrectionProgress? =
        dataSource.connection.use { conn ->
            conn.prepareStatement(PROGRESS_SQL).use { stmt ->
                stmt.setObject(1, correctionId)
                stmt.executeQuery().use { rs ->
                    if (rs.next()) rs.toProgress() else null
                }
            }
        }

    private fun ResultSet.toClueCorrection(): ClueCorrection =
        ClueCorrection(
            kind = ClueCorrection.Kind.fromWire(getString("kind")) ?: error("unknown correction kind"),
            oldClueText = getString("old_clue_text"),
            wordText = getString("word_text"),
            newClueText = getString("new_clue_text"),
        )

    private fun ResultSet.toProgress(): CorrectionProgress {
        val matched = getObject("grids_matched") as? Int
        return CorrectionProgress(
            correctionId = getObject("correction_id", UUID::class.java),
            kind = ClueCorrection.Kind.fromWire(getString("kind")) ?: error("unknown correction kind"),
            backfillStatus = BackfillStatus.fromWire(getString("backfill_status")) ?: error("unknown backfill status"),
            gridsMatched = matched,
            gridsPatched = getInt("grids_patched"),
        )
    }

    companion object {
        private const val INSERT_SQL =
            """
            INSERT INTO clue_corrections (correction_id, kind, word_text, old_clue_text, new_clue_text, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """

        // ORDER BY created_at asc so the overlay applies newest last and it supersedes older ones (ADR-0108).
        private const val ACTIVE_SQL =
            "SELECT kind, word_text, old_clue_text, new_clue_text FROM clue_corrections " +
                "WHERE exported_at IS NULL ORDER BY created_at, correction_id"

        private const val PROGRESS_SQL =
            """
            SELECT correction_id, kind, backfill_status, grids_matched, grids_patched
            FROM clue_corrections WHERE correction_id = ?
            """
    }
}
