package com.bliss.billing.application.ports

import com.bliss.billing.domain.CheckoutConsent
import java.time.Instant
import java.util.UUID

/** Append-only persistence port for pre-contractual checkout consent (ADR-0094). Keyed by userId at checkout time; a later workstream links it to the contract archive. */
interface ConsentRepository {
    /** [acceptedAt] is server time (never a client clock); the row is never overwritten so the point-in-time legal record survives. */
    suspend fun record(
        userId: UUID,
        consent: CheckoutConsent,
        acceptedAt: Instant,
    )

    /** The most recently accepted consent for the user, or null if none; the confirmation email reads it to echo the Art. 13 rétractation-waiver. */
    suspend fun findLatest(userId: UUID): CheckoutConsent?
}
