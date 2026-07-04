package com.bliss.billing.api.identity

import com.bliss.billing.application.ports.CustomerEmailLookup
import java.util.UUID

/** Resolves the customer email from identity-api by user id at send time; billing never stores it (ADR-0082, ADR-0094 §2). */
class IdentityCustomerEmailLookup(
    private val identityClient: IdentityClient,
) : CustomerEmailLookup {
    override suspend fun emailFor(userId: UUID): String? = identityClient.fetchEmail(userId)
}
