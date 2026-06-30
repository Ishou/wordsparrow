package com.bliss.billing.api.config

// Runtime config from env (ADR-0007 §6); missing required values fail-fast at boot.
data class BillingApiConfig(
    val port: Int,
    val identityBaseUrl: String,
    val allowedOrigins: List<String>,
    val natsUrl: String,
) {
    companion object {
        fun load(env: (String) -> String? = System::getenv): BillingApiConfig =
            BillingApiConfig(
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
            )

        private fun required(
            env: (String) -> String?,
            key: String,
        ): String = env(key) ?: error("missing required env var: $key")
    }
}
