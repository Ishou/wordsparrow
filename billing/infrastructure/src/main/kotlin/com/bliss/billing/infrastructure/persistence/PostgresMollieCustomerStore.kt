package com.bliss.billing.infrastructure.persistence

import com.bliss.billing.infrastructure.provider.MollieCustomerStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.sql.DataSource

// JDBC is blocking; every method dispatches to IO. Stores only opaque ids, never PII (ADR-0078).
class PostgresMollieCustomerStore(
    private val dataSource: DataSource,
    private val now: () -> Instant = Instant::now,
) : MollieCustomerStore {
    override suspend fun findCustomerId(userId: UUID): String? =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(SELECT_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.executeQuery().use { rs -> if (rs.next()) rs.getString("mollie_customer_id") else null }
                }
            }
        }

    override suspend fun findOrCreate(
        userId: UUID,
        lazyCreate: suspend () -> String,
    ): String {
        findCustomerId(userId)?.let { return it }
        val newId = lazyCreate()
        return withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(INSERT_OR_FIND_SQL).use { stmt ->
                    val ts = now().truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC)
                    stmt.setObject(1, userId)
                    stmt.setString(2, newId)
                    stmt.setObject(3, ts)
                    val rs = stmt.executeQuery()
                    if (rs.next()) {
                        rs.getString("mollie_customer_id")
                    } else {
                        // Concurrent insert won the conflict; read the winner from the same connection.
                        conn.prepareStatement(SELECT_SQL).use { sel ->
                            sel.setObject(1, userId)
                            sel.executeQuery().use { selRs ->
                                check(selRs.next()) { "billing_customers has no row for $userId after conflict" }
                                selRs.getString("mollie_customer_id")
                            }
                        }
                    }
                }
            }
        }
    }

    private companion object {
        const val SELECT_SQL = "SELECT mollie_customer_id FROM billing_customers WHERE user_id = ?"
        const val INSERT_OR_FIND_SQL =
            "INSERT INTO billing_customers (user_id, mollie_customer_id, created_at) " +
                "VALUES (?, ?, ?) ON CONFLICT (user_id) DO NOTHING " +
                "RETURNING mollie_customer_id"
    }
}
