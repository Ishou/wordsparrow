package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.billing.domain.RenewalNoticeKind
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
class PostgresRenewalNoticeLedgerTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var ledger: PostgresRenewalNoticeLedger

    private val periodEnd: Instant = Instant.parse("2026-08-15T00:00:00Z").truncatedTo(ChronoUnit.MICROS)
    private val sentAt: Instant = Instant.parse("2026-07-04T03:00:00Z").truncatedTo(ChronoUnit.MICROS)

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
        ledger = PostgresRenewalNoticeLedger(dataSource)
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
                conn.prepareStatement("TRUNCATE billing_renewal_notices").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `hasSent is false before any notice is recorded`() =
        runTest {
            assertThat(ledger.hasSent(UUID.randomUUID(), periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL)).isFalse()
        }

    @Test
    fun `record then hasSent reports the notice was sent for that period`() =
        runTest {
            val userId = UUID.randomUUID()
            ledger.record(userId, "sub_1", periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL, sentAt)

            assertThat(ledger.hasSent(userId, periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL)).isTrue()
        }

    @Test
    fun `hasSent stays false for a different period end`() =
        runTest {
            val userId = UUID.randomUUID()
            ledger.record(userId, "sub_1", periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL, sentAt)

            assertThat(
                ledger.hasSent(userId, periodEnd.plus(365, ChronoUnit.DAYS), RenewalNoticeKind.CHATEL_PRE_RENEWAL),
            ).isFalse()
        }

    @Test
    fun `record is idempotent for the same user, period and kind`() =
        runTest {
            val userId = UUID.randomUUID()
            ledger.record(userId, "sub_1", periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL, sentAt)
            ledger.record(userId, "sub_1", periodEnd, RenewalNoticeKind.CHATEL_PRE_RENEWAL, sentAt.plusSeconds(60))

            assertThat(rowCount(userId)).isEqualTo(1)
        }

    private fun rowCount(userId: UUID): Int =
        dataSource.connection.use { conn ->
            conn.prepareStatement("SELECT count(*) FROM billing_renewal_notices WHERE user_id = ?").use { stmt ->
                stmt.setObject(1, userId)
                stmt.executeQuery().use { rs ->
                    rs.next()
                    rs.getInt(1)
                }
            }
        }
}
