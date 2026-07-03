package com.bliss.identity.infrastructure.testdoubles

import com.bliss.identity.application.ports.IdGenerator
import com.bliss.identity.domain.auth.AuthAttemptId
import com.bliss.identity.domain.auth.ChallengeId
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.UserId
import java.util.UUID

class FixedIdGenerator(
    userIds: List<UUID> = emptyList(),
    sessionIds: List<UUID> = emptyList(),
    authAttemptIds: List<UUID> = emptyList(),
    challengeIds: List<UUID> = emptyList(),
) : IdGenerator {
    private val users = ArrayDeque(userIds)
    private val sessions = ArrayDeque(sessionIds)
    private val authAttempts = ArrayDeque(authAttemptIds)
    private val challenges = ArrayDeque(challengeIds)

    override fun newUserId(): UserId = UserId(users.removeFirstOrNull() ?: error("FixedIdGenerator exhausted for UserId."))

    override fun newSessionId(): SessionId = SessionId(sessions.removeFirstOrNull() ?: error("FixedIdGenerator exhausted for SessionId."))

    override fun newAuthAttemptId(): AuthAttemptId =
        AuthAttemptId(authAttempts.removeFirstOrNull() ?: error("FixedIdGenerator exhausted for AuthAttemptId."))

    override fun newChallengeId(): ChallengeId =
        ChallengeId(challenges.removeFirstOrNull() ?: error("FixedIdGenerator exhausted for ChallengeId."))
}
