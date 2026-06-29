package com.bliss.billing.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
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
class PostgresSubscriptionRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresSubscriptionRepository

    private val now: Instant = Instant.parse("2026-06-29T12:00:00Z").truncatedTo(ChronoUnit.MICROS)
    private val periodEnd: Instant = Instant.parse("2026-07-29T12:00:00Z").truncatedTo(ChronoUnit.MICROS)

    private fun sub(
        userId: UUID = UUID.randomUUID(),
        tier: Tier = Tier.of("premium"),
        status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
        externalRef: String = "sub_${UUID.randomUUID()}",
        end: Instant? = periodEnd,
    ) = Subscription(userId, tier, status, BillingSource.MOLLIE, externalRef, end)

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
        repo = PostgresSubscriptionRepository(dataSource, now = { now })
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE billing_subscriptions").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `findByUserId returns null when empty`() =
        runTest {
            assertThat(repo.findByUserId(UUID.randomUUID())).isNull()
        }

    @Test
    fun `save then findByUserId round-trips`() =
        runTest {
            val subscription = sub()
            repo.save(subscription)
            assertThat(repo.findByUserId(subscription.userId)).isEqualTo(subscription)
        }

    @Test
    fun `save upserts the existing row for the same user`() =
        runTest {
            val original = sub()
            repo.save(original)
            val updated = original.copy(status = SubscriptionStatus.PAST_DUE, periodEnd = null)
            repo.save(updated)
            assertThat(repo.findByUserId(original.userId)).isEqualTo(updated)
        }

    @Test
    fun `findByExternalRef returns the matching subscription`() =
        runTest {
            val subscription = sub(externalRef = "sub_abc123")
            repo.save(subscription)
            assertThat(repo.findByExternalRef("sub_abc123")).isEqualTo(subscription)
            assertThat(repo.findByExternalRef("sub_missing")).isNull()
        }

    @Test
    fun `delete removes the projection`() =
        runTest {
            val subscription = sub()
            repo.save(subscription)
            repo.delete(subscription.userId)
            assertThat(repo.findByUserId(subscription.userId)).isNull()
        }

    @Test
    fun `delete is a no-op when no projection exists`() =
        runTest {
            repo.delete(UUID.randomUUID())
        }

    @Test
    fun `listActive excludes canceled and expired`() =
        runTest {
            val active = sub(status = SubscriptionStatus.ACTIVE)
            val pastDue = sub(status = SubscriptionStatus.PAST_DUE)
            val pendingCancellation = sub(status = SubscriptionStatus.PENDING_CANCELLATION)
            val canceled = sub(status = SubscriptionStatus.CANCELED)
            val expired = sub(status = SubscriptionStatus.EXPIRED)
            listOf(active, pastDue, pendingCancellation, canceled, expired).forEach { repo.save(it) }
            assertThat(repo.listActive().map { it.userId })
                .containsExactlyInAnyOrder(active.userId, pastDue.userId, pendingCancellation.userId)
        }

    @Test
    fun `enum wire casing round-trips through a raw lowercase insert`() =
        runTest {
            val userId = UUID.randomUUID()
            insertRawLowercase(userId, status = "pending_cancellation", source = "mollie", tier = "premium", externalRef = "sub_wire")
            val loaded = repo.findByUserId(userId)
            assertThat(loaded?.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(loaded?.source).isEqualTo(BillingSource.MOLLIE)
            assertThat(loaded?.tier).isEqualTo(Tier.of("premium"))
        }

    // Inserts with the SAME lowercase `.wire` casing the prod writer emits, so the fixture cannot pass while the prod read path fails.
    private fun insertRawLowercase(
        userId: UUID,
        status: String,
        source: String,
        tier: String,
        externalRef: String,
    ) {
        dataSource.connection.use { conn ->
            conn
                .prepareStatement(
                    "INSERT INTO billing_subscriptions " +
                        "(user_id, tier, status, source, external_ref, period_end, created_at, updated_at) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ).use { stmt ->
                    stmt.setObject(1, userId)
                    stmt.setString(2, tier)
                    stmt.setString(3, status)
                    stmt.setString(4, source)
                    stmt.setString(5, externalRef)
                    stmt.setObject(6, periodEnd.atOffset(ZoneOffset.UTC))
                    stmt.setObject(7, now.atOffset(ZoneOffset.UTC))
                    stmt.setObject(8, now.atOffset(ZoneOffset.UTC))
                    stmt.executeUpdate()
                }
        }
    }
}
