package com.bliss.billing.application.ports

import java.util.UUID

/** Mints the per-event UUID v7 stamped on each EntitlementChanged (ADR-0078); behind a port so tests stay deterministic. */
fun interface EventIdGenerator {
    fun newEventId(): UUID
}
