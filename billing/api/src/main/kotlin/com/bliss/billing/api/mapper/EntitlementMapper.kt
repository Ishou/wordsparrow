package com.bliss.billing.api.mapper

import com.bliss.billing.api.dto.EntitlementView
import com.bliss.billing.domain.Entitlement

// Maps the domain entitlement to the wire view; capabilities emit their controlled kebab-case `wire` spelling (ADR-0078).
fun Entitlement.toView(): EntitlementView =
    EntitlementView(
        tier = tier.value,
        status = status.wire,
        periodEnd = periodEnd?.toString(),
        capabilities = capabilities.map { it.wire },
    )
