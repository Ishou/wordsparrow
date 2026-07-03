package com.bliss.identity.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.EmailAddress
import com.bliss.identity.domain.user.Role
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.kotest.property.Arb
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
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
class PostgresUserRepositoryTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource
    private lateinit var repo: PostgresUserRepository

    private val now: Instant = Instant.parse("2026-05-17T12:00:00Z")

    private fun user(id: UUID = UUID.randomUUID()): User =
        User(
            id = UserId(id),
            displayName = DisplayName.of("Alice"),
            createdAt = now,
            lastSeenAt = now,
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
        repo = PostgresUserRepository(dataSource)
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
    fun `findById returns null when empty`() =
        runTest {
            assertThat(repo.findById(UserId(UUID.randomUUID()))).isNull()
        }

    @Test
    fun `create then findById round-trips`() =
        runTest {
            val u = user()
            repo.create(u)
            assertThat(repo.findById(u.id)).isEqualTo(u)
        }

    @Test
    fun `updateLastSeenAt updates the timestamp`() =
        runTest {
            val u = user()
            repo.create(u)
            val later = now.plusSeconds(60)
            repo.updateLastSeenAt(u.id, later)
            assertThat(repo.findById(u.id)?.lastSeenAt).isEqualTo(later)
        }

    @Test
    fun `updateLastSeenAt is a no-op for an unknown user`() =
        runTest {
            val unknownId = UserId(UUID.randomUUID())
            repo.updateLastSeenAt(unknownId, now)
            assertThat(repo.findById(unknownId)).isNull()
        }

    @Test
    fun `delete removes the user`() =
        runTest {
            val u = user()
            repo.create(u)
            repo.delete(u.id)
            assertThat(repo.findById(u.id)).isNull()
        }

    @Test
    fun `create persists email and findById reads it back`() =
        runTest {
            val u = user().copy(email = "player@example.com")
            repo.create(u)
            assertThat(repo.findById(u.id)?.email).isEqualTo("player@example.com")
        }

    @Test
    fun `email is null when the column was never set`() =
        runTest {
            val u = user()
            repo.create(u)
            assertThat(repo.findById(u.id)?.email).isNull()
        }

    @Test
    fun `updateEmail refreshes the stored email`() =
        runTest {
            val u = user().copy(email = "old@example.com")
            repo.create(u)
            repo.updateEmail(u.id, "new@example.com")
            assertThat(repo.findById(u.id)?.email).isEqualTo("new@example.com")
        }

    @Test
    fun `updateEmail is a no-op for an unknown user`() =
        runTest {
            val unknownId = UserId(UUID.randomUUID())
            repo.updateEmail(unknownId, "ghost@example.com")
            assertThat(repo.findById(unknownId)).isNull()
        }

    @Test
    fun `deleting a user erases the stored email (RGPD)`() =
        runTest {
            val u = user().copy(email = "erase-me@example.com")
            repo.create(u)
            repo.delete(u.id)
            assertThat(repo.findById(u.id)).isNull()
        }

    @Test
    fun `delete is a no-op for an unknown user`() =
        runTest {
            repo.delete(UserId(UUID.randomUUID()))
            // No throw, no row created.
        }

    @Test
    fun `create is idempotent for an existing user`() =
        runTest {
            val u = user()
            repo.create(u)
            repo.create(u.copy(displayName = DisplayName.of("Updated")))
            assertThat(repo.findById(u.id)).isEqualTo(u)
        }

    @Test
    fun `Instant round-trips through Postgres with microsecond precision`() =
        runTest {
            checkAll(
                Arb.long(
                    Instant.parse("2000-01-01T00:00:00Z").toEpochMilli()..Instant.parse("2100-01-01T00:00:00Z").toEpochMilli(),
                ),
                Arb.int(0..999_999),
            ) { ms, ns ->
                val truncated =
                    Instant.ofEpochMilli(ms).plusNanos(ns.toLong()).truncatedTo(ChronoUnit.MICROS)
                val u = User(UserId(UUID.randomUUID()), DisplayName.of("PBT"), truncated, truncated)
                repo.create(u)
                assertThat(repo.findById(u.id)?.createdAt).isEqualTo(truncated)
                repo.delete(u.id)
            }
        }

    @Test
    fun `updateLastSeenAt round-trips Instant with microsecond precision`() =
        runTest {
            val u = user()
            repo.create(u)
            checkAll(
                Arb.long(
                    Instant.parse("2000-01-01T00:00:00Z").toEpochMilli()..Instant.parse("2100-01-01T00:00:00Z").toEpochMilli(),
                ),
                Arb.int(0..999_999),
            ) { ms, ns ->
                val truncated =
                    Instant.ofEpochMilli(ms).plusNanos(ns.toLong()).truncatedTo(ChronoUnit.MICROS)
                repo.updateLastSeenAt(u.id, truncated)
                assertThat(repo.findById(u.id)?.lastSeenAt).isEqualTo(truncated)
            }
            repo.delete(u.id)
        }

    @Test
    fun `updateDisplayName updates the stored name`() =
        runTest {
            val u = user()
            repo.create(u)
            repo.updateDisplayName(u.id, DisplayName.of("Bob"))
            assertThat(repo.findById(u.id)?.displayName).isEqualTo(DisplayName.of("Bob"))
        }

    @Test
    fun `updateDisplayName is a no-op for an unknown user`() =
        runTest {
            val unknownId = UserId(UUID.randomUUID())
            repo.updateDisplayName(unknownId, DisplayName.of("Ghost"))
            assertThat(repo.findById(unknownId)).isNull()
        }

    @Test
    fun `new user defaults to player on read`() =
        runTest {
            val u = user()
            repo.create(u)
            assertThat(repo.findById(u.id)?.role).isEqualTo(Role.PLAYER)
        }

    @Test
    fun `create persists an explicit role`() =
        runTest {
            val u = user().copy(role = Role.MAINTAINER)
            repo.create(u)
            assertThat(repo.findById(u.id)?.role).isEqualTo(Role.MAINTAINER)
        }

    @Test
    fun `updateRole promotes an existing user`() =
        runTest {
            val u = user()
            repo.create(u)
            repo.updateRole(u.id, Role.MAINTAINER)
            assertThat(repo.findById(u.id)?.role).isEqualTo(Role.MAINTAINER)
        }

    @Test
    fun `updateRole is a no-op for an unknown user`() =
        runTest {
            val unknownId = UserId(UUID.randomUUID())
            repo.updateRole(unknownId, Role.MAINTAINER)
            assertThat(repo.findById(unknownId)).isNull()
        }

    @Test
    fun `findByEmail returns empty when no user matches`() =
        runTest {
            repo.create(user().copy(email = "someone@example.com"))
            assertThat(repo.findByEmail(EmailAddress.of("nobody@example.com"))).isEmpty()
        }

    @Test
    fun `findByEmail returns the single matching user`() =
        runTest {
            val u = user().copy(email = "match@example.com")
            repo.create(u)
            repo.create(user().copy(email = "other@example.com"))
            assertThat(repo.findByEmail(EmailAddress.of("match@example.com"))).isEqualTo(listOf(u))
        }

    @Test
    fun `findByEmail matches case-insensitively against stored casing`() =
        runTest {
            val u = user().copy(email = "Mixed.Case@Example.com")
            repo.create(u)
            assertThat(repo.findByEmail(EmailAddress.of("mixed.case@example.com"))).isEqualTo(listOf(u))
        }

    @Test
    fun `findByEmail returns every user sharing the email`() =
        runTest {
            val a = user().copy(email = "shared@example.com")
            val b = user().copy(email = "shared@example.com")
            repo.create(a)
            repo.create(b)
            assertThat(repo.findByEmail(EmailAddress.of("shared@example.com"))).containsExactlyInAnyOrder(a, b)
        }

    @Test
    fun `rows inserted without a role read back as player`() =
        runTest {
            val id = UUID.randomUUID()
            dataSource.connection.use { conn ->
                conn
                    .prepareStatement(
                        "INSERT INTO identity_users (user_id, display_name, created_at, last_seen_at) " +
                            "VALUES (?, ?, ?, ?)",
                    ).use { stmt ->
                        stmt.setObject(1, id)
                        stmt.setString(2, "Legacy")
                        stmt.setObject(3, now.atOffset(java.time.ZoneOffset.UTC))
                        stmt.setObject(4, now.atOffset(java.time.ZoneOffset.UTC))
                        stmt.executeUpdate()
                    }
            }
            assertThat(repo.findById(UserId(id))?.role).isEqualTo(Role.PLAYER)
        }
}
