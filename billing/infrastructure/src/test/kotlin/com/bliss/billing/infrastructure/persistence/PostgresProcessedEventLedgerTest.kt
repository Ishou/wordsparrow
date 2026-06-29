package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.coroutines.test.runTest
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.time.Instant
import java.time.temporal.ChronoUnit

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresProcessedEventLedgerTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var ledger: PostgresProcessedEventLedger

    private val now: Instant = Instant.parse("2026-06-29T12:00:00Z").truncatedTo(ChronoUnit.MICROS)

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
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @BeforeEach
    fun freshLedger() {
        if (!::dataSource.isInitialized) return
        ledger = PostgresProcessedEventLedger(dataSource, now = { now })
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE billing_processed_events").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `records a new event id once`() =
        runTest {
            assertThat(ledger.recordIfAbsent("tr_1")).isTrue()
        }

    @Test
    fun `rejects a redelivered event id`() =
        runTest {
            ledger.recordIfAbsent("tr_1")
            assertThat(ledger.recordIfAbsent("tr_1")).isFalse()
        }

    @Test
    fun `records distinct event ids independently`() =
        runTest {
            assertThat(ledger.recordIfAbsent("tr_1")).isTrue()
            assertThat(ledger.recordIfAbsent("tr_2")).isTrue()
        }
}
