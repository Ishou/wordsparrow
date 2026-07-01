package com.bliss.billing.api

import com.bliss.billing.api.auth.SessionPrincipal
import com.bliss.billing.application.usecases.CancelSubscription
import com.bliss.billing.application.usecases.CreateCheckoutSession
import com.bliss.billing.application.usecases.IngestProviderEvent
import com.bliss.billing.application.usecases.ListReceipts
import com.bliss.billing.application.usecases.SubscriptionQuery

// Hand-rolled DI graph; no framework injection.
class Wiring(
    val verifySession: suspend (String) -> SessionPrincipal?,
    // Session-derived player email for the Mollie customer; interim /me fetch until email rides on whoami/SessionPrincipal (ADR-0082).
    val fetchEmail: suspend (String?) -> String?,
    val createCheckoutSession: CreateCheckoutSession,
    val cancelSubscription: CancelSubscription,
    val ingestProviderEvent: IngestProviderEvent,
    val subscriptionQuery: SubscriptionQuery,
    val listReceipts: ListReceipts,
    val closeNats: () -> Unit = {},
    val closeIdentityClient: () -> Unit = {},
)
