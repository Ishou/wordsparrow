package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.ProgressRepository
import com.bliss.identity.domain.progress.PuzzleProgress
import com.bliss.identity.domain.user.UserId

data class ListProgressQuery(
    val userId: UserId,
)

class ListProgressUseCase(
    private val progress: ProgressRepository,
) {
    suspend fun execute(query: ListProgressQuery): List<PuzzleProgress> = progress.findByUser(query.userId)
}
