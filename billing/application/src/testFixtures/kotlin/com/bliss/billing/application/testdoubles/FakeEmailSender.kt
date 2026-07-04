package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.OutboundEmail

/** In-memory EmailSender: records every send, or throws once when [failOnce] is set to exercise best-effort swallowing. */
class FakeEmailSender : EmailSender {
    val sent = mutableListOf<OutboundEmail>()
    var failOnce = false

    override suspend fun send(email: OutboundEmail) {
        if (failOnce) {
            failOnce = false
            throw IllegalStateException("email send failed (simulated)")
        }
        sent += email
    }
}
