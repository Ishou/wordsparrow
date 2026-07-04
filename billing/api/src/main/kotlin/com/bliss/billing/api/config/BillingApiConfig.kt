package com.bliss.billing.api.config

import com.bliss.billing.infrastructure.email.BillingBrevoConfig

// Runtime config from env (ADR-0007 §6); missing required values fail-fast at boot.
data class BillingApiConfig(
    val port: Int,
    val identityBaseUrl: String,
    val allowedOrigins: List<String>,
    val natsUrl: String,
    // Legal transactional email (ADR-0094 §2) ships dark; bright = BILLING_EMAIL_ENABLED=true, which then requires the Brevo config.
    val emailEnabled: Boolean = false,
    val brevo: BillingBrevoConfig? = null,
) {
    companion object {
        fun load(env: (String) -> String? = System::getenv): BillingApiConfig {
            val emailEnabled = env("BILLING_EMAIL_ENABLED")?.toBooleanStrictOrNull() == true
            return BillingApiConfig(
                port = env("BILLING_PORT")?.toIntOrNull() ?: 8083,
                identityBaseUrl = required(env, "IDENTITY_API_URL"),
                allowedOrigins =
                    env("BILLING_ALLOWED_ORIGINS")
                        ?.split(",")
                        ?.map { it.trim() }
                        ?.filter { it.isNotEmpty() }
                        ?: listOf("https://wordsparrow.io", "https://www.wordsparrow.io"),
                // ADR-0049 — default matches the in-cluster NATS Service.
                natsUrl = env("NATS_URL") ?: "nats://nats.wordsparrow.svc.cluster.local:4222",
                emailEnabled = emailEnabled,
                // Fail-fast (ADR-0007): the Brevo key is only required once the email flag is on.
                brevo =
                    if (!emailEnabled) {
                        null
                    } else {
                        // Shares identity's BREVO_API_KEY (same account); sender identity defaults are baked in and env-overridable so provisioning only needs the shared key.
                        BillingBrevoConfig(
                            apiKey = required(env, "BREVO_API_KEY"),
                            senderEmail = env("BREVO_SENDER_EMAIL") ?: "abonnement@wordsparrow.io",
                            senderName = env("BREVO_SENDER_NAME") ?: "WordSparrow – Abonnement",
                            replyTo = env("BREVO_REPLY_TO") ?: "contact@wordsparrow.io",
                        )
                    },
            )
        }

        private fun required(
            env: (String) -> String?,
            key: String,
        ): String = env(key) ?: error("missing required env var: $key")
    }
}
