package com.bliss.billing.infrastructure.persistence

import com.bliss.billing.application.ports.ConsentRepository
import com.bliss.billing.domain.CheckoutConsent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

// JDBC is blocking; the write dispatches to IO. Append-only insert: consent is never overwritten so the point-in-time legal record survives (ADR-0094).
class PostgresConsentRepository(
    private val dataSource: DataSource,
    private val now: () -> Instant = Instant::now,
) : ConsentRepository {
    override suspend fun record(
        userId: UUID,
        consent: CheckoutConsent,
        acceptedAt: Instant,
    ) {
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(INSERT_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.setBoolean(2, consent.cgvAccepted)
                    stmt.setString(3, consent.cgvVersion)
                    stmt.setBoolean(4, consent.withdrawalWaiver)
                    stmt.setObject(5, acceptedAt.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.setObject(6, now().truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.executeUpdate()
                }
            }
        }
    }

    override suspend fun findLatest(userId: UUID): CheckoutConsent? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_LATEST_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.executeQuery().use { rs ->
                        if (!rs.next()) {
                            null
                        } else {
                            CheckoutConsent(
                                cgvAccepted = rs.getBoolean("cgv_accepted"),
                                cgvVersion = rs.getString("cgv_version"),
                                withdrawalWaiver = rs.getBoolean("withdrawal_waiver"),
                            )
                        }
                    }
                }
            }
        }

    companion object {
        private const val INSERT_SQL =
            "INSERT INTO billing_checkout_consents " +
                "(user_id, cgv_accepted, cgv_version, withdrawal_waiver, accepted_at, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?)"

        private const val SELECT_LATEST_SQL =
            "SELECT cgv_accepted, cgv_version, withdrawal_waiver FROM billing_checkout_consents " +
                "WHERE user_id = ? ORDER BY accepted_at DESC, id DESC LIMIT 1"
    }
}
