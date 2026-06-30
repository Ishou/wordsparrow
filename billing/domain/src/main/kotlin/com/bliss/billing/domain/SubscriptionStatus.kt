package com.bliss.billing.domain

/** Subscription lifecycle state. `wire` is the stable spelling shared with the openapi/asyncapi contracts (ADR-0078). */
enum class SubscriptionStatus(
    val wire: String,
) {
    ACTIVE("active"),
    PAST_DUE("past_due"),
    CANCELED("canceled"),
    EXPIRED("expired"),
    PENDING_CANCELLATION("pending_cancellation"),
    ;

    /** A live subscription intent still exists locally (everything but the terminal CANCELED/EXPIRED); gates a new first-payment create and the reconciliation backstop. */
    fun isLive(): Boolean = this != CANCELED && this != EXPIRED

    fun canTransitionTo(target: SubscriptionStatus): Boolean = target in allowedTransitions

    fun transition(target: SubscriptionStatus): SubscriptionStatus {
        require(canTransitionTo(target)) { "Illegal subscription transition: $this -> $target" }
        return target
    }

    // PENDING_CANCELLATION is the deletion-cancellation tombstone (ADR-0078): reachable from any live state, sole precursor to CANCELED.
    private val allowedTransitions: Set<SubscriptionStatus>
        get() =
            when (this) {
                ACTIVE -> setOf(PAST_DUE, EXPIRED, PENDING_CANCELLATION)
                PAST_DUE -> setOf(ACTIVE, EXPIRED, PENDING_CANCELLATION)
                EXPIRED -> setOf(ACTIVE)
                PENDING_CANCELLATION -> setOf(CANCELED)
                CANCELED -> emptySet()
            }

    companion object {
        fun fromWire(raw: String): SubscriptionStatus =
            entries.firstOrNull { it.wire == raw }
                ?: throw IllegalArgumentException("Unknown subscription status: $raw")
    }
}
