package com.bliss.billing.infrastructure.provider

import assertk.assertThat
import assertk.assertions.isEqualTo
import com.bliss.billing.domain.Cadence
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Period

class MollieConfigTest {
    // fromEnv() reads System.getProperty as an env fallback; the optional cadence keys stay unset so defaults are exercised.
    private val requiredProps =
        mapOf(
            "MOLLIE_API_KEY" to "test_dummy",
            "BILLING_CHECKOUT_SUCCESS_URL" to "https://app.test/merci",
            "BILLING_CHECKOUT_CANCEL_URL" to "https://app.test/abonnement",
            "BILLING_WEBHOOK_URL" to "https://api.test/v1/webhook",
        )
    private val optionalKeys =
        listOf(
            "BILLING_CHECKOUT_DESCRIPTION",
            "BILLING_MONTHLY_AMOUNT",
            "BILLING_MONTHLY_INTERVAL",
            "BILLING_YEARLY_AMOUNT",
            "BILLING_YEARLY_INTERVAL",
        )

    @BeforeEach
    fun setUp() {
        requiredProps.forEach { (k, v) -> System.setProperty(k, v) }
        optionalKeys.forEach { System.clearProperty(it) }
    }

    @AfterEach
    fun tearDown() {
        (requiredProps.keys + optionalKeys).forEach { System.clearProperty(it) }
    }

    @Test
    fun `description defaults to Abonnement WordSparrow`() {
        assertThat(MollieConfig.fromEnv().description).isEqualTo("Abonnement WordSparrow")
    }

    @Test
    fun `monthly defaults to two euros per month`() {
        val config = MollieConfig.fromEnv()
        assertThat(config.subscriptionAmountFor(Cadence.MONTHLY)).isEqualTo("2.00")
        assertThat(config.subscriptionIntervalFor(Cadence.MONTHLY)).isEqualTo("1 month")
    }

    @Test
    fun `yearly defaults to twenty euros per year`() {
        val config = MollieConfig.fromEnv()
        assertThat(config.subscriptionAmountFor(Cadence.YEARLY)).isEqualTo("20.00")
        assertThat(config.subscriptionIntervalFor(Cadence.YEARLY)).isEqualTo("12 months")
    }

    @Test
    fun `description discloses the cadence price and automatic renewal`() {
        val config = MollieConfig.fromEnv()
        assertThat(config.descriptionFor(Cadence.MONTHLY)).isEqualTo("Abonnement WordSparrow — 2 €/mois, renouvellement automatique")
        assertThat(config.descriptionFor(Cadence.YEARLY)).isEqualTo("Abonnement WordSparrow — 20 €/an, renouvellement automatique")
    }

    @Test
    fun `start offset is one billing interval so the first payment is not billed twice`() {
        val config = MollieConfig.fromEnv()
        assertThat(config.startOffsetFor(Cadence.MONTHLY)).isEqualTo(Period.ofMonths(1))
        assertThat(config.startOffsetFor(Cadence.YEARLY)).isEqualTo(Period.ofMonths(12))
    }

    @Test
    fun `cadence env overrides win over the defaults`() {
        System.setProperty("BILLING_YEARLY_AMOUNT", "18.00")
        System.setProperty("BILLING_YEARLY_INTERVAL", "1 year")

        val config = MollieConfig.fromEnv()

        assertThat(config.subscriptionAmountFor(Cadence.YEARLY)).isEqualTo("18.00")
        assertThat(config.subscriptionIntervalFor(Cadence.YEARLY)).isEqualTo("1 year")
    }
}
