package com.bliss.identity.domain.auth

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isTrue
import io.kotest.property.Arb
import io.kotest.property.arbitrary.int
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.security.SecureRandom

class OtpCodeTest {
    @Test
    fun `of accepts exactly six digits`() {
        assertThat(OtpCode.of("012345").value).isEqualTo("012345")
    }

    @Test
    fun `of rejects a five-digit input`() {
        assertFailure { OtpCode.of("12345") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `of rejects a seven-digit input`() {
        assertFailure { OtpCode.of("1234567") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `of rejects non-digit characters`() {
        assertFailure { OtpCode.of("12345a") }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `generate always produces a valid six-digit code`() {
        runBlocking {
            val rnd = SecureRandom()
            checkAll(Arb.int(1..200)) {
                val code = OtpCode.generate(rnd).value
                assertThat(code.length).isEqualTo(6)
                assertThat(code.all(Char::isDigit)).isTrue()
            }
        }
    }
}
