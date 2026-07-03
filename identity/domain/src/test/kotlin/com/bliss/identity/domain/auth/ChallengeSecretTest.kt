package com.bliss.identity.domain.auth

import assertk.assertFailure
import assertk.assertThat
import assertk.assertions.hasLength
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotEqualTo
import io.kotest.common.ExperimentalKotest
import io.kotest.property.Arb
import io.kotest.property.PropTestConfig
import io.kotest.property.arbitrary.Codepoint
import io.kotest.property.arbitrary.printableAscii
import io.kotest.property.arbitrary.string
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.security.SecureRandom

@OptIn(ExperimentalKotest::class)
class ChallengeSecretTest {
    private val rng = SecureRandom()

    @Test
    fun `generate produces a 43-character url-safe base64 string`() {
        assertThat(ChallengeSecret.generate(rng).value).hasLength(43)
    }

    @Test
    fun `two generated secrets are different`() {
        assertThat(ChallengeSecret.generate(rng).value).isNotEqualTo(ChallengeSecret.generate(rng).value)
    }

    @Test
    fun `generate round-trips through of`() {
        val secret = ChallengeSecret.generate(rng)
        assertThat(ChallengeSecret.of(secret.value).value).isEqualTo(secret.value)
    }

    @Test
    fun `of rejects a string shorter than 32 characters`() {
        assertFailure { ChallengeSecret.of("a".repeat(31)) }.isInstanceOf(IllegalArgumentException::class)
    }

    @Test
    fun `property - of round-trips any token of sufficient length`() {
        runBlocking {
            checkAll(PropTestConfig(iterations = 200), Arb.string(32..200, Codepoint.printableAscii())) { raw ->
                assertThat(ChallengeSecret.of(raw).value).isEqualTo(raw)
            }
        }
    }
}
