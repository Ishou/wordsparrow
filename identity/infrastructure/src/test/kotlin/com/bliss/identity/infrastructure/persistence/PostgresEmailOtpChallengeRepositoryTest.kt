package com.bliss.identity.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.identity.domain.auth.ChallengeId
import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.user.EmailAddress
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
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresEmailOtpChallengeRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresEmailOtpChallengeRepository

    private val now: Instant = Instant.parse("2026-07-03T12:00:00Z")
    private val alice = EmailAddress.of("alice@example.com")
    private val bob = EmailAddress.of("bob@example.com")

    private fun challenge(
        email: EmailAddress = alice,
        id: UUID = UUID.randomUUID(),
        codeHash: String = "codehash",
        bindingHash: String = "bindinghash",
        attempts: Int = 0,
        createdAt: Instant = now,
        expiresAt: Instant = now.plusSeconds(600),
        consumedAt: Instant? = null,
    ): EmailOtpChallenge =
        EmailOtpChallenge(
            id = ChallengeId(id),
            email = email,
            codeHash = codeHash,
            bindingHash = bindingHash,
            attempts = attempts,
            createdAt = createdAt,
            expiresAt = expiresAt,
            consumedAt = consumedAt,
        )

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
        repo = PostgresEmailOtpChallengeRepository(dataSource)
    }

    @AfterEach
    fun truncate() {
        if (::dataSource.isInitialized) {
            dataSource.connection.use { conn ->
                conn.prepareStatement("TRUNCATE identity_email_otp_challenges").use { it.executeUpdate() }
            }
        }
    }

    @Test
    fun `findActiveByEmail returns null when empty`() =
        runTest {
            assertThat(repo.findActiveByEmail(alice, now)).isNull()
        }

    @Test
    fun `create then findActiveByEmail round-trips`() =
        runTest {
            val c = challenge(attempts = 2, consumedAt = null)
            repo.create(c)
            assertThat(repo.findActiveByEmail(alice, now)).isEqualTo(c)
        }

    @Test
    fun `findActiveByEmail returns the newest active challenge`() =
        runTest {
            val older = challenge(createdAt = now.minusSeconds(120))
            val newer = challenge(createdAt = now.minusSeconds(10))
            repo.create(older)
            repo.create(newer)
            assertThat(repo.findActiveByEmail(alice, now)).isEqualTo(newer)
        }

    @Test
    fun `findActiveByEmail excludes expired challenges`() =
        runTest {
            repo.create(challenge(expiresAt = now.minusSeconds(1)))
            assertThat(repo.findActiveByEmail(alice, now)).isNull()
        }

    @Test
    fun `findActiveByEmail treats the expiry boundary as expired`() =
        runTest {
            repo.create(challenge(expiresAt = now))
            assertThat(repo.findActiveByEmail(alice, now)).isNull()
        }

    @Test
    fun `findActiveByEmail excludes consumed challenges`() =
        runTest {
            repo.create(challenge(consumedAt = now.minusSeconds(5)))
            assertThat(repo.findActiveByEmail(alice, now)).isNull()
        }

    @Test
    fun `findActiveByEmail is scoped to the requested email`() =
        runTest {
            repo.create(challenge(email = bob))
            assertThat(repo.findActiveByEmail(alice, now)).isNull()
        }

    @Test
    fun `countCreatedSince counts only rows at or after the boundary for the email`() =
        runTest {
            repo.create(challenge(createdAt = now.minusSeconds(30)))
            repo.create(challenge(createdAt = now.minusSeconds(90)))
            repo.create(challenge(email = bob, createdAt = now.minusSeconds(30)))
            assertThat(repo.countCreatedSince(alice, now.minusSeconds(60))).isEqualTo(1)
        }

    @Test
    fun `latestCreatedAt returns the most recent creation for the email`() =
        runTest {
            repo.create(challenge(createdAt = now.minusSeconds(120)))
            repo.create(challenge(createdAt = now.minusSeconds(15)))
            assertThat(repo.latestCreatedAt(alice)).isEqualTo(now.minusSeconds(15))
        }

    @Test
    fun `latestCreatedAt returns null for an email with no challenges`() =
        runTest {
            assertThat(repo.latestCreatedAt(alice)).isNull()
        }

    @Test
    fun `save persisting a consumed timestamp excludes the challenge from findActive`() =
        runTest {
            val c = challenge()
            repo.create(c)
            assertThat(repo.findActiveByEmail(alice, now)).isEqualTo(c)
            repo.save(c.consumed(now.plusSeconds(30)))
            assertThat(repo.findActiveByEmail(alice, now)).isNull()
        }

    @Test
    fun `save updates attempts and leaves the challenge findable while still active`() =
        runTest {
            val c = challenge()
            repo.create(c)
            repo.save(c.withIncrementedAttempt())
            assertThat(repo.findActiveByEmail(alice, now)?.attempts).isEqualTo(1)
        }

    @Test
    fun `deleteExpired removes only expired challenges`() =
        runTest {
            val active = challenge(id = UUID.randomUUID(), expiresAt = now.plusSeconds(300))
            val expired = challenge(id = UUID.randomUUID(), email = bob, expiresAt = now.minusSeconds(1))
            repo.create(active)
            repo.create(expired)
            repo.deleteExpired(now)
            assertThat(repo.findActiveByEmail(alice, now)).isEqualTo(active)
            assertThat(repo.countCreatedSince(bob, now.minusSeconds(600))).isEqualTo(0)
        }
}
