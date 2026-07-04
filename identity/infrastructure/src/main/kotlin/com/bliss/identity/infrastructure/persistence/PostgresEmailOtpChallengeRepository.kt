package com.bliss.identity.infrastructure.persistence

import com.bliss.identity.application.ports.EmailOtpChallengeRepository
import com.bliss.identity.domain.auth.ChallengeId
import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.user.EmailAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.Types
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

/**
 * Postgres-backed [EmailOtpChallengeRepository]. JDBC is blocking; every method wraps its
 * calls in `withContext(Dispatchers.IO)` to keep the suspend port honest under coroutine
 * scopes (Ktor route handlers run on a limited dispatcher).
 */
class PostgresEmailOtpChallengeRepository(
    private val dataSource: DataSource,
) : EmailOtpChallengeRepository {
    override suspend fun create(challenge: EmailOtpChallenge): Unit =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(INSERT_SQL).use { stmt ->
                    stmt.setObject(1, challenge.id.value)
                    stmt.setString(2, challenge.email.value)
                    stmt.setString(3, challenge.codeHash)
                    stmt.setString(4, challenge.bindingHash)
                    stmt.setInt(5, challenge.attempts)
                    stmt.setObject(6, challenge.createdAt.atUtc())
                    stmt.setObject(7, challenge.expiresAt.atUtc())
                    stmt.setConsumedAt(8, challenge.consumedAt)
                    stmt.setBoolean(9, challenge.accountExisted)
                    stmt.executeUpdate()
                }
            }
        }

    override suspend fun findActiveByEmail(
        email: EmailAddress,
        now: Instant,
    ): EmailOtpChallenge? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_ACTIVE_SQL).use { stmt ->
                    stmt.setString(1, email.value)
                    stmt.setObject(2, now.atUtc())
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.toChallenge() else null }
                }
            }
        }

    override suspend fun save(challenge: EmailOtpChallenge): Unit =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(UPDATE_SQL).use { stmt ->
                    stmt.setInt(1, challenge.attempts)
                    stmt.setConsumedAt(2, challenge.consumedAt)
                    stmt.setObject(3, challenge.id.value)
                    stmt.executeUpdate()
                }
            }
        }

    override suspend fun countCreatedSince(
        email: EmailAddress,
        since: Instant,
    ): Int =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(COUNT_SINCE_SQL).use { stmt ->
                    stmt.setString(1, email.value)
                    stmt.setObject(2, since.atUtc())
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.getInt(1) else 0 }
                }
            }
        }

    override suspend fun countAllCreatedSince(since: Instant): Int =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(COUNT_ALL_SINCE_SQL).use { stmt ->
                    stmt.setObject(1, since.atUtc())
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.getInt(1) else 0 }
                }
            }
        }

    override suspend fun countNewAccountCreatedSince(since: Instant): Int =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(COUNT_NEW_ACCOUNT_SINCE_SQL).use { stmt ->
                    stmt.setObject(1, since.atUtc())
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.getInt(1) else 0 }
                }
            }
        }

    override suspend fun latestCreatedAt(email: EmailAddress): Instant? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(LATEST_CREATED_SQL).use { stmt ->
                    stmt.setString(1, email.value)
                    stmt.executeQuery().use { rs ->
                        if (rs.next()) rs.getObject(1, OffsetDateTime::class.java)?.toInstant() else null
                    }
                }
            }
        }

    override suspend fun deleteExpired(now: Instant): Unit =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(DELETE_EXPIRED_SQL).use { stmt ->
                    stmt.setObject(1, now.atUtc())
                    stmt.executeUpdate()
                }
            }
        }

    private fun Instant.atUtc(): OffsetDateTime = truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC)

    private fun PreparedStatement.setConsumedAt(
        index: Int,
        consumedAt: Instant?,
    ) {
        if (consumedAt != null) {
            setObject(index, consumedAt.atUtc())
        } else {
            setNull(index, Types.TIMESTAMP_WITH_TIMEZONE)
        }
    }

    private fun ResultSet.toChallenge(): EmailOtpChallenge =
        EmailOtpChallenge(
            id = ChallengeId(getObject("challenge_id", UUID::class.java)),
            email = EmailAddress.of(getString("email")),
            codeHash = getString("code_hash"),
            bindingHash = getString("binding_hash"),
            attempts = getInt("attempts"),
            createdAt = getObject("created_at", OffsetDateTime::class.java).toInstant(),
            expiresAt = getObject("expires_at", OffsetDateTime::class.java).toInstant(),
            consumedAt = getObject("consumed_at", OffsetDateTime::class.java)?.toInstant(),
            accountExisted = getObject("account_existed", java.lang.Boolean::class.java) == true,
        )

    companion object {
        private const val COLUMNS =
            "challenge_id, email, code_hash, binding_hash, attempts, created_at, expires_at, consumed_at, account_existed"
        private const val INSERT_SQL =
            "INSERT INTO identity_email_otp_challenges ($COLUMNS) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        private const val SELECT_ACTIVE_SQL =
            "SELECT $COLUMNS FROM identity_email_otp_challenges " +
                "WHERE email = ? AND expires_at > ? AND consumed_at IS NULL " +
                "ORDER BY created_at DESC LIMIT 1"
        private const val UPDATE_SQL =
            "UPDATE identity_email_otp_challenges SET attempts = ?, consumed_at = ? WHERE challenge_id = ?"
        private const val COUNT_SINCE_SQL =
            "SELECT count(*) FROM identity_email_otp_challenges WHERE email = ? AND created_at >= ?"
        private const val COUNT_ALL_SINCE_SQL =
            "SELECT count(*) FROM identity_email_otp_challenges WHERE created_at >= ?"
        private const val COUNT_NEW_ACCOUNT_SINCE_SQL =
            "SELECT count(*) FROM identity_email_otp_challenges " +
                "WHERE created_at >= ? AND account_existed = false"
        private const val LATEST_CREATED_SQL =
            "SELECT max(created_at) FROM identity_email_otp_challenges WHERE email = ?"
        private const val DELETE_EXPIRED_SQL =
            "DELETE FROM identity_email_otp_challenges WHERE expires_at <= ?"
    }
}
