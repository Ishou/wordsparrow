package com.bliss.identity.application.ports

import com.bliss.identity.domain.session.Session
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.UserId
import java.time.Instant

interface SessionRepository {
    suspend fun create(session: Session)

    suspend fun findById(id: SessionId): Session?

    /** Revoke a session — idempotent: a second call preserves the original revokedAt; no-op for unknown id. */
    suspend fun revoke(
        id: SessionId,
        at: Instant,
    )

    /** Revoke every active session of the user except [keep] — the caller's current device stays signed in. */
    suspend fun revokeAllForUserExcept(
        userId: UserId,
        keep: SessionId,
        at: Instant,
    )

    suspend fun deleteForUser(userId: UserId)
}
