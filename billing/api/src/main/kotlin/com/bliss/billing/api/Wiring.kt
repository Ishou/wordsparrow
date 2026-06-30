package com.bliss.billing.api

import com.bliss.billing.api.auth.SessionPrincipal
import com.bliss.billing.application.usecases.CancelSubscription
import com.bliss.billing.application.usecases.CreateCheckoutSession
import com.bliss.billing.application.usecases.EntitlementQuery
import com.bliss.billing.application.usecases.IngestProviderEvent

// Hand-rolled DI graph; Module.kt consumes this, Main.kt wires adapters, tests stub directly.
class Wiring(
    val verifySession: suspend (String) -> SessionPrincipal?,
    val createCheckoutSession: CreateCheckoutSession,
    val cancelSubscription: CancelSubscription,
    val ingestProviderEvent: IngestProviderEvent,
    val entitlementQuery: EntitlementQuery,
    val closeNats: () -> Unit = {},
    val closeIdentityClient: () -> Unit = {},
)
