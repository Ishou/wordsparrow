package com.bliss.identity.application.ports

import com.bliss.identity.domain.auth.OtpCode
import com.bliss.identity.domain.user.EmailAddress

fun interface EmailSender {
    suspend fun sendOtp(
        to: EmailAddress,
        code: OtpCode,
    )
}
