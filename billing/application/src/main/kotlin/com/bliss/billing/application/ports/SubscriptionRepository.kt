package com.bliss.billing.application.ports

import com.bliss.billing.domain.Subscription
import java.time.Instant
import java.util.UUID

/** Persistence port for the local subscription projection (provider stays system-of-record for PII/invoices, ADR-0078). v1 holds one subscription per user. */
interface SubscriptionRepository {
    suspend fun findByUserId(userId: UUID): Subscription?

    suspend fun findByExternalRef(externalRef: String): Subscription?

    /** Idempotent upsert keyed by userId. */
    suspend fun save(subscription: Subscription)

    /** No-op if no projection exists for [userId]. */
    suspend fun delete(userId: UUID)

    /** Subscriptions still considered live locally; the W6 reconciliation backstop lists these to detect drift from the provider. */
    suspend fun listActive(): List<Subscription>

    /** PENDING_CANCELLATION rows last touched before [cutoff]; a stuck row means a deleted user may still be billable, so the backstop alerts on it (ADR-0078, ADR-0032). */
    suspend fun listPendingCancellationBefore(cutoff: Instant): List<Subscription>
}
