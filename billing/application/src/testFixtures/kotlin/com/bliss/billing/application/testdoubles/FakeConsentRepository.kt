package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.ConsentRepository
import com.bliss.billing.domain.CheckoutConsent
import java.time.Instant
import java.util.UUID

/** In-memory ConsentRepository for application-layer tests (no infrastructure dependency); keeps an append-only log of every record call. */
class FakeConsentRepository : ConsentRepository {
    data class Recorded(
        val userId: UUID,
        val consent: CheckoutConsent,
        val acceptedAt: Instant,
    )

    val records = mutableListOf<Recorded>()

    override suspend fun record(
        userId: UUID,
        consent: CheckoutConsent,
        acceptedAt: Instant,
    ) {
        records += Recorded(userId, consent, acceptedAt)
    }
}
