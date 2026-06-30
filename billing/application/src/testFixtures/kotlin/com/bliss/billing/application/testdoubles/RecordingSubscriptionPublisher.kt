package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher

/** Records every published SubscriptionChanged so tests can assert on emitted transitions. */
class RecordingSubscriptionPublisher : SubscriptionPublisher {
    val events = mutableListOf<SubscriptionChanged>()

    override suspend fun publish(event: SubscriptionChanged) {
        events.add(event)
    }
}
