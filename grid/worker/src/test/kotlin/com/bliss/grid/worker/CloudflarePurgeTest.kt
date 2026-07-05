package com.bliss.grid.worker

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.containsExactly
import assertk.assertions.doesNotContain
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import java.io.IOException
import java.net.URI
import java.time.LocalDate

class CloudflarePurgeTest {
    private lateinit var appender: ListAppender<ILoggingEvent>
    private lateinit var logger: Logger

    @BeforeEach
    fun attachAppender() {
        logger = LoggerFactory.getLogger(EdgePurgeHook::class.java) as Logger
        appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
    }

    @AfterEach
    fun detachAppender() {
        logger.detachAppender(appender)
    }

    @Test
    fun `dailyPurgeUrls emits the bare daily url plus one exact date variant per generated date`() {
        val urls = dailyPurgeUrls(listOf(LocalDate.of(2026, 7, 3), LocalDate.of(2026, 7, 4)))

        assertThat(urls).containsExactly(
            "https://api.wordsparrow.io/v1/puzzles/daily",
            "https://api.wordsparrow.io/v1/puzzles/daily?date=2026-07-03",
            "https://api.wordsparrow.io/v1/puzzles/daily?date=2026-07-04",
        )
    }

    @Test
    fun `dailyPurgeEntries emits the default plus one prod-origin variant per daily url and never localhost`() {
        val entries = dailyPurgeEntries(listOf(LocalDate.of(2026, 7, 3)))

        val noDate = "https://api.wordsparrow.io/v1/puzzles/daily"
        val dated = "https://api.wordsparrow.io/v1/puzzles/daily?date=2026-07-03"
        assertThat(entries).containsExactly(
            PurgeEntry(noDate),
            PurgeEntry(noDate, "https://wordsparrow.io"),
            PurgeEntry(noDate, "https://www.wordsparrow.io"),
            PurgeEntry(dated),
            PurgeEntry(dated, "https://wordsparrow.io"),
            PurgeEntry(dated, "https://www.wordsparrow.io"),
        )
        assertThat(entries.mapNotNull { it.origin }).doesNotContain("http://localhost:5173")
    }

    @Test
    fun `a prod-origin entry renders as a header-scoped file object and a bare entry as a plain string`() {
        assertThat(PurgeEntry("https://api.wordsparrow.io/v1/puzzles/daily").toJson())
            .isEqualTo("\"https://api.wordsparrow.io/v1/puzzles/daily\"")
        assertThat(PurgeEntry("https://api.wordsparrow.io/v1/puzzles/daily", "https://wordsparrow.io").toJson())
            .isEqualTo("""{"url":"https://api.wordsparrow.io/v1/puzzles/daily","headers":{"Origin":"https://wordsparrow.io"}}""")
    }

    @Test
    fun `purgeFiles posts the files body with a bearer token to the zone purge endpoint`() {
        val sender = RecordingSender()

        val status =
            CloudflarePurgeClient(zoneId = "zone123", token = "tok456", sender = sender).purgeFiles(
                listOf(
                    PurgeEntry("https://api.wordsparrow.io/v1/puzzles/daily"),
                    PurgeEntry("https://api.wordsparrow.io/v1/puzzles/daily", "https://wordsparrow.io"),
                ),
            )

        assertThat(status).isEqualTo(200)
        val call = sender.calls.single()
        assertThat(call.uri).isEqualTo(URI.create("https://api.cloudflare.com/client/v4/zones/zone123/purge_cache"))
        assertThat(call.bearerToken).isEqualTo("tok456")
        assertThat(call.jsonBody).isEqualTo(
            """{"files":["https://api.wordsparrow.io/v1/puzzles/daily",""" +
                """{"url":"https://api.wordsparrow.io/v1/puzzles/daily","headers":{"Origin":"https://wordsparrow.io"}}]}""",
        )
    }

