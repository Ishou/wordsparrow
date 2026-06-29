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

    override suspend fun save(
        userId: UUID,
        mollieCustomerId: String,
    ) {
        withContext(Dispatchers.IO) {
            val ts = now().truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC)
            dataSource.connection.use { conn ->
                conn.prepareStatement(UPSERT_SQL).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.setString(2, mollieCustomerId)
                    stmt.setObject(3, ts)
                    stmt.executeUpdate()
                }
            }
        }
    }

    private companion object {
        const val SELECT_SQL = "SELECT mollie_customer_id FROM billing_customers WHERE user_id = ?"
        const val UPSERT_SQL =
            "INSERT INTO billing_customers (user_id, mollie_customer_id, created_at) " +
                "VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET mollie_customer_id = EXCLUDED.mollie_customer_id"
    }
}
