package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.CustomerEmailLookup
import java.util.UUID

/** In-memory CustomerEmailLookup: returns a configured address per user (default [defaultEmail]); null when explicitly unset. */
class FakeCustomerEmailLookup(
    private val defaultEmail: String? = "joueur@example.com",
) : CustomerEmailLookup {
    private val byUser = mutableMapOf<UUID, String?>()

    fun setEmail(
        userId: UUID,
        email: String?,
    ) {
        byUser[userId] = email
    }

    override suspend fun emailFor(userId: UUID): String? = if (byUser.containsKey(userId)) byUser[userId] else defaultEmail
}
