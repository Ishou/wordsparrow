package com.bliss.billing.application.ports

import com.bliss.billing.domain.RenewalNoticeKind
import java.time.Instant
import java.util.UUID

/** Idempotency ledger for pre-renewal notices (ADR-0094 §3): one notice per (user, period, kind) so a daily scheduler never sends the same notice twice. */
interface RenewalNoticeLedger {
    suspend fun hasSent(
        userId: UUID,
        periodEnd: Instant,
        kind: RenewalNoticeKind,
    ): Boolean

    suspend fun record(
        userId: UUID,
        externalRef: String,
        periodEnd: Instant,
        kind: RenewalNoticeKind,
        sentAt: Instant,
    )
}
