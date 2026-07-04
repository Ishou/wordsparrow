package com.bliss.billing.application.ports

import com.bliss.billing.domain.CheckoutConsent
import java.time.Instant
import java.util.UUID

/** Append-only persistence port for pre-contractual checkout consent (ADR-0094). Keyed by userId at checkout time; a later workstream links it to the contract archive. */
fun interface ConsentRepository {
    /** [acceptedAt] is server time (never a client clock); the row is never overwritten so the point-in-time legal record survives. */
    suspend fun record(
        userId: UUID,
        consent: CheckoutConsent,
        acceptedAt: Instant,
    )
}
