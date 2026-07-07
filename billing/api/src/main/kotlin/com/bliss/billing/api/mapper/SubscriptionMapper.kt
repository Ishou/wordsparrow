package com.bliss.billing.api.mapper

import com.bliss.billing.api.dto.SubscriptionView
import com.bliss.billing.domain.SubscriptionStatusView
import com.bliss.billing.domain.Tier

// Maps the domain subscription projection to the wire view.
fun SubscriptionStatusView.toView(): SubscriptionView =
    SubscriptionView(
        tier = tier.value,
        status = status.wire,
        periodEnd = periodEnd?.toString(),
    )

// Never subscribed (no row): a distinct "none" status (open string, ADR-0078), not "expired" — "expired" is a genuinely lapsed subscription and carries an ended-period date.
val NEVER_SUBSCRIBED_VIEW = SubscriptionView(tier = Tier.free.value, status = "none", periodEnd = null)
