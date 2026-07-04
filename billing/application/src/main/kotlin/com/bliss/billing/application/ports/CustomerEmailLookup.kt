package com.bliss.billing.application.ports

import java.util.UUID

/** Resolves the customer's contact email by user id at send time; billing never stores it (ADR-0082). Null when unknown or unavailable. */
fun interface CustomerEmailLookup {
    suspend fun emailFor(userId: UUID): String?
}
