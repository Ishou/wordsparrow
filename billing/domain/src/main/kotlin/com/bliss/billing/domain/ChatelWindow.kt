package com.bliss.billing.domain

import java.time.Duration
import java.time.Instant

/** The L215-1 pre-renewal window for the annual offer (ADR-0094 §3, CGV Art. 9): the legal bound is [1 month, 3 months] before the term. The DEFAULT notifies between 2 months and 1 month before, so a CronJob outage up to (maxLead − minLead) days still catches the notice. */
data class ChatelWindow(
    val minLead: Duration,
    val maxLead: Duration,
) {
    // Daily job + idempotency: a sub fires once on first entry near maxLead; the (maxLead − minLead) span is the tolerated run-gap before the 1-month floor is crossed.
    fun shouldSend(
        now: Instant,
        periodEnd: Instant,
    ): Boolean {
        val remaining = Duration.between(now, periodEnd)
        return remaining >= minLead && remaining <= maxLead
    }

    companion object {
        val DEFAULT = ChatelWindow(minLead = Duration.ofDays(30), maxLead = Duration.ofDays(60))
    }
}
