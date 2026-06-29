package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.EventIdGenerator
import java.util.UUID

/** Mints deterministic, distinct ids so tests can assert each emission carries a fresh eventId. */
class SequentialEventIdGenerator : EventIdGenerator {
    val minted = mutableListOf<UUID>()

    override fun newEventId(): UUID = UUID(0L, minted.size.toLong() + 1).also { minted.add(it) }
}
