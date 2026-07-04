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
    fun `email ships dark by default`() {
        val env = mapOf("IDENTITY_API_URL" to "https://auth.example").let { m -> { k: String -> m[k] } }
        val config = BillingApiConfig.load(env)
        assertThat(config.emailEnabled).isEqualTo(false)
        assertThat(config.brevo).isEqualTo(null)
    }

    @Test
    fun `enabling email without a Brevo key fails fast`() {
        val env =
            mapOf(
                "IDENTITY_API_URL" to "https://auth.example",
                "BILLING_EMAIL_ENABLED" to "true",
            ).let { m -> { k: String -> m[k] } }
        val result = runCatching { BillingApiConfig.load(env) }
        assertThat(result.exceptionOrNull()?.message ?: "").contains("BREVO_API_KEY")
    }

    @Test
    fun `enabling email with full Brevo config builds the sender config`() {
        val env =
            mapOf(
                "IDENTITY_API_URL" to "https://auth.example",
                "BILLING_EMAIL_ENABLED" to "true",
                "BREVO_API_KEY" to "xkeysib-test",
                "BREVO_SENDER_EMAIL" to "facturation@wordsparrow.io",
                "BREVO_SENDER_NAME" to "WordSparrow",
            ).let { m -> { k: String -> m[k] } }
        val config = BillingApiConfig.load(env)
        assertThat(config.emailEnabled).isEqualTo(true)
        assertThat(config.brevo?.senderEmail ?: "").isEqualTo("facturation@wordsparrow.io")
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
