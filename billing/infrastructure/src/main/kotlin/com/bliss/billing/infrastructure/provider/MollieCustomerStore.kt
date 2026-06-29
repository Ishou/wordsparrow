package com.bliss.billing.infrastructure.provider

import java.util.UUID

/** Opaque userId -> Mollie customer-id mapping so a returning user reuses one provider Customer (ADR-0078: no PII stored locally). */
interface MollieCustomerStore {
    suspend fun findCustomerId(userId: UUID): String?

    suspend fun save(
        userId: UUID,
        mollieCustomerId: String,
    )
}
