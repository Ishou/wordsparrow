package com.bliss.survey.api.dto

import kotlinx.serialization.Serializable

// Wire DTOs for the signalement capture endpoint — camelCase per ADR-0003; enums are lowercase strings mapped to domain enums in the route.
@Serializable
data class SignalementRequest(
    // Optional: an offensive clue is reportable without a solved word (ADR-0103); sent only when the player solved it.
    val wordText: String? = null,
    val clueText: String,
    val reason: String,
    val note: String? = null,
    val puzzleId: String? = null,
    val surface: String,
)

@Serializable
data class SignalementResponse(
    val reportId: String,
)

// Maintainer triage DTOs: `reportId` is the group's latest report — the id `POST /decision` acts on.
@Serializable
data class SignalementSummary(
    val reportId: String,
    // Required on the wire but nullable — null when the group's reports carry no solved word (ADR-0003 §6).
    val wordText: String?,
    val clueText: String,
    val reason: String,
    val count: Int,
    // Required on the wire but nullable — null when the group's latest report carries no note (ADR-0003 §6).
    val latestNote: String?,
    val latestAt: String,
)

@Serializable
data class SignalementListResponse(
    val items: List<SignalementSummary>,
)

@Serializable
data class SignalementDecisionRequest(
    val decision: String,
)
