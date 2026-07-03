package com.bliss.identity.api.auth

import io.ktor.http.Cookie
import io.ktor.http.CookieEncoding
import io.ktor.server.application.ApplicationCall

// PKCE-style binding cookie for email-OTP (`__Secure-ws_otp_chal`, ADR-0091); HttpOnly so XSS can't read the secret.
object ChallengeCookies {
    const val NAME = "__Secure-ws_otp_chal"
    const val DOMAIN = "wordsparrow.io"
    private const val MAX_AGE_SECONDS = 600

    fun issue(
        call: ApplicationCall,
        secret: String,
    ) {
        call.response.cookies.append(
            Cookie(
                name = NAME,
                value = secret,
                domain = DOMAIN,
                path = "/",
                httpOnly = true,
                secure = true,
                maxAge = MAX_AGE_SECONDS,
                extensions = mapOf("SameSite" to "Lax"),
                encoding = CookieEncoding.RAW,
            ),
        )
    }

    fun read(call: ApplicationCall): String? = call.request.cookies[NAME]

    fun clear(call: ApplicationCall) {
        call.response.cookies.append(
            Cookie(
                name = NAME,
                value = "",
                domain = DOMAIN,
                path = "/",
                httpOnly = true,
                secure = true,
                maxAge = 0,
                extensions = mapOf("SameSite" to "Lax"),
                encoding = CookieEncoding.RAW,
            ),
        )
    }
}
