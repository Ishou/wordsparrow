package com.bliss.grid.worker

import org.slf4j.LoggerFactory
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.LocalDate

internal const val DAILY_ENDPOINT = "https://api.wordsparrow.io/v1/puzzles/daily"

// Credentialed CORS reflects Access-Control-Allow-Origin per request, so daily responses Vary: Origin and Cloudflare caches one object per prod origin (ADR-0089 §3).
internal val PROD_EDGE_ORIGINS = listOf("https://wordsparrow.io", "https://www.wordsparrow.io")

// Free-plan Cloudflare purge_cache rejects more than 30 file entries per call.
internal const val MAX_PURGE_FILES_PER_CALL = 30

// Exact-URL purge list: free-plan Cloudflare purge has no wildcard support (ADR-0089 §3/§5).
internal fun dailyPurgeUrls(dates: List<LocalDate>): List<String> = listOf(DAILY_ENDPOINT) + dates.map { "$DAILY_ENDPOINT?date=$it" }

data class PurgeEntry(
    val url: String,
    val origin: String? = null,
) {
    fun toJson(): String = if (origin == null) "\"$url\"" else """{"url":"$url","headers":{"Origin":"$origin"}}"""
}

// Per daily URL: the default (no-Origin) variant plus one header-scoped variant per prod Origin (ADR-0089 §3).
internal fun dailyPurgeEntries(dates: List<LocalDate>): List<PurgeEntry> =
    dailyPurgeUrls(dates).flatMap { url ->
        listOf(PurgeEntry(url)) + PROD_EDGE_ORIGINS.map { PurgeEntry(url, it) }
    }

/** HTTP seam so tests fake only the network boundary. */
fun interface PurgeHttpSender {
    fun post(
        uri: URI,
        bearerToken: String,
        jsonBody: String,
    ): Int
}

object JdkPurgeHttpSender : PurgeHttpSender {
    private val client: HttpClient by lazy { HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build() }

    override fun post(
        uri: URI,
        bearerToken: String,
        jsonBody: String,
    ): Int {
        val request =
            HttpRequest
                .newBuilder(uri)
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Bearer $bearerToken")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build()
        return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode()
    }
}

class CloudflarePurgeClient(
    private val zoneId: String,
    private val token: String,
    private val sender: PurgeHttpSender = JdkPurgeHttpSender,
) {
    // Hand-built JSON is safe here: entries are repo-constructed URLs/origins with no quotable characters.
    fun purgeFiles(entries: List<PurgeEntry>): Int {
        val uri = URI.create("https://api.cloudflare.com/client/v4/zones/$zoneId/purge_cache")
        val body = entries.joinToString(separator = ",", prefix = """{"files":[""", postfix = "]}") { it.toJson() }
        return sender.post(uri, token, body)
    }
}

/** Purge failure is non-fatal by design: staleness is bounded by the until-midnight edge TTL (ADR-0089 §5). */
internal class EdgePurgeHook(
    private val env: (String) -> String? = System::getenv,
    private val sender: PurgeHttpSender = JdkPurgeHttpSender,
) {
    private val log = LoggerFactory.getLogger(EdgePurgeHook::class.java)

    fun afterGenerationRun(generatedDates: List<LocalDate>) {
        if (generatedDates.isEmpty()) return
        val zoneId = env("CLOUDFLARE_ZONE_ID")
        val token = env("CLOUDFLARE_PURGE_TOKEN")
        if (zoneId.isNullOrBlank() || token.isNullOrBlank()) {
            log.info("event=edge_purge_skipped reason=missing_env date_count={}", generatedDates.size)
            return
        }
        val urls = dailyPurgeUrls(generatedDates)
        val entries = dailyPurgeEntries(generatedDates)
        val batches = entries.chunked(MAX_PURGE_FILES_PER_CALL)
        val client = CloudflarePurgeClient(zoneId, token, sender)
        for (batch in batches) {
            val status =
                try {
                    client.purgeFiles(batch)
                } catch (e: Exception) {
                    log.error("event=edge_purge_failed status=exception variant_count={}", entries.size, e)
                    return
                }
            if (status !in 200..299) {
                log.error("event=edge_purge_failed status={} variant_count={}", status, entries.size)
                return
            }
        }
        log.info("event=edge_purge_succeeded url_count={} variant_count={} batch_count={}", urls.size, entries.size, batches.size)
    }
}
