package com.bliss.identity.domain.user

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import io.kotest.property.Arb
import io.kotest.property.arbitrary.stringPattern
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test

class EmailAddressTest {
    @Test
    fun `of normalizes by trimming and lowercasing`() {
        assertThat(EmailAddress.of("  Alice@Example.COM  ").value).isEqualTo("alice@example.com")
    }

    @Test
    fun `of rejects input without an at sign`() {
        assertFailure { EmailAddress.of("alice.example.com") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `of rejects input without a domain dot`() {
        assertFailure { EmailAddress.of("alice@example") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `of rejects a blank string`() {
        assertFailure { EmailAddress.of("   ") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `of rejects internal whitespace`() {
        assertFailure { EmailAddress.of("al ice@example.com") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `property - output is always trimmed and lowercase`() {
        runBlocking {
            checkAll(Arb.stringPattern("[a-zA-Z]{1,12}@[a-zA-Z]{1,12}\\.[a-zA-Z]{2,4}")) { raw ->
                assertThat(EmailAddress.of("  $raw  ").value).isEqualTo(raw.lowercase())
            }
        }
    }
}
