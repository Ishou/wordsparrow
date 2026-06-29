package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.EntitlementChanged
import com.bliss.billing.application.ports.EntitlementPublisher

/** Records every published EntitlementChanged so tests can assert on emitted transitions. */
class RecordingEntitlementPublisher : EntitlementPublisher {
    val events = mutableListOf<EntitlementChanged>()

    override suspend fun publish(event: EntitlementChanged) {
        events.add(event)
    }
}
