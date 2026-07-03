package com.bliss.identity.domain.provider

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.jupiter.api.Test

class ProviderTest {
    @Test
    fun `Provider has google, apple, and email variants`() {
        assertThat(Provider.entries.toSet()).isEqualTo(setOf(Provider.GOOGLE, Provider.APPLE, Provider.EMAIL))
    }
}
