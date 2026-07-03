package com.bliss.identity.infrastructure.testdoubles

import com.bliss.identity.application.ports.EmailSender
import com.bliss.identity.domain.auth.OtpCode
import com.bliss.identity.domain.user.EmailAddress

class RecordingEmailSender : EmailSender {
    data class Sent(
        val to: EmailAddress,
        val code: OtpCode,
    )

    val sent = mutableListOf<Sent>()

    override suspend fun sendOtp(
        to: EmailAddress,
        code: OtpCode,
    ) {
        sent.add(Sent(to, code))
    }
}
