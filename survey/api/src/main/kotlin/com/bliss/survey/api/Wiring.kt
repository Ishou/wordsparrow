package com.bliss.survey.api

import com.bliss.survey.api.auth.SessionPrincipal
import com.bliss.survey.application.ports.ProposedByRepository
import com.bliss.survey.application.ports.SurveyItemRepository
import com.bliss.survey.application.ports.UserProgressRepository
import com.bliss.survey.application.usecases.GetCurrentCampaignUseCase
import com.bliss.survey.application.usecases.GetLemmaMetaUseCase
import com.bliss.survey.application.usecases.GetNextItemUseCase
import com.bliss.survey.application.usecases.GetNextPairUseCase
import com.bliss.survey.application.usecases.SubmitPairRatingCommand
import com.bliss.survey.application.usecases.SubmitPairRatingResult
import com.bliss.survey.application.usecases.SubmitRatingCommand
import com.bliss.survey.application.usecases.SubmitRatingResult
import com.bliss.survey.application.usecases.UndoActionResult
import com.bliss.survey.domain.model.UserId
import com.bliss.survey.infrastructure.nats.UserDeletedConsumer
import com.bliss.survey.infrastructure.nats.UserRoleChangedConsumer

// Hand-rolled DI graph; Module.kt consumes this, Main.kt wires adapters, tests stub directly.
class Wiring(
    val verifySession: suspend (String) -> SessionPrincipal?,
    val getNextItem: GetNextItemUseCase,
    val submitRating: suspend (SubmitRatingCommand) -> SubmitRatingResult,
    val getNextPair: GetNextPairUseCase,
    val submitPairRating: suspend (SubmitPairRatingCommand) -> SubmitPairRatingResult,
    val undoAction: suspend (String, UserId) -> UndoActionResult,
    val getCurrentCampaign: GetCurrentCampaignUseCase,
    val getLemmaMeta: GetLemmaMetaUseCase,
    val items: SurveyItemRepository,
    val proposedBy: ProposedByRepository,
    val userProgress: UserProgressRepository,
    val userDeletedConsumer: UserDeletedConsumer? = null,
    val userRoleChangedConsumer: UserRoleChangedConsumer? = null,
    val closeNats: () -> Unit = {},
)
