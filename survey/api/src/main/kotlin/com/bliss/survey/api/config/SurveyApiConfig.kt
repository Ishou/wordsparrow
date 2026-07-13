package com.bliss.survey.api.config

// Runtime config from env (ADR-0007 §6); missing required values fail-fast at boot.
data class SurveyApiConfig(
    val port: Int,
    val jdbcUrl: String,
    val dbUser: String,
    val dbPassword: String,
    val identityBaseUrl: String,
    val allowedOrigins: List<String>,
    val natsUrl: String,
    val goldCutoff: java.time.Instant,
    val goldMultiplier: Double,
    // Harm-report alert mail (ADR-0103) ships dark: a null Brevo key means no sender is wired and harm emails are skipped.
    val brevoApiKey: String? = null,
    val maintainerEmail: String = "maintainer@wordsparrow.io",
    val emailSender: String = "signalement@wordsparrow.io",
    // Server-side word resolution (ADR-0111) ships dark: a null base URL or token wires a no-op resolver so reports still persist (word backfilled later).
    val gridBaseUrl: String? = null,
    val wordValidateServiceToken: String? = null,
) {
    companion object {
        fun load(env: (String) -> String? = System::getenv): SurveyApiConfig =
            SurveyApiConfig(
                port = env("SURVEY_PORT")?.toIntOrNull() ?: 7780,
                jdbcUrl = required(env, "SURVEY_JDBC_URL"),
                dbUser = required(env, "SURVEY_DB_USER"),
                dbPassword = required(env, "SURVEY_DB_PASSWORD"),
                identityBaseUrl = required(env, "IDENTITY_BASE_URL"),
                allowedOrigins =
                    env("SURVEY_ALLOWED_ORIGINS")
                        ?.split(",")
                        ?.map { it.trim() }
                        ?.filter { it.isNotEmpty() }
                        ?: listOf("https://wordsparrow.io", "https://www.wordsparrow.io"),
                // ADR-0049 — JetStream user.deleted consumer URL; default matches in-cluster Service.
                natsUrl = env("NATS_URL") ?: "nats://nats.wordsparrow.svc.cluster.local:4222",
                goldCutoff = env("SURVEY_GOLD_CUTOFF")?.let(java.time.Instant::parse) ?: java.time.Instant.parse("2026-05-30T00:00:00Z"),
                goldMultiplier = env("SURVEY_GOLD_MULTIPLIER")?.toDouble() ?: 3.0,
                // Shares identity's Brevo account (same key); sender/maintainer addresses default and are env-overridable.
                brevoApiKey = env("SURVEY_BREVO_API_KEY"),
                maintainerEmail = env("SURVEY_MAINTAINER_EMAIL") ?: "maintainer@wordsparrow.io",
                emailSender = env("SURVEY_EMAIL_SENDER") ?: "signalement@wordsparrow.io",
                gridBaseUrl = env("GRID_BASE_URL"),
                wordValidateServiceToken = env("WORD_VALIDATE_SERVICE_TOKEN"),
            )

        private fun required(
            env: (String) -> String?,
            key: String,
        ): String = env(key) ?: error("missing required env var: $key")
    }
}
