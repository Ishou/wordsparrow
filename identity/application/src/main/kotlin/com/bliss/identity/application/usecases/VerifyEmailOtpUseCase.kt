package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.Clock
import com.bliss.identity.application.ports.EmailOtpChallengeRepository
import com.bliss.identity.application.ports.IdGenerator
import com.bliss.identity.application.ports.SessionRepository
import com.bliss.identity.application.ports.TokenHasher
import com.bliss.identity.application.ports.UserProviderRepository
import com.bliss.identity.application.ports.UserRepository
import com.bliss.identity.domain.provider.Provider
import com.bliss.identity.domain.provider.Subject
import com.bliss.identity.domain.provider.UserProvider
import com.bliss.identity.domain.session.Session
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.EmailAddress
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import java.time.Instant

private val DEFAULT_DISPLAY_NAME = DisplayName.of("Joueur")

data class VerifyEmailOtpCommand(
    val email: String,
    val code: String,
    val cookieSecret: String?,
)

data class VerifyEmailOtpResult(
    val sessionId: SessionId,
    val userId: UserId,
)

class VerifyEmailOtpUseCase(
    private val challenges: EmailOtpChallengeRepository,
    private val hasher: TokenHasher,
    private val users: UserRepository,
    private val userProviders: UserProviderRepository,
    private val sessions: SessionRepository,
    private val idGenerator: IdGenerator,
    private val clock: Clock,
) {
    suspend fun execute(command: VerifyEmailOtpCommand): VerifyEmailOtpResult {
        val email = EmailAddress.of(command.email)
        val now = clock.now()
        val challenge = challenges.findActiveByEmail(email, now) ?: throw VerifyEmailOtpError.NoChallenge()
        if (challenge.isExpired(now)) throw VerifyEmailOtpError.Expired()
        if (challenge.isLocked()) throw VerifyEmailOtpError.Locked()
        if (command.cookieSecret == null || hasher.hash(command.cookieSecret) != challenge.bindingHash) {
            challenges.save(challenge.withIncrementedAttempt())
            throw VerifyEmailOtpError.BindingMismatch()
        }
        if (hasher.hash(command.code) != challenge.codeHash) {
            challenges.save(challenge.withIncrementedAttempt())
            throw VerifyEmailOtpError.CodeMismatch()
        }
        challenges.save(challenge.consumed(now))
        val userId = resolveAccount(email, now)
        users.updateLastSeenAt(userId, now)
        val sessionId = idGenerator.newSessionId()
        sessions.create(
            Session(
                id = sessionId,
                userId = userId,
                createdAt = now,
                lastSeenAt = now,
                revokedAt = null,
            ),
        )
        return VerifyEmailOtpResult(sessionId = sessionId, userId = userId)
    }

    // Option-B resolution (ADR-0091): link → same account; exactly-one email match → attach link; else fresh account.
    private suspend fun resolveAccount(
        email: EmailAddress,
        now: Instant,
    ): UserId {
        val subject = Subject.of(email.value)
        userProviders.findByProviderAndSubject(Provider.EMAIL, subject)?.let { return it.userId }
        val matches = users.findByEmail(email)
        val userId =
            if (matches.size == 1) {
                matches.single().id
            } else {
                val created =
                    User(
                        id = idGenerator.newUserId(),
                        displayName = DEFAULT_DISPLAY_NAME,
                        createdAt = now,
                        lastSeenAt = now,
                        email = email.value,
                    )
                users.create(created)
                created.id
            }
        userProviders.link(
            UserProvider(
                userId = userId,
                provider = Provider.EMAIL,
                subject = subject,
                emailAtLink = email.value,
                linkedAt = now,
            ),
        )
        return userId
    }
}
