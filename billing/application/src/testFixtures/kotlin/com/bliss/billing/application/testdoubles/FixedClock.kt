package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.Clock
import java.time.Instant

/** Returns a fixed [Instant], optionally advanced manually. */
class FixedClock(
    private var current: Instant,
) : Clock {
    override fun now(): Instant = current

    fun advanceBy(seconds: Long) {
        current = current.plusSeconds(seconds)
    }
}
