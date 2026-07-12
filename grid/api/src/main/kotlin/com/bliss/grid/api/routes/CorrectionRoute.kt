package com.bliss.grid.api.routes

import com.bliss.grid.api.auth.ADMIN_SIGNALEMENTS_CAPABILITY
import com.bliss.grid.api.auth.UserIdKey
import com.bliss.grid.api.auth.requireCapability
import com.bliss.grid.api.dto.CorrectionAcceptedDto
import com.bliss.grid.api.dto.CorrectionProgressDto
import com.bliss.grid.api.dto.CorrectionRequestDto
import com.bliss.grid.api.dto.ProblemDetails
import com.bliss.grid.application.correction.CorrectionProgress
import com.bliss.grid.application.correction.CorrectionRepository
import com.bliss.grid.application.correction.RecordCorrectionUseCase
import com.bliss.grid.domain.correction.ClueCorrection
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receive
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.util.UUID

private const val MAX_CLUE_TEXT = 512
private const val MAX_WORD_TEXT = 64

private const val INVALID_CORRECTION_TYPE = "https://bliss.example/errors/invalid-correction"
private const val INVALID_CORRECTION_ID_TYPE = "https://bliss.example/errors/invalid-correction-id"
private const val LAST_CLUE_FORBIDDEN_TYPE = "https://bliss.example/errors/last-clue-forbidden"
private const val CORRECTION_NOT_FOUND_TYPE = "https://bliss.example/errors/correction-not-found"

// explicitNulls keeps required-nullable gridsMatched present on the wire (ADR-0003 §6).
private val correctionJson =
    Json {
        prettyPrint = false
        explicitNulls = true
        encodeDefaults = true
    }

/** Maintainer clue-correction routes (ADR-0108), gated by the `admin:signalements` capability. */
fun Route.corrections(
    recordCorrection: RecordCorrectionUseCase,
    correctionRepository: CorrectionRepository,
) {
    post("/v1/corrections") {
        if (!call.requireCapability(ADMIN_SIGNALEMENTS_CAPABILITY)) return@post
        val createdBy = call.attributes.getOrNull(UserIdKey) ?: return@post

        val request =
            try {
                call.receive<CorrectionRequestDto>()
            } catch (_: SerializationException) {
                return@post call.respondCorrectionProblem(
                    HttpStatusCode.BadRequest,
                    INVALID_CORRECTION_TYPE,
                    "Invalid correction",
                    "Le corps de la requete est mal forme.",
                )
            }

        val correction =
            request.toClueCorrection()
                ?: return@post call.respondCorrectionProblem(
                    HttpStatusCode.BadRequest,
                    INVALID_CORRECTION_TYPE,
                    "Invalid correction",
                    "La correction est invalide.",
                )

        when (val result = recordCorrection.execute(correction, createdBy)) {
            is RecordCorrectionUseCase.Result.Recorded ->
                call.respondText(
                    text =
                        correctionJson.encodeToString(
                            CorrectionAcceptedDto.serializer(),
                            CorrectionAcceptedDto(result.correctionId.toString(), "pending"),
                        ),
                    contentType = ContentType.Application.Json,
                    status = HttpStatusCode.Accepted,
                )
            RecordCorrectionUseCase.Result.LastClueForbidden ->
                call.respondCorrectionProblem(
                    HttpStatusCode.Conflict,
                    LAST_CLUE_FORBIDDEN_TYPE,
                    "Last clue forbidden",
                    "Cette definition est la seule du mot. Remplace le texte ou blackliste le mot.",
                )
        }
    }

    get("/v1/corrections/{correctionId}") {
        if (!call.requireCapability(ADMIN_SIGNALEMENTS_CAPABILITY)) return@get

        val id =
            runCatching { UUID.fromString(call.parameters["correctionId"]) }.getOrNull()
                ?: return@get call.respondCorrectionProblem(
                    HttpStatusCode.BadRequest,
                    INVALID_CORRECTION_ID_TYPE,
                    "Invalid correction id",
                    "L'identifiant de correction n'est pas un UUID valide.",
                )

        val progress =
            correctionRepository.progress(id)
                ?: return@get call.respondCorrectionProblem(
                    HttpStatusCode.NotFound,
                    CORRECTION_NOT_FOUND_TYPE,
                    "Correction not found",
                    "Aucune correction avec cet identifiant.",
                )

        call.respondText(
            text = correctionJson.encodeToString(CorrectionProgressDto.serializer(), progress.toDto()),
            contentType = ContentType.Application.Json,
            status = HttpStatusCode.OK,
        )
    }
}

private fun CorrectionRequestDto.toClueCorrection(): ClueCorrection? {
    val kind = ClueCorrection.Kind.fromWire(kind) ?: return null
    if (oldClueText.isBlank() || oldClueText.length > MAX_CLUE_TEXT) return null
    if (wordText != null && (wordText.isBlank() || wordText.length > MAX_WORD_TEXT)) return null
    val newText =
        when (kind) {
            ClueCorrection.Kind.REPLACE -> {
                if (newClueText.isNullOrBlank() || newClueText.length > MAX_CLUE_TEXT) return null
                newClueText
            }
            // A forbid is word-scoped (ADR-0108): wordText names the word so the last-clue guard runs.
            ClueCorrection.Kind.FORBID_CLUE -> {
                if (wordText.isNullOrBlank()) return null
                null
            }
        }
    return ClueCorrection(kind = kind, oldClueText = oldClueText, wordText = wordText, newClueText = newText)
}

private fun CorrectionProgress.toDto(): CorrectionProgressDto =
    CorrectionProgressDto(
        correctionId = correctionId.toString(),
        kind = kind.wire,
        backfillStatus = backfillStatus.wire,
        gridsMatched = gridsMatched,
        gridsPatched = gridsPatched,
    )

private suspend fun ApplicationCall.respondCorrectionProblem(
    status: HttpStatusCode,
    type: String,
    title: String,
    detail: String,
) {
    val problem =
        ProblemDetails(
            type = type,
            title = title,
            status = status.value,
            detail = detail,
            instance = request.local.uri,
        )
    respondText(
        text = Json.encodeToString(ProblemDetails.serializer(), problem),
        contentType = ContentType.parse("application/problem+json"),
        status = status,
    )
}
