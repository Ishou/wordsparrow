package com.bliss.survey.infrastructure.persistence

import com.bliss.survey.application.ports.SignalementRepository
import com.bliss.survey.domain.model.PlayerReport
import com.bliss.survey.domain.model.ReportId
import com.bliss.survey.domain.model.ReportReason
import com.bliss.survey.domain.model.ReportStatus
import com.bliss.survey.domain.model.ReportSurface
import com.bliss.survey.domain.model.UserId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.postgresql.util.PSQLException
import java.sql.ResultSet
import java.sql.Timestamp
import java.sql.Types
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

/** Postgres-backed [SignalementRepository]; anonymise SQL implements the ADR-0103 RGPD erasure. */
class PgSignalementRepository(
    private val dataSource: DataSource,
) : SignalementRepository {
    override suspend fun insert(report: PlayerReport): Boolean =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(INSERT_SQL).use { stmt ->
                    stmt.setObject(1, report.id.value)
                    val wordText = report.wordText
                    if (wordText != null) stmt.setString(2, wordText) else stmt.setNull(2, Types.VARCHAR)
                    stmt.setString(3, report.clueText)
                    stmt.setString(4, report.reason.name.lowercase())
                    val note = report.note
                    if (note != null) stmt.setString(5, note) else stmt.setNull(5, Types.VARCHAR)
                    val puzzleId = report.puzzleId
                    if (puzzleId != null) stmt.setObject(6, puzzleId) else stmt.setNull(6, Types.OTHER)
                    stmt.setString(7, report.surface.name.lowercase())
                    val reporterId = report.reporterId
                    if (reporterId != null) stmt.setObject(8, reporterId.value) else stmt.setNull(8, Types.OTHER)
                    stmt.setString(9, report.status.name.lowercase())
                    stmt.setTimestamp(10, Timestamp.from(report.createdAt))
                    val triagedAt = report.triagedAt
                    if (triagedAt != null) stmt.setTimestamp(11, Timestamp.from(triagedAt)) else stmt.setNull(11, Types.TIMESTAMP)
                    val triagedBy = report.triagedBy
                    if (triagedBy != null) stmt.setObject(12, triagedBy.value) else stmt.setNull(12, Types.OTHER)
                    try {
                        stmt.executeUpdate() == 1
                    } catch (e: PSQLException) {
                        // 23505 = unique_violation on player_reports_dedup → benign concurrent-duplicate signal.
                        if (e.sqlState == "23505") false else throw e
                    }
                }
            }
        }

    // Null puzzleId can't dedupe: Postgres treats NULLs as distinct in the partial unique index, so skip the lookup (ADR-0103).
    override suspend fun findExisting(
        reporterId: UserId,
        clueText: String,
        puzzleId: UUID?,
    ): ReportId? {
        if (puzzleId == null) return null
        return withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(FIND_EXISTING_SQL).use { stmt ->
                    stmt.setObject(1, reporterId.value)
                    stmt.setString(2, clueText)
                    stmt.setObject(3, puzzleId)
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) ReportId(rs.getObject("report_id", UUID::class.java)) else null
                    }
                }
            }
        }
    }

    override suspend fun listPending(): List<PlayerReport> =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(LIST_PENDING_SQL).use { stmt ->
                    val out = mutableListOf<PlayerReport>()
                    stmt.executeQuery().use { rs -> while (rs.next()) out += rs.toPlayerReport() }
                    out
                }
            }
        }

    override suspend fun listHandled(limit: Int): List<PlayerReport> =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(LIST_HANDLED_SQL).use { stmt ->
                    stmt.setInt(1, limit)
                    val out = mutableListOf<PlayerReport>()
                    stmt.executeQuery().use { rs -> while (rs.next()) out += rs.toPlayerReport() }
                    out
                }
            }
        }

    override suspend fun findById(id: ReportId): PlayerReport? =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(FIND_BY_ID_SQL).use { stmt ->
                    stmt.setObject(1, id.value)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.toPlayerReport() else null }
                }
            }
        }

    override suspend fun updateStatus(
        id: ReportId,
        status: ReportStatus,
        triagedBy: UserId,
        triagedAt: Instant,
    ): Unit =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(UPDATE_STATUS_SQL).use { stmt ->
                    stmt.setString(1, status.name.lowercase())
                    stmt.setObject(2, triagedBy.value)
                    stmt.setTimestamp(3, Timestamp.from(triagedAt))
                    stmt.setObject(4, id.value)
                    stmt.executeUpdate()
                }
            }
        }

    override suspend fun revertToPending(id: ReportId): Unit =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(REVERT_TO_PENDING_SQL).use { stmt ->
                    stmt.setObject(1, id.value)
                    stmt.executeUpdate()
                }
            }
        }

    override suspend fun anonymiseForUser(userId: UserId): Unit =
        withContext(Dispatchers.IO) {
            withTxConnection(dataSource) { conn ->
                conn.prepareStatement(ANONYMISE_SQL).use { stmt ->
                    stmt.setObject(1, userId.value)
                    stmt.executeUpdate()
                }
            }
        }

    private fun ResultSet.toPlayerReport(): PlayerReport {
        val reporter: UUID? = getObject("reporter_id", UUID::class.java)
        val puzzle: UUID? = getObject("puzzle_id", UUID::class.java)
        val triagedBy: UUID? = getObject("triaged_by", UUID::class.java)
        return PlayerReport(
            id = ReportId(getObject("report_id", UUID::class.java)),
            wordText = getString("word_text"),
            clueText = getString("clue_text"),
            reason = ReportReason.valueOf(getString("reason").uppercase()),
            note = getString("note"),
            puzzleId = puzzle,
            surface = ReportSurface.valueOf(getString("surface").uppercase()),
            reporterId = reporter?.let(::UserId),
            status = ReportStatus.valueOf(getString("status").uppercase()),
            createdAt = getTimestamp("created_at").toInstant(),
            triagedAt = getTimestamp("triaged_at")?.toInstant(),
            triagedBy = triagedBy?.let(::UserId),
        )
    }

    private companion object {
        const val INSERT_SQL =
            """
            INSERT INTO player_reports
              (report_id, word_text, clue_text, reason, note, puzzle_id, surface,
               reporter_id, status, created_at, triaged_at, triaged_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """

        const val FIND_EXISTING_SQL =
            "SELECT report_id FROM player_reports WHERE reporter_id = ? AND clue_text = ? AND puzzle_id = ? LIMIT 1"

        const val LIST_PENDING_SQL =
            "SELECT * FROM player_reports WHERE status = 'pending' ORDER BY created_at"

        const val LIST_HANDLED_SQL =
            "SELECT * FROM player_reports WHERE status <> 'pending' ORDER BY triaged_at DESC LIMIT ?"

        const val FIND_BY_ID_SQL = "SELECT * FROM player_reports WHERE report_id = ?"

        const val UPDATE_STATUS_SQL =
            "UPDATE player_reports SET status = ?, triaged_by = ?, triaged_at = ? WHERE report_id = ?"

        const val REVERT_TO_PENDING_SQL =
            "UPDATE player_reports SET status = 'pending', triaged_by = NULL, triaged_at = NULL WHERE report_id = ?"

        const val ANONYMISE_SQL = "UPDATE player_reports SET reporter_id = NULL WHERE reporter_id = ?"
    }
}
