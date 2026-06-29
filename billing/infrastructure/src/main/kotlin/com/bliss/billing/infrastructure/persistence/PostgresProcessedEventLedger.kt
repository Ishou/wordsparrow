package com.bliss.billing.infrastructure.persistence

import com.bliss.billing.application.ports.ProcessedEventLedger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import javax.sql.DataSource

// ON CONFLICT DO NOTHING makes recordIfAbsent atomic under concurrent webhook redelivery: exactly one INSERT wins, the rest report 0 affected rows (ADR-0078).
class PostgresProcessedEventLedger(
    private val dataSource: DataSource,
    private val now: () -> Instant = Instant::now,
) : ProcessedEventLedger {
    override suspend fun recordIfAbsent(eventId: String): Boolean =
        withContext(Dispatchers.IO) {
            dataSource.connection.use { conn ->
                conn.prepareStatement(INSERT_SQL).use { stmt ->
                    stmt.setString(1, eventId)
                    stmt.setObject(2, now().truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC))
                    stmt.executeUpdate() == 1
                }
            }
        }

    private companion object {
        const val INSERT_SQL =
            "INSERT INTO billing_processed_events (event_id, processed_at) VALUES (?, ?) ON CONFLICT (event_id) DO NOTHING"
    }
}
