package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.ProcessedEventLedger

/** In-memory idempotency ledger: `recordIfAbsent` is true only the first time an event id is seen. */
class InMemoryProcessedEventLedger : ProcessedEventLedger {
    val recorded = linkedSetOf<String>()

    override suspend fun recordIfAbsent(eventId: String): Boolean = recorded.add(eventId)
}
