package com.bliss.grid.application.words

/** Checks a teaser guess against an opaque answer token without revealing the answer (ADR-0076). */
class VerifySampleWordUseCase(
    private val tokenMinter: AnswerTokenMinter,
) {
    operator fun invoke(
        token: String,
        guess: String,
    ): Boolean = tokenMinter.verify(token, guess)
}
