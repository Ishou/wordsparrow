package com.bliss.grid.infrastructure.words

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isNotEqualTo
import assertk.assertions.isTrue
import assertk.assertions.matchesPredicate
import org.junit.jupiter.api.Test

class HmacAnswerTokenMinterTest {
    private val minter = HmacAnswerTokenMinter("in-memory-test-key")

    @Test
    fun `mints the same token for the same answer and key`() {
        assertThat(minter.mint("PARIS")).isEqualTo(minter.mint("PARIS"))
        assertThat(minter.mint("PARIS")).isNotEqualTo(minter.mint("LYON"))
    }

    @Test
    fun `mints differently under a different key`() {
        assertThat(minter.mint("PARIS"))
            .isNotEqualTo(HmacAnswerTokenMinter("another-key").mint("PARIS"))
    }

    @Test
    fun `token is base64url with no padding`() {
        assertThat(minter.mint("PARIS")).matchesPredicate { token ->
            token.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' }
        }
    }

    @Test
    fun `a correct guess verifies true`() {
        assertThat(minter.verify(minter.mint("PARIS"), "PARIS")).isTrue()
    }

    @Test
    fun `a wrong guess verifies false`() {
        assertThat(minter.verify(minter.mint("PARIS"), "LYON")).isFalse()
    }

    @Test
    fun `normalizes accents and case so a folded guess matches`() {
        val token = minter.mint("ETE")
        assertThat(minter.verify(token, "été")).isTrue()
        assertThat(minter.verify(token, "Eté")).isTrue()
    }

    @Test
    fun `normalizes french ligatures the same way the answer was folded`() {
        assertThat(minter.verify(minter.mint("COEUR"), "cœur")).isTrue()
    }

    @Test
    fun `a tampered token verifies false instead of erroring`() {
        assertThat(minter.verify("not-a-real-token", "PARIS")).isFalse()
        assertThat(minter.verify("", "PARIS")).isFalse()
    }

    @Test
    fun `a token of the wrong length verifies false`() {
        val token = minter.mint("PARIS")
        assertThat(minter.verify(token + "extra", "PARIS")).isFalse()
        assertThat(minter.verify(token.dropLast(1), "PARIS")).isFalse()
    }
}
