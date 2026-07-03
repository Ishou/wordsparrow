package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.Clock
import com.bliss.identity.application.ports.SessionRepository
import com.bliss.identity.domain.session.SessionId

data class LogoutAllCommand(
    val currentSessionId: SessionId,
)

class LogoutAllUseCase(
    private val sessions: SessionRepository,
    private val clock: Clock,
) {
    suspend fun execute(command: LogoutAllCommand) {
        // Unknown session (stale/forged cookie): nothing to revoke, so exit cleanly.
        val session = sessions.findById(command.currentSessionId) ?: return
        sessions.revokeAllForUserExcept(session.userId, command.currentSessionId, clock.now())
    }
}
