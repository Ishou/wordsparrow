package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.RenewalNoticeLedger
import com.bliss.billing.domain.RenewalNoticeKind
import java.time.Instant
import java.util.UUID

/** In-memory RenewalNoticeLedger for application-layer tests; records one entry per (user, period, kind). */
class InMemoryRenewalNoticeLedger : RenewalNoticeLedger {
    data class Entry(
        val userId: UUID,
        val externalRef: String,
        val periodEnd: Instant,
        val kind: RenewalNoticeKind,
        val sentAt: Instant,
    )

    val entries = mutableListOf<Entry>()

    override suspend fun hasSent(
        userId: UUID,
        periodEnd: Instant,
        kind: RenewalNoticeKind,
    ): Boolean = entries.any { it.userId == userId && it.periodEnd == periodEnd && it.kind == kind }

    override suspend fun record(
        userId: UUID,
        externalRef: String,
        periodEnd: Instant,
        kind: RenewalNoticeKind,
        sentAt: Instant,
    ) {
        entries += Entry(userId, externalRef, periodEnd, kind, sentAt)
    }
}
