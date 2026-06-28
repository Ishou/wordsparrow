package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.ProgressRepository
import com.bliss.identity.domain.progress.PuzzleId
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId

data class GetProgressQuery(
    val userId: UserId,
    val puzzleId: PuzzleId,
)

class GetProgressUseCase(
    private val progress: ProgressRepository,
) {
    suspend fun execute(query: GetProgressQuery): PuzzleProgress? = progress.find(query.userId, query.puzzleId)
}
