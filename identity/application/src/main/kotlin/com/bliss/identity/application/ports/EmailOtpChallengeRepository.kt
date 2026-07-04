package com.bliss.identity.application.ports

import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.user.EmailAddress
import java.time.Instant

interface EmailOtpChallengeRepository {
    suspend fun create(challenge: EmailOtpChallenge)

    /** Newest non-expired, non-consumed challenge for the email; null if none. */
    suspend fun findActiveByEmail(
        email: EmailAddress,
        now: Instant,
    ): EmailOtpChallenge?

    /** Persist attempt/consumed updates for an existing challenge. */
    suspend fun save(challenge: EmailOtpChallenge)

    suspend fun countCreatedSince(
        email: EmailAddress,
        since: Instant,
    ): Int

    /** Count of challenges created since [since] classified as new-account (account_existed = false). */
    suspend fun countNewAccountCreatedSince(since: Instant): Int

    /** Global send-budget proxy: challenges created since [since] across all emails. */
    suspend fun countAllCreatedSince(since: Instant): Int

    suspend fun latestCreatedAt(email: EmailAddress): Instant?

    suspend fun deleteExpired(now: Instant)
}
