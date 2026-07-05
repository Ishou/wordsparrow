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

    /** Compare-and-set a still-`pending_cancellation` row to [next]; applies (and returns true) only if the persisted row is STILL `pending_cancellation`, else no write and false. Guards reactivate and the expiry sweep from clobbering each other under concurrency (ADR-0078). */
    suspend fun compareAndSetFromPendingCancellation(next: Subscription): Boolean

    /** No-op if no projection exists for [userId]. */
    suspend fun delete(userId: UUID)

    /** Subscriptions still considered live locally; the W6 reconciliation backstop lists these to detect drift from the provider. */
    suspend fun listActive(): List<Subscription>

    /** PENDING_CANCELLATION rows last touched before [cutoff]; a stuck row means a deleted user may still be billable, so the backstop alerts on it (ADR-0078, ADR-0032). */
    suspend fun listPendingCancellationBefore(cutoff: Instant): List<Subscription>

    /** Scheduled non-renewals whose paid period has ended at or before [now]; the expiry sweep flips these to EXPIRED so identity drops entitlement (CGV Art. 14.1). */
    suspend fun listPendingCancellationExpiredAt(now: Instant): List<Subscription>
}
