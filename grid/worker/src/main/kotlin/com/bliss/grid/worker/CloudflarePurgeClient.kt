package com.bliss.grid.worker

import org.slf4j.LoggerFactory
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.LocalDate

internal const val DAILY_ENDPOINT = "https://api.wordsparrow.io/v1/puzzles/daily"

// Exact-URL purge list: free-plan Cloudflare purge has no wildcard support (ADR-0089 §5).
internal fun dailyPurgeUrls(dates: List<LocalDate>): List<String> = listOf(DAILY_ENDPOINT) + dates.map { "$DAILY_ENDPOINT?date=$it" }

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
    // Hand-built JSON is safe here: entries are repo-constructed URLs with no quotable characters.
    fun purgeFiles(urls: List<String>): Int {
        val uri = URI.create("https://api.cloudflare.com/client/v4/zones/$zoneId/purge_cache")
        val body = urls.joinToString(separator = ",", prefix = """{"files":[""", postfix = "]}") { "\"$it\"" }
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
        val status =
            try {
                CloudflarePurgeClient(zoneId, token, sender).purgeFiles(urls)
            } catch (e: Exception) {
                log.error("event=edge_purge_failed status=exception url_count={}", urls.size, e)
                return
            }
        if (status in 200..299) {
            log.info("event=edge_purge_succeeded status={} url_count={}", status, urls.size)
        } else {
            log.error("event=edge_purge_failed status={} url_count={}", status, urls.size)
        }
    }
}
