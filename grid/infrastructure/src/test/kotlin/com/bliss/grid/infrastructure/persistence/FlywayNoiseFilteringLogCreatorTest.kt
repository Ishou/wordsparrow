package com.bliss.grid.infrastructure.persistence

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import ch.qos.logback.classic.Level
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.configuration.FluentConfiguration
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.slf4j.LoggerFactory
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import ch.qos.logback.classic.Logger as LogbackLogger

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FlywayNoiseFilteringLogCreatorTest {
    private lateinit var pg: PostgreSQLContainer<*>
    private lateinit var dataSource: HikariDataSource

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
        // Populate flyway_schema_history so a later migrate against an empty location sees "future" applied versions with nothing resolved, firing the noisy line.
        Flyway
            .configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration")
            .load()
            .migrate()
    }

    @AfterAll
    fun stopPostgres() {
        if (::dataSource.isInitialized) dataSource.close()
        if (::pg.isInitialized) pg.stop()
    }

    @Test
    fun `flyway logs the no-migration-resolved line at error by default`() {
        val events = migrateAgainstEmptyLocationCapturing { it }
        val noise = events.filter { it.formattedMessage.contains(NOISE) }
        assertThat(noise).hasSize(1)
        assertThat(noise.first().level).isEqualTo(Level.ERROR)
    }

    @Test
    fun `the noise-filtering log creator demotes that line to debug`() {
        val events =
            migrateAgainstEmptyLocationCapturing {
                it.loggers("com.bliss.grid.infrastructure.persistence.FlywayNoiseFilteringLogCreator")
            }
        val noise = events.filter { it.formattedMessage.contains(NOISE) }
        assertThat(noise).hasSize(1)
        assertThat(noise.first().level).isEqualTo(Level.DEBUG)
        assertThat(noise.filter { it.level == Level.ERROR }).isEmpty()
    }

    private fun migrateAgainstEmptyLocationCapturing(configure: (FluentConfiguration) -> FluentConfiguration): List<ILoggingEvent> {
        val logger = LoggerFactory.getLogger("org.flywaydb.core.internal.command.DbMigrate") as LogbackLogger
        val original = logger.level
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.level = Level.DEBUG
        logger.addAppender(appender)
        try {
            configure(
                Flyway.configure().dataSource(dataSource).locations("classpath:db/no-migrations-here"),
            ).load().migrate()
            return appender.list.toList()
        } finally {
            logger.detachAppender(appender)
            logger.level = original
        }
    }

    private companion object {
        const val NOISE = "but no migration could be resolved in the configured locations"
    }
}
