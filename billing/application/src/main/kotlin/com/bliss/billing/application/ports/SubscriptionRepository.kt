package com.bliss.billing.application.ports

import com.bliss.billing.domain.Subscription
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
}
