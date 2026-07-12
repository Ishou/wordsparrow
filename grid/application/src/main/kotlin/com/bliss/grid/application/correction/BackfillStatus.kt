package com.bliss.grid.application.correction

/** Lifecycle of a correction's async existing-grid backfill (ADR-0108 §4). */
enum class BackfillStatus(
    val wire: String,
) {
    PENDING("pending"),
    RUNNING("running"),
    DONE("done"),
    FAILED("failed"),
    ;

    companion object {
        fun fromWire(wire: String): BackfillStatus? = entries.firstOrNull { it.wire == wire }
    }
}
