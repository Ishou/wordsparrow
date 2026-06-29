package com.bliss.billing.infrastructure.provider

import java.util.UUID

/** Opaque userId -> Mollie customer-id mapping so a returning user reuses one provider Customer (ADR-0078: no PII stored locally). */
interface MollieCustomerStore {
    suspend fun findCustomerId(userId: UUID): String?

    /** Atomic find-or-create: calls [lazyCreate] at most once and returns the id that wins the conflict. */
    suspend fun findOrCreate(
        userId: UUID,
        lazyCreate: suspend () -> String,
    ): String
}
