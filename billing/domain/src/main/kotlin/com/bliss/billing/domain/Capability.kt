package com.bliss.billing.domain

/** Controlled capability vocabulary (ADR-0078). `wire` is the kebab-case identifier shared verbatim with consuming contexts. */
enum class Capability(
    val wire: String,
) {
    DAILY_ARCHIVE("daily-archive"),
    NO_ADS("no-ads"),
    UNLIMITED_HINTS("unlimited-hints"),
    EXTRA_DAILY_PUZZLES("extra-daily-puzzles"),
    ;

    companion object {
        fun fromWire(raw: String): Capability =
            entries.firstOrNull { it.wire == raw }
                ?: throw IllegalArgumentException("Unknown capability: $raw")
    }
}