    @Test
    fun `hook skips with an info log when the cloudflare env vars are absent`() {
        val sender = RecordingSender()
        val hook = EdgePurgeHook(env = { null }, sender = sender)

        hook.afterGenerationRun(listOf(LocalDate.of(2026, 7, 3)))

        assertThat(sender.calls).isEmpty()
        val skipped = appender.list.single { it.formattedMessage.contains("event=edge_purge_skipped") }
        assertThat(skipped.level).isEqualTo(Level.INFO)
    }

    @Test
    fun `hook does not purge when the run generated nothing`() {
        val sender = RecordingSender()
        val hook = EdgePurgeHook(env = cloudflareEnv(), sender = sender)

        hook.afterGenerationRun(emptyList())

        assertThat(sender.calls).isEmpty()
        assertThat(appender.list).isEmpty()
    }

    @Test
    fun `hook purges the generated dates when the env vars are present`() {
        val sender = RecordingSender()
        val hook = EdgePurgeHook(env = cloudflareEnv(), sender = sender)

        hook.afterGenerationRun(listOf(LocalDate.of(2026, 7, 3)))

        val call = sender.calls.single()
        assertThat(call.jsonBody).contains("https://api.wordsparrow.io/v1/puzzles/daily?date=2026-07-03")
        assertThat(
            call.jsonBody,
        ).contains("""{"url":"https://api.wordsparrow.io/v1/puzzles/daily","headers":{"Origin":"https://wordsparrow.io"}}""")
        val succeeded = appender.list.single { it.formattedMessage.contains("event=edge_purge_succeeded") }
        assertThat(succeeded.formattedMessage).contains("url_count=2")
        assertThat(succeeded.formattedMessage).contains("variant_count=6")
    }

    @Test
    fun `hook chunks the purge into batches of at most thirty file entries`() {
        val sender = RecordingSender()
        val hook = EdgePurgeHook(env = cloudflareEnv(), sender = sender)
        val dates = (1..13).map { LocalDate.of(2026, 7, it) }

        hook.afterGenerationRun(dates)

        // 14 urls (bare + 13 dated) x 3 variants = 42 entries -> two calls (30 + 12).
        assertThat(sender.calls).hasSize(2)
        val succeeded = appender.list.single { it.formattedMessage.contains("event=edge_purge_succeeded") }
        assertThat(succeeded.formattedMessage).contains("variant_count=42")
        assertThat(succeeded.formattedMessage).contains("batch_count=2")
    }

    @Test
    fun `hook logs edge_purge_failed with the http status on a non-2xx response and does not throw`() {
        val sender = RecordingSender(status = 403)
        val hook = EdgePurgeHook(env = cloudflareEnv(), sender = sender)

        hook.afterGenerationRun(listOf(LocalDate.of(2026, 7, 3)))

        val failed = appender.list.single { it.formattedMessage.contains("event=edge_purge_failed") }
        assertThat(failed.level).isEqualTo(Level.ERROR)
        assertThat(failed.formattedMessage).contains("status=403")
    }

    @Test
    fun `hook logs edge_purge_failed on a sender exception and does not throw`() {
        val sender = PurgeHttpSender { _, _, _ -> throw IOException("connection reset") }
        val hook = EdgePurgeHook(env = cloudflareEnv(), sender = sender)

        hook.afterGenerationRun(listOf(LocalDate.of(2026, 7, 3)))

        val failed = appender.list.single { it.formattedMessage.contains("event=edge_purge_failed") }
        assertThat(failed.level).isEqualTo(Level.ERROR)
        assertThat(failed.formattedMessage).contains("status=exception")
    }

    private fun cloudflareEnv(): (String) -> String? = mapOf("CLOUDFLARE_ZONE_ID" to "zone123", "CLOUDFLARE_PURGE_TOKEN" to "tok456")::get

    internal class RecordingSender(
        private val status: Int = 200,
    ) : PurgeHttpSender {
        data class Call(
            val uri: URI,
            val bearerToken: String,
            val jsonBody: String,
        )

        val calls = mutableListOf<Call>()

        override fun post(
            uri: URI,
            bearerToken: String,
            jsonBody: String,
        ): Int {
            calls += Call(uri, bearerToken, jsonBody)
            return status
        }
    }
}
