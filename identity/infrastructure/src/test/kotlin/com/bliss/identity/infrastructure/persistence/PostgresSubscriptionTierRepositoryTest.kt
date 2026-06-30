package com.bliss.identity.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.domain.user.UserSubscription
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
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresSubscriptionTierRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresSubscriptionTierRepository
    private lateinit var users: PostgresUserRepository

    private val now: Instant = Instant.parse("2026-06-30T12:00:00Z").truncatedTo(ChronoUnit.MICROS)

    private suspend fun seedUser(id: UUID = UUID.randomUUID()): UserId {
        val userId = UserId(id)
        users.create(User(userId, DisplayName.of("Alice"), now, now))
        return userId
    }

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
            .table("flyway_schema_history_identity")
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
        repo = PostgresSubscriptionTierRepository(dataSource)
        users = PostgresUserRepository(dataSource)
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE identity_users CASCADE").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `find returns null when there is no subscription row`() =
        runTest {
            val userId = seedUser()
            assertThat(repo.find(userId)).isNull()
        }

    @Test
    fun `upsert then find round-trips the subscription`() =
        runTest {
            val userId = seedUser()
            val sub = UserSubscription(userId, SubscriptionTier.SUBSCRIBER, now)
            repo.upsert(sub)
            assertThat(repo.find(userId)).isEqualTo(sub)
        }

    @Test
    fun `upsert overwrites an existing row`() =
        runTest {
            val userId = seedUser()
            repo.upsert(UserSubscription(userId, SubscriptionTier.SUBSCRIBER, now))
            repo.upsert(UserSubscription(userId, SubscriptionTier.FREE, now.plusSeconds(60)))
            val stored = repo.find(userId)
            assertThat(stored?.tier).isEqualTo(SubscriptionTier.FREE)
            assertThat(stored?.changedAt).isEqualTo(now.plusSeconds(60))
        }

    @Test
    fun `deleting the user cascades the subscription row away`() =
        runTest {
            val userId = seedUser()
            repo.upsert(UserSubscription(userId, SubscriptionTier.SUBSCRIBER, now))
            users.delete(userId)
            assertThat(repo.find(userId)).isNull()
        }
}
