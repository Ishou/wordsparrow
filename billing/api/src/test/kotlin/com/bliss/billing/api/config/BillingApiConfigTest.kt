package com.bliss.billing.api.config

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class BillingApiConfigTest {
    @Test
    fun `load reads required identity url and applies defaults`() {
        val env =
            mapOf("IDENTITY_API_URL" to "https://auth.example").let { m -> { k: String -> m[k] } }
        val config = BillingApiConfig.load(env)
        assertThat(config.identityBaseUrl).isEqualTo("https://auth.example")
        assertThat(config.port).isEqualTo(8083)
        assertThat(config.allowedOrigins).isEqualTo(listOf("https://wordsparrow.io", "https://www.wordsparrow.io"))
    }

    @Test
    fun `load fails fast when IDENTITY_API_URL is missing`() {
        val result = runCatching { BillingApiConfig.load { null } }
        assertThat(result.exceptionOrNull()?.message ?: "").contains("IDENTITY_API_URL")
    }

    @Test
    fun `load parses comma separated origins and custom port`() {
        val env =
            mapOf(
                "IDENTITY_API_URL" to "https://auth.example",
                "BILLING_PORT" to "9099",
                "BILLING_ALLOWED_ORIGINS" to "https://a.example, https://b.example",
            ).let { m -> { k: String -> m[k] } }
        val config = BillingApiConfig.load(env)
        assertThat(config.port).isEqualTo(9099)
        assertThat(config.allowedOrigins).isEqualTo(listOf("https://a.example", "https://b.example"))
    }
}
