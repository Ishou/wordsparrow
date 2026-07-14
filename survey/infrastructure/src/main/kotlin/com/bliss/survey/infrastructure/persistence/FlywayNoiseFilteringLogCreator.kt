package com.bliss.survey.infrastructure.persistence

import org.flywaydb.core.api.logging.Log
import org.flywaydb.core.api.logging.LogCreator
import org.slf4j.Logger
import org.slf4j.LoggerFactory

/** Demotes Flyway's benign "no migration could be resolved in the configured locations" line — logged at ERROR on every boot when the schema is already current — to DEBUG, so it stops polluting ERROR-level observability. */
class FlywayNoiseFilteringLogCreator : LogCreator {
    override fun createLogger(clazz: Class<*>): Log = DemotingSlf4jLog(LoggerFactory.getLogger(clazz))
}

private class DemotingSlf4jLog(
    private val logger: Logger,
) : Log {
    override fun debug(message: String) = logger.debug(message)

    override fun info(message: String) = logger.info(message)

    override fun warn(message: String) = logger.warn(message)

    override fun error(message: String) {
        if (message.contains(SCHEMA_AHEAD_OF_LOCATIONS)) logger.debug(message) else logger.error(message)
    }

    override fun error(
        message: String,
        e: Exception,
    ) = logger.error(message, e)

    // Mirrors Flyway's own Slf4jLog: notice() is a no-op under SLF4J.
    override fun notice(message: String) = Unit

    private companion object {
        const val SCHEMA_AHEAD_OF_LOCATIONS = "but no migration could be resolved in the configured locations"
    }
}
