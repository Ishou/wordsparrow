package com.bliss.billing.api.mapper

import com.bliss.billing.api.dto.SubscriptionView
import com.bliss.billing.domain.SubscriptionStatusView

// Maps the domain subscription projection to the wire view.
fun SubscriptionStatusView.toView(): SubscriptionView =
    SubscriptionView(
        tier = tier.value,
        status = status.wire,
        periodEnd = periodEnd?.toString(),
    )
