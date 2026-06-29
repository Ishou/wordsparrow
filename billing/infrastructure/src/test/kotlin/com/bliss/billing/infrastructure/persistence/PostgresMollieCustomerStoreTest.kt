package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
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
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresMollieCustomerStoreTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var store: PostgresMollieCustomerStore

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
    fun freshStore() {
        if (!::dataSource.isInitialized) return
        store = PostgresMollieCustomerStore(dataSource, now = { now })
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE billing_customers").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `findCustomerId returns null when no row exists`() =
        runTest {
            assertThat(store.findCustomerId(UUID.randomUUID())).isNull()
        }

    @Test
    fun `findOrCreate inserts a new row and returns the created id`() =
        runTest {
            val userId = UUID.randomUUID()
            var callCount = 0
            val result =
                store.findOrCreate(userId) {
                    callCount++
                    "cus_new"
                }
            assertThat(result).isEqualTo("cus_new")
            assertThat(callCount).isEqualTo(1)
            assertThat(store.findCustomerId(userId)).isEqualTo("cus_new")
        }

    @Test
    fun `findOrCreate returns the existing id without calling lazyCreate when row already exists`() =
        runTest {
            val userId = UUID.randomUUID()
            insertDirectly(userId, "cus_existing")
            var callCount = 0
            val result =
                store.findOrCreate(userId) {
                    callCount++
                    "cus_should_not_be_used"
                }
            assertThat(result).isEqualTo("cus_existing")
            assertThat(callCount).isEqualTo(0)
        }

    @Test
    fun `findOrCreate returns the pre-existing id when a concurrent insert wins the conflict`() =
        runTest {
            val userId = UUID.randomUUID()
            // lazyCreate inserts the winning row directly before returning, simulating the concurrent race:
            // INSERT … ON CONFLICT DO NOTHING RETURNING returns nothing, triggering the fallback SELECT.
            val result =
                store.findOrCreate(userId) {
                    insertDirectly(userId, "cus_winner")
                    "cus_late"
                }
            assertThat(result).isEqualTo("cus_winner")
        }

    private fun insertDirectly(
        userId: UUID,
        mollieCustomerId: String,
    ) {
        dataSource.connection.use { conn ->
            conn
                .prepareStatement(
                    "INSERT INTO billing_customers (user_id, mollie_customer_id, created_at) VALUES (?, ?, ?)",
                ).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.setString(2, mollieCustomerId)
                    stmt.setObject(3, now.atOffset(ZoneOffset.UTC))
                    stmt.executeUpdate()
                }
        }
    }
}
