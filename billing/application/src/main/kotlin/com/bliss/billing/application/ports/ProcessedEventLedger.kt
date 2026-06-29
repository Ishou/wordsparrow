package com.bliss.billing.application.ports

/** Webhook idempotency ledger (billing_processed_events): a provider event id is recorded once so a non-idempotent side effect (the recurring-subscription create) runs at most once under at-least-once delivery (ADR-0078). */
fun interface ProcessedEventLedger {
    /** True if [eventId] was newly recorded; false if it was already present (a redelivery). */
    suspend fun recordIfAbsent(eventId: String): Boolean
}
