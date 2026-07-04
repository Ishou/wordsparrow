package com.bliss.billing.domain

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class CheckoutConsentTest {
    @Test
    fun `holds the accepted consent fields`() {
        val consent = CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = true)
        assertThat(consent.cgvAccepted).isEqualTo(true)
        assertThat(consent.cgvVersion).isEqualTo("1.0")
        assertThat(consent.withdrawalWaiver).isEqualTo(true)
    }

    @Test
    fun `withdrawal waiver may be declined`() {
        val consent = CheckoutConsent(cgvAccepted = true, cgvVersion = "1.0", withdrawalWaiver = false)
        assertThat(consent.withdrawalWaiver).isEqualTo(false)
    }

    @Test
    fun `rejects a consent whose CGV were not accepted`() {
        assertThrows<IllegalArgumentException> {
            CheckoutConsent(cgvAccepted = false, cgvVersion = "1.0", withdrawalWaiver = true)
        }
    }

    @Test
    fun `rejects a blank CGV version`() {
        assertThrows<IllegalArgumentException> {
            CheckoutConsent(cgvAccepted = true, cgvVersion = "  ", withdrawalWaiver = true)
        }
    }
}
