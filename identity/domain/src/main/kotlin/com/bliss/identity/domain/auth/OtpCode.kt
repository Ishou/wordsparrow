package com.bliss.identity.domain.auth

import java.security.SecureRandom

@JvmInline
value class OtpCode private constructor(
    val value: String,
) {
    companion object {
        const val LENGTH = 6

        fun of(raw: String): OtpCode {
            require(raw.length == LENGTH && raw.all(Char::isDigit)) { "OTP code must be $LENGTH digits." }
            return OtpCode(raw)
        }

        fun generate(random: SecureRandom): OtpCode = OtpCode(buildString { repeat(LENGTH) { append(random.nextInt(10)) } })
    }
}
