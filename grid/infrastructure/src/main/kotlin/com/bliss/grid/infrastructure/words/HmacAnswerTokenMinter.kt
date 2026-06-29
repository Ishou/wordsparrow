package com.bliss.grid.infrastructure.words

import com.bliss.grid.application.words.AnswerTokenMinter
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** HMAC-SHA256 teaser tokens (ADR-0076): deterministic, stateless, constant-time verify. */
class HmacAnswerTokenMinter(
    serverKey: String,
) : AnswerTokenMinter {
    private val keySpec = SecretKeySpec(serverKey.toByteArray(Charsets.UTF_8), HMAC_ALGORITHM)
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    override fun mint(answer: String): String = encoder.encodeToString(hmac(normalize(answer)))

    override fun verify(
        token: String,
        guess: String,
    ): Boolean {
        val expected = encoder.encodeToString(hmac(normalize(guess)))
        // MessageDigest.isEqual is constant-time, so a tampered token leaks no per-character timing.
        return MessageDigest.isEqual(
            expected.toByteArray(Charsets.US_ASCII),
            token.toByteArray(Charsets.US_ASCII),
        )
    }

    private fun hmac(value: String): ByteArray =
        Mac.getInstance(HMAC_ALGORITHM).run {
            init(keySpec)
            doFinal(value.toByteArray(Charsets.UTF_8))
        }

    /** Fold to the canonical answer surface (A-Z), mirroring `Word.text` (ADR-0073 §1). */
    private fun normalize(text: String): String =
        DIACRITICS
            .replace(Normalizer.normalize(text, Normalizer.Form.NFD), "")
            .replace("œ", "oe")
            .replace("Œ", "OE")
            .replace("æ", "ae")
            .replace("Æ", "AE")
            .uppercase()
            .filter { it in 'A'..'Z' }

    private companion object {
        const val HMAC_ALGORITHM = "HmacSHA256"
        val DIACRITICS = "\\p{InCombiningDiacriticalMarks}+".toRegex()
    }
}
