package com.bliss.grid.application.words

/** Port for server-verified teaser tokens (ADR-0076): mint an opaque handle, verify a guess. */
interface AnswerTokenMinter {
    /** `base64url(HMAC-SHA256(serverKey, normalize(answer)))` — deterministic, stateless. */
    fun mint(answer: String): String

    /** True when `normalize(guess)` hashes to `token`, compared in constant time. */
    fun verify(
        token: String,
        guess: String,
    ): Boolean
}
