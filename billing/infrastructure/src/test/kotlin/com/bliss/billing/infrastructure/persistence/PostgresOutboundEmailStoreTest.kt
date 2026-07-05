package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactly
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import assertk.assertions.isTrue
import com.bliss.billing.application.ports.OutboundEmailRecord
import com.bliss.billing.domain.OutboundEmailKind
import com.bliss.billing.domain.OutboundEmailStatus
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.test.runTest
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresOutboundEmailStoreTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var store: PostgresOutboundEmailStore

    private val now: Instant = Instant.parse("2026-07-04T10:00:00Z").truncatedTo(ChronoUnit.MICROS)

    @BeforeAll
    fun startPostgres() {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable()) { "Docker daemon not available" }
        pg = PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine")).apply { start() }
        dataSource =
            HikariDataSource(
                HikariConfig().apply {
                    jdbcUrl = pg.jdbcUrl
                    username = pg.username
                    password = pg.password
                },
            )
        Flyway
            .configure()
            .dataSource(dataSource)
            .table("flyway_schema_history_billing")
            .locations("classpath:db/migration")
            .load()
            .migrate()
        store = PostgresOutboundEmailStore(dataSource)
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE billing_outbound_emails").use { it.executeUpdate() }
            }
        }
    }

    private fun record(
        dedupeKey: String,
        nextAttemptAt: Instant? = now,
        attempts: Int = 0,
        status: OutboundEmailStatus = OutboundEmailStatus.PENDING,
    ) = OutboundEmailRecord(
        id = UUID.randomUUID(),
        userId = UUID.randomUUID(),
        kind = OutboundEmailKind.CONTRACT,
        dedupeKey = dedupeKey,
        subject = "Confirmation",
        htmlBody = "<p>corps</p>",
        textBody = "corps",
        status = status,
        attempts = attempts,
        nextAttemptAt = nextAttemptAt,
        lastError = null,
        createdAt = now,
        sentAt = null,
    )

    @Test
    fun `enqueue inserts once and is idempotent on the dedupe key`() =
        runTest {
            assertThat(store.enqueue(record("contract:1"))).isTrue()
            assertThat(store.enqueue(record("contract:1"))).isFalse()

            assertThat(store.claimDue(now, 10)).hasSize(1)
        }

    @Test
    fun `claimDue returns only due pending rows oldest-first`() =
        runTest {
            store.enqueue(record("due-old", nextAttemptAt = now.minusSeconds(120)))
            store.enqueue(record("due-now", nextAttemptAt = now))
            store.enqueue(record("future", nextAttemptAt = now.plusSeconds(600)))

            val due = store.claimDue(now, 10)

            assertThat(due.map { it.dedupeKey }).containsExactly("due-old", "due-now")
        }

    @Test
    fun `claimDue skips sent rows`() =
        runTest {
            store.enqueue(record("sent-row"))
            val sent = store.claimDue(now, 10).single()
            store.markSent(sent.id, now)

            assertThat(store.claimDue(now, 10)).hasSize(0)
        }

    @Test
    fun `claimDue honours the limit`() =
        runTest {
            store.enqueue(record("a"))
            store.enqueue(record("b"))
            store.enqueue(record("c"))

            assertThat(store.claimDue(now, 2)).hasSize(2)
        }

    @Test
    fun `markSent records the timestamp and clears the next attempt`() =
        runTest {
            store.enqueue(record("sent"))
            val row = store.claimDue(now, 10).single()

            store.markSent(row.id, now)

            val reloaded = reload(row.id)
            assertThat(reloaded.status).isEqualTo(OutboundEmailStatus.SENT)
            assertThat(reloaded.sentAt).isEqualTo(now)
            assertThat(reloaded.nextAttemptAt).isNull()
        }

    @Test
    fun `recordFailure increments attempts and reschedules while staying claimable`() =
        runTest {
            store.enqueue(record("retry"))
            val row = store.claimDue(now, 10).single()

            val nextAttempt = now.plusSeconds(1800)
            store.recordFailure(row.id, 1, nextAttempt, "boom")

            val reloaded = reload(row.id)
            assertThat(reloaded.status).isEqualTo(OutboundEmailStatus.PENDING)
            assertThat(reloaded.attempts).isEqualTo(1)
            assertThat(reloaded.nextAttemptAt).isEqualTo(nextAttempt)
            assertThat(reloaded.lastError).isEqualTo("boom")
            assertThat(store.claimDue(nextAttempt, 10)).hasSize(1)
        }

    @Test
    fun `markFailed puts the row in a terminal state that is never claimed`() =
        runTest {
            store.enqueue(record("dead"))
            val row = store.claimDue(now, 10).single()

            store.markFailed(row.id, "undeliverable")

            val reloaded = reload(row.id)
            assertThat(reloaded.status).isEqualTo(OutboundEmailStatus.FAILED)
            assertThat(reloaded.lastError).isEqualTo("undeliverable")
            assertThat(reloaded.nextAttemptAt).isNull()
            assertThat(store.claimDue(now.plusSeconds(999999), 10)).hasSize(0)
        }

    @Test
    fun `enqueue round-trips the stored content`() =
        runTest {
            store.enqueue(record("roundtrip"))

            val row = store.claimDue(now, 10).single()
            assertThat(row.kind).isEqualTo(OutboundEmailKind.CONTRACT)
            assertThat(row.subject).isEqualTo("Confirmation")
            assertThat(row.htmlBody).isEqualTo("<p>corps</p>")
            assertThat(row.textBody).isEqualTo("corps")
            assertThat(row.createdAt).isNotNull()
        }

    @Test
    fun `claimDue leases claimed rows so a second claim in the same window returns nothing`() =
        runTest {
            store.enqueue(record("leased"))

            assertThat(store.claimDue(now, 10)).hasSize(1)
            // The lease pushes next_attempt_at forward, so a concurrent drain at the same instant claims nothing.
            assertThat(store.claimDue(now, 10)).hasSize(0)
        }

    @Test
    fun `claimDue skips a row already locked by another transaction`() =
        runTest {
            store.enqueue(record("locked"))

            dataSource.connection.use { locker ->
                locker.autoCommit = false
                locker
                    .prepareStatement("SELECT id FROM billing_outbound_emails WHERE dedupe_key = ? FOR UPDATE")
                    .use { stmt ->
                        stmt.setString(1, "locked")
                        stmt.executeQuery().use { rs -> assertThat(rs.next()).isTrue() }
                    }

                // FOR UPDATE SKIP LOCKED means the drain steps over the row another transaction holds instead of blocking or double-claiming.
                assertThat(store.claimDue(now, 10)).hasSize(0)
                locker.rollback()
            }
        }

    @Test
    fun `claim wins a due pending row once and loses the second time`() =
        runTest {
            val row = record("claimable")
            store.enqueue(row)

            assertThat(store.claim(row.id, now)).isTrue()
            assertThat(store.claim(row.id, now)).isFalse()
        }

    @Test
    fun `claim loses when the row is no longer pending`() =
        runTest {
            val row = record("sent-then-claim")
            store.enqueue(row)
            store.markSent(row.id, now)

            assertThat(store.claim(row.id, now)).isFalse()
        }

    @Test
    fun `pendingBacklog counts only pending rows`() =
        runTest {
            store.enqueue(record("pending-a"))
            val delivered = record("delivered")
            store.enqueue(delivered)
            store.markSent(delivered.id, now)

            assertThat(store.pendingBacklog()).isEqualTo(1)
        }

    // Reads a row back directly by id regardless of status (claimDue only returns pending rows).
    private fun reload(id: UUID): OutboundEmailRecord =
        dataSource.connection.use { conn ->
            conn
                .prepareStatement(
                    "SELECT status, attempts, next_attempt_at, last_error, sent_at FROM billing_outbound_emails WHERE id = ?",
                ).use { stmt ->
                    stmt.setObject(1, id)
                    stmt.executeQuery().use { rs ->
                        rs.next()
                        OutboundEmailRecord(
                            id = id,
                            userId = UUID.randomUUID(),
                            kind = OutboundEmailKind.CONTRACT,
                            dedupeKey = "n/a",
                            subject = "",
                            htmlBody = "",
                            textBody = "",
                            status = OutboundEmailStatus.fromWire(rs.getString("status")),
                            attempts = rs.getInt("attempts"),
                            nextAttemptAt =
                                rs.getObject("next_attempt_at", java.time.OffsetDateTime::class.java)?.toInstant(),
                            lastError = rs.getString("last_error"),
                            createdAt = now,
                            sentAt = rs.getObject("sent_at", java.time.OffsetDateTime::class.java)?.toInstant(),
                        )
                    }
                }
        }
}
