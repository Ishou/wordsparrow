package com.bliss.billing.application.ports

import java.time.Instant

/** Wall-clock port; tests use a fixed clock to make `changedAt` deterministic. */
fun interface Clock {
    fun now(): Instant
}
