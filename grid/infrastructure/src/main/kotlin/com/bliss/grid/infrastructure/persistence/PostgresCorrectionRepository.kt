package com.bliss.grid.infrastructure.persistence

import com.bliss.grid.application.correction.BackfillStatus
import com.bliss.grid.application.correction.CorrectionBackfillJob
import com.bliss.grid.application.correction.CorrectionProgress
import com.bliss.grid.application.correction.CorrectionRepository
import com.bliss.grid.application.correction.CorrectionWorkStore
import com.bliss.grid.application.correction.ExportableCorrection
import com.bliss.grid.application.correction.GuardedRecord
import com.bliss.grid.application.correction.ReversibleCorrection
import com.bliss.grid.domain.correction.ClueCorrection
import com.fasterxml.uuid.Generators
import java.sql.Connection
import java.sql.ResultSet
import java.sql.Types
import java.util.UUID
import javax.sql.DataSource

/** Postgres-backed [CorrectionRepository] + worker-side [CorrectionWorkStore] (ADR-0108). Ids are UUID v7 (ADR-0003 §6). */
class PostgresCorrectionRepository(
    private val dataSource: DataSource,
) : CorrectionRepository,
    CorrectionWorkStore {
    private val idGenerator = Generators.timeBasedEpochGenerator()

    override fun record(
        correction: ClueCorrection,
        createdBy: UUID,
    ): UUID {
        val id = idGenerator.generate()
        dataSource.connection.use { conn -> insertIn(conn, id, correction, createdBy) }
        return id
    }

    // Xact advisory lock serializes concurrent forbids on the same word until commit (ADR-0108 §2).
    override fun recordForbidGuarded(
        correction: ClueCorrection,
        createdBy: UUID,
        wouldEmptyWord: (active: List<ClueCorrection>) -> Boolean,
    ): GuardedRecord {
        val lockKey = correction.wordText?.uppercase() ?: error("forbid_clue requires a wordText")
        dataSource.connection.use { conn ->
            conn.autoCommit = false
            try {
                conn.prepareStatement(ADVISORY_LOCK_SQL).use { stmt ->
                    stmt.setString(1, lockKey)
                    stmt.executeQuery().use { it.next() }
                }
                if (wouldEmptyWord(readActive(conn))) {
                    conn.rollback()
                    return GuardedRecord.LastClueForbidden
                }
                val id = idGenerator.generate()
                insertIn(conn, id, correction, createdBy)
                conn.commit()
                return GuardedRecord.Recorded(id)
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = true
            }
        }
    }

    override fun active(): List<ClueCorrection> = dataSource.connection.use { conn -> readActive(conn) }

    private fun readActive(conn: Connection): List<ClueCorrection> =
        conn.prepareStatement(ACTIVE_SQL).use { stmt ->
            stmt.executeQuery().use { rs ->
                buildList {
                    while (rs.next()) add(rs.toClueCorrection())
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

    override fun findReversible(
        oldClueText: String,
        wordText: String?,
    ): List<ReversibleCorrection> = dataSource.connection.use { conn -> findReversibleIn(conn, oldClueText, wordText?.uppercase()) }

    override fun deactivate(correctionId: UUID): Unit = dataSource.connection.use { conn -> deactivateIn(conn, correctionId) }

    // Xact advisory lock serializes concurrent reverses of the same target until commit (ADR-0116).
    override fun reverseGuarded(
        oldClueText: String,
        wordText: String?,
        reversedBy: UUID,
        compensate: (ReversibleCorrection) -> ClueCorrection?,
    ): ClueCorrection.Kind? {
        val folded = wordText?.uppercase()
        dataSource.connection.use { conn ->
            conn.autoCommit = false
            try {
                conn.prepareStatement(ADVISORY_LOCK_SQL).use { stmt ->
                    stmt.setString(1, folded ?: oldClueText)
                    stmt.executeQuery().use { it.next() }
                }
                val match = findReversibleIn(conn, oldClueText, folded).firstOrNull()
                if (match == null) {
                    conn.rollback()
                    return null
                }
                compensate(match)?.let { insertIn(conn, idGenerator.generate(), it, reversedBy) }
                deactivateIn(conn, match.id)
                conn.commit()
                return match.kind
            } catch (e: Exception) {
                conn.rollback()
                throw e
            } finally {
                conn.autoCommit = true
            }
        }
    }

    private fun findReversibleIn(
        conn: Connection,
        oldClueText: String,
        folded: String?,
    ): List<ReversibleCorrection> =
        conn.prepareStatement(FIND_REVERSIBLE_SQL).use { stmt ->
            stmt.setString(1, oldClueText)
            if (folded != null) stmt.setString(2, folded) else stmt.setNull(2, Types.VARCHAR)
            stmt.executeQuery().use { rs ->
                buildList {
                    while (rs.next()) {
                        add(
                            ReversibleCorrection(
                                id = rs.getObject("correction_id", UUID::class.java),
                                kind = requireNotNull(ClueCorrection.Kind.fromWire(rs.getString("kind"))),
                                oldClueText = rs.getString("old_clue_text"),
                                newClueText = rs.getString("new_clue_text"),
                                wordText = rs.getString("word_text"),
                            ),
                        )
                    }
                }
            }
        }

    private fun deactivateIn(
        conn: Connection,
        correctionId: UUID,
    ) {
        conn.prepareStatement(DEACTIVATE_SQL).use { stmt ->
            stmt.setObject(1, correctionId)
            stmt.executeUpdate()
        }
    }

    private fun insertIn(
        conn: Connection,
        id: UUID,
        correction: ClueCorrection,
        createdBy: UUID,
    ) {
        conn.prepareStatement(INSERT_SQL).use { stmt ->
            stmt.setObject(1, id)
            stmt.setString(2, correction.kind.wire)
            stmt.setString(3, correction.wordText)
            stmt.setString(4, correction.oldClueText)
            stmt.setString(5, correction.newClueText)
            stmt.setString(6, correction.reason)
            stmt.setObject(7, createdBy)
            stmt.executeUpdate()
        }
    }

    override fun backfillJobs(): List<CorrectionBackfillJob> =
        dataSource.connection.use { conn ->
            conn.prepareStatement(BACKFILL_JOBS_SQL).use { stmt ->
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) add(rs.toBackfillJob())
                    }
                }
            }
        }

    override fun beginBackfill(
        correctionId: UUID,
        gridsMatched: Int,
    ) = execUpdate(BEGIN_BACKFILL_SQL) { stmt ->
        stmt.setInt(1, gridsMatched)
        stmt.setObject(2, correctionId)
    }

    override fun heartbeatBackfill(
        correctionId: UUID,
        patchedDelta: Int,
    ) = execUpdate(HEARTBEAT_SQL) { stmt ->
        stmt.setInt(1, patchedDelta)
        stmt.setObject(2, correctionId)
    }

    override fun completeBackfill(correctionId: UUID) = execUpdate(COMPLETE_BACKFILL_SQL) { it.setObject(1, correctionId) }

    override fun failBackfill(
        correctionId: UUID,
        error: String,
    ) = execUpdate(FAIL_BACKFILL_SQL) { stmt ->
        stmt.setString(1, error)
        stmt.setObject(2, correctionId)
    }

    override fun exportableCorrections(): List<ExportableCorrection> =
        dataSource.connection.use { conn ->
            conn.prepareStatement(EXPORTABLE_SQL).use { stmt ->
                stmt.executeQuery().use { rs ->
                    buildList {
                        while (rs.next()) {
                            add(
                                ExportableCorrection(
                                    correctionId = rs.getObject("correction_id", UUID::class.java),
                                    wordText = rs.getString("word_text"),
                                    newClueText = rs.getString("new_clue_text"),
                                    reason = rs.getString("reason"),
                                ),
                            )
                        }
                    }
                }
            }
        }

    override fun markExported(correctionId: UUID) = execUpdate(MARK_EXPORTED_SQL) { it.setObject(1, correctionId) }

    private fun execUpdate(
        sql: String,
        bind: (java.sql.PreparedStatement) -> Unit,
    ) {
        dataSource.connection.use { conn ->
            conn.prepareStatement(sql).use { stmt ->
                bind(stmt)
                stmt.executeUpdate()
            }
        }
    }

    private fun ResultSet.toBackfillJob(): CorrectionBackfillJob =
        CorrectionBackfillJob(
            correctionId = getObject("correction_id", UUID::class.java),
            correction = toClueCorrection(),
            status = BackfillStatus.fromWire(getString("backfill_status")) ?: error("unknown backfill status"),
            gridsMatched = getObject("grids_matched") as? Int,
            gridsPatched = getInt("grids_patched"),
        )

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
            INSERT INTO clue_corrections (correction_id, kind, word_text, old_clue_text, new_clue_text, reason, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """

        // Transaction-scoped advisory lock keyed on the folded word so concurrent forbids on it serialize.
        private const val ADVISORY_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext(?))"

        // ORDER BY created_at asc so the overlay applies newest last and it supersedes older ones (ADR-0108).
        private const val ACTIVE_SQL =
            "SELECT kind, word_text, old_clue_text, new_clue_text FROM clue_corrections " +
                "WHERE exported_at IS NULL AND reverted_at IS NULL ORDER BY created_at, correction_id"

        private const val PROGRESS_SQL =
            """
            SELECT correction_id, kind, backfill_status, grids_matched, grids_patched
            FROM clue_corrections WHERE correction_id = ?
            """

        private const val BACKFILL_JOBS_SQL =
            "SELECT correction_id, kind, word_text, old_clue_text, new_clue_text, " +
                "backfill_status, grids_matched, grids_patched FROM clue_corrections " +
                "WHERE backfill_status IN ('pending', 'running') AND reverted_at IS NULL ORDER BY created_at, correction_id"

        private const val BEGIN_BACKFILL_SQL =
            "UPDATE clue_corrections SET backfill_status = 'running', grids_matched = ?, " +
                "backfill_updated_at = now() WHERE correction_id = ?"

        private const val HEARTBEAT_SQL =
            "UPDATE clue_corrections SET grids_patched = grids_patched + ?, " +
                "backfill_updated_at = now() WHERE correction_id = ?"

        private const val COMPLETE_BACKFILL_SQL =
            "UPDATE clue_corrections SET backfill_status = 'done', backfill_updated_at = now() WHERE correction_id = ?"

        private const val FAIL_BACKFILL_SQL =
            "UPDATE clue_corrections SET backfill_status = 'failed', backfill_error = ?, " +
                "backfill_updated_at = now() WHERE correction_id = ?"

        // Only replace-with-word corrections map onto a word->clue override row (ADR-0108 §3).
        private const val EXPORTABLE_SQL =
            "SELECT correction_id, word_text, new_clue_text, reason FROM clue_corrections " +
                "WHERE exported_at IS NULL AND reverted_at IS NULL AND kind = 'replace' AND word_text IS NOT NULL " +
                "AND new_clue_text IS NOT NULL ORDER BY created_at, correction_id"

        private const val MARK_EXPORTED_SQL = "UPDATE clue_corrections SET exported_at = now() WHERE correction_id = ?"

        // Active (not exported, not reverted) corrections to reverse (ADR-0116): replace/forbid by old_clue_text, blocklist by word_text; newest first.
        private const val FIND_REVERSIBLE_SQL =
            "SELECT correction_id, kind, old_clue_text, new_clue_text, word_text FROM clue_corrections " +
                "WHERE exported_at IS NULL AND reverted_at IS NULL " +
                "AND (old_clue_text = ? OR (kind = 'blocklist_word' AND upper(word_text) = ?)) " +
                "ORDER BY created_at DESC, correction_id DESC"

        private const val DEACTIVATE_SQL = "UPDATE clue_corrections SET reverted_at = now() WHERE correction_id = ?"
    }
}
