package com.bliss.identity.infrastructure.usecases

import assertk.assertThat
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import com.bliss.identity.application.usecases.LogoutAllCommand
import com.bliss.identity.application.usecases.LogoutAllUseCase
import com.bliss.identity.domain.session.Session
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemorySessionRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LogoutAllUseCaseTest {
    private val now: Instant = Instant.parse("2026-07-03T12:00:00Z")
    private val userA = UserId(UUID.fromString("01890c5e-0000-7000-8000-0000000000a1"))
    private val userB = UserId(UUID.fromString("01890c5e-0000-7000-8000-0000000000b1"))
    private val currentA = SessionId(UUID.fromString("01890c5e-0000-7000-8000-0000000000a2"))
    private val siblingA1 = SessionId(UUID.fromString("01890c5e-0000-7000-8000-0000000000a3"))
    private val siblingA2 = SessionId(UUID.fromString("01890c5e-0000-7000-8000-0000000000a4"))
    private val sessionB = SessionId(UUID.fromString("01890c5e-0000-7000-8000-0000000000b2"))

    private fun session(
        id: SessionId,
        userId: UserId,
    ) = Session(id = id, userId = userId, createdAt = now, lastSeenAt = now, revokedAt = null)

    private suspend fun InMemorySessionRepository.isActive(id: SessionId): Boolean = findById(id)!!.isActive

    @Test
    fun `revokes the other sessions of the caller while keeping the current and other users`() =
        runTest {
            val sessions = InMemorySessionRepository()
            sessions.create(session(currentA, userA))
            sessions.create(session(siblingA1, userA))
            sessions.create(session(siblingA2, userA))
            sessions.create(session(sessionB, userB))
            val sut = LogoutAllUseCase(sessions, FixedClock(now))

            sut.execute(LogoutAllCommand(currentSessionId = currentA))

            assertThat(sessions.isActive(currentA)).isTrue()
            assertThat(sessions.isActive(sessionB)).isTrue()
            assertThat(sessions.isActive(siblingA1)).isFalse()
            assertThat(sessions.isActive(siblingA2)).isFalse()
        }

    @Test
    fun `unknown current session is a clean no-op leaving every session active`() =
        runTest {
            val sessions = InMemorySessionRepository()
            sessions.create(session(currentA, userA))
            sessions.create(session(siblingA1, userA))
            sessions.create(session(sessionB, userB))
            val sut = LogoutAllUseCase(sessions, FixedClock(now))

            sut.execute(LogoutAllCommand(currentSessionId = SessionId(UUID.randomUUID())))

            assertThat(sessions.isActive(currentA)).isTrue()
            assertThat(sessions.isActive(siblingA1)).isTrue()
            assertThat(sessions.isActive(sessionB)).isTrue()
        }
}
