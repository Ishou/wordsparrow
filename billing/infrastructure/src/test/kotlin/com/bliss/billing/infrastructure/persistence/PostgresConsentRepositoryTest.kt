package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.billing.domain.CheckoutConsent
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
import java.time.OffsetDateTime
import java.time.temporal.ChronoUnit
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresConsentRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresConsentRepository

    private val createdAt: Instant = Instant.parse("2026-07-04T12:00:00Z").truncatedTo(ChronoUnit.MICROS)
    private val acceptedAt: Instant = Instant.parse("2026-07-04T11:59:58Z").truncatedTo(ChronoUnit.MICROS)

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
    fun freshRepo() {
        if (!::dataSource.isInitialized) return
        repo = PostgresConsentRepository(dataSource, now = { createdAt })
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE billing_checkout_consents").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `record persists the consent row with server timestamps`() =
        runTest {
            val userId = UUID.randomUUID()
            repo.record(userId, CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = true), acceptedAt)

            val rows = rowsFor(userId)
            assertThat(rows).isEqualTo(
                listOf(
                    Row(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = true, acceptedAt = acceptedAt, createdAt = createdAt),
                ),
            )
        }

    @Test
    fun `record persists a declined withdrawal waiver`() =
        runTest {
            val userId = UUID.randomUUID()
            repo.record(userId, CheckoutConsent(cgvAccepted = true, cgvVersion = "2.0", withdrawalWaiver = false), acceptedAt)

            assertThat(rowsFor(userId).single().withdrawalWaiver).isEqualTo(false)
        }

    @Test
    fun `record is append-only for the same user`() =
        runTest {
            val userId = UUID.randomUUID()
            repo.record(userId, CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = true), acceptedAt)
            repo.record(userId, CheckoutConsent(cgvAccepted = true, cgvVersion = "2.0", withdrawalWaiver = false), acceptedAt)

            assertThat(rowsFor(userId).map { it.cgvVersion }).isEqualTo(listOf("1.0", "2.0"))
        }

    private data class Row(
        val cgvAccepted: Boolean,
        val cgvVersion: String,
        val withdrawalWaiver: Boolean,
        val acceptedAt: Instant,
        val createdAt: Instant,
    )

    private fun rowsFor(userId: UUID): List<Row> =
        dataSource.connection.use { conn ->
            conn
                .prepareStatement(
                    "SELECT cgv_accepted, cgv_version, withdrawal_waiver, accepted_at, created_at " +
                        "FROM billing_checkout_consents WHERE user_id = ? ORDER BY id",
                ).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.executeQuery().use { rs ->
                        buildList {
                            while (rs.next()) {
                                add(
                                    Row(
                                        cgvAccepted = rs.getBoolean("cgv_accepted"),
                                        cgvVersion = rs.getString("cgv_version"),
                                        withdrawalWaiver = rs.getBoolean("withdrawal_waiver"),
                                        acceptedAt = rs.getObject("accepted_at", OffsetDateTime::class.java).toInstant(),
                                        createdAt = rs.getObject("created_at", OffsetDateTime::class.java).toInstant(),
                                    ),
                                )
                            }
                        }
                    }
                }
        }
}
