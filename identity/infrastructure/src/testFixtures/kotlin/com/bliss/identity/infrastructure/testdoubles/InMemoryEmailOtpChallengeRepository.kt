package com.bliss.identity.infrastructure.testdoubles

import com.bliss.identity.application.ports.EmailOtpChallengeRepository
import com.bliss.identity.domain.auth.ChallengeId
import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.user.EmailAddress
import java.time.Instant

class InMemoryEmailOtpChallengeRepository : EmailOtpChallengeRepository {
    private val byId = LinkedHashMap<ChallengeId, EmailOtpChallenge>()

    override suspend fun create(challenge: EmailOtpChallenge) {
        byId[challenge.id] = challenge
    }

    override suspend fun findActiveByEmail(
        email: EmailAddress,
        now: Instant,
    ): EmailOtpChallenge? =
        byId.values
            .filter { it.email == email && !it.isExpired(now) && !it.isConsumed() }
            .maxByOrNull { it.createdAt }

    override suspend fun save(challenge: EmailOtpChallenge) {
        byId[challenge.id] = challenge
    }

    override suspend fun countCreatedSince(
        email: EmailAddress,
        since: Instant,
    ): Int = byId.values.count { it.email == email && !it.createdAt.isBefore(since) }

    override suspend fun countAllCreatedSince(since: Instant): Int = byId.values.count { !it.createdAt.isBefore(since) }

    override suspend fun latestCreatedAt(email: EmailAddress): Instant? =
        byId.values.filter { it.email == email }.maxOfOrNull { it.createdAt }

    override suspend fun deleteExpired(now: Instant) {
        byId.values
            .filter { it.isExpired(now) }
            .forEach { byId.remove(it.id) }
    }
}
