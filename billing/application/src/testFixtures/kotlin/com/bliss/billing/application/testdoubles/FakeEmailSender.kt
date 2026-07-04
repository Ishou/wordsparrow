package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.EmailSender
import com.bliss.billing.application.ports.OutboundEmail

/** In-memory EmailSender: records every send; [failOnce] throws on the next send, [failAlways] on every send, to exercise retry/backoff paths. */
class FakeEmailSender : EmailSender {
    val sent = mutableListOf<OutboundEmail>()
    var failOnce = false
    var failAlways = false

    override suspend fun send(email: OutboundEmail) {
        if (failAlways) throw IllegalStateException("email send failed (simulated)")
        if (failOnce) {
            failOnce = false
            throw IllegalStateException("email send failed (simulated)")
        }
        sent += email
    }
}
