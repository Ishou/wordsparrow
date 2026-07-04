package com.bliss.billing.domain

import java.time.Duration
import java.time.Instant

/** The L215-1 pre-renewal window for the annual offer (ADR-0094 §3, CGV Art. 9): notice at the earliest 3 months, at the latest 1 month before the term. */
data class ChatelWindow(
    val minLead: Duration,
    val maxLead: Duration,
) {
    // Daily job + idempotency: a sub fires once on first entry near maxLead, staying above the 1-month floor even if a run is skipped.
    fun shouldSend(
        now: Instant,
        periodEnd: Instant,
    ): Boolean {
        val remaining = Duration.between(now, periodEnd)
        return remaining >= minLead && remaining <= maxLead
    }

    companion object {
        val DEFAULT = ChatelWindow(minLead = Duration.ofDays(30), maxLead = Duration.ofDays(45))
    }
}
