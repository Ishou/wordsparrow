package com.bliss.grid.application.words

import assertk.assertThat
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import org.junit.jupiter.api.Test

class VerifySampleWordUseCaseTest {
    private val minter =
        object : AnswerTokenMinter {
            override fun mint(answer: String): String = "tok:$answer"

            override fun verify(
                token: String,
                guess: String,
            ): Boolean = token == "tok:$guess"
        }
    private val useCase = VerifySampleWordUseCase(minter)

    @Test
    fun `returns true for a correct guess`() {
        val token = minter.mint("ROI")
        assertThat(useCase(token, "ROI")).isTrue()
    }

    @Test
    fun `returns false for an incorrect guess`() {
        val token = minter.mint("ROI")
        assertThat(useCase(token, "PARIS")).isFalse()
    }
}
