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
    // Required on the wire but nullable — null while the grid-resolved word is still pending/unresolved (ADR-0111, ADR-0003 §6).
    val wordText: String?,
    val clueText: String,
    val reason: String,
    val surface: String,
    // Required on the wire but nullable — null for mini-game reports, which carry no puzzle (ADR-0073, ADR-0003 §6).
    val puzzleId: String?,
    val count: Int,
    // Required on the wire but nullable — null when the group's latest report carries no note (ADR-0003 §6).
    val latestNote: String?,
    val latestAt: String,
    // True when the maintainer viewing the queue is among this group's reporters (ADR-0115).
    val mine: Boolean,
)

@Serializable
data class SignalementListResponse(
    val items: List<SignalementSummary>,
)

@Serializable
data class SignalementDecisionRequest(
    val decision: String,
)

// Maintainer history DTOs (ADR-0115): one already-triaged report; flat, not grouped.
@Serializable
data class SignalementHistoryItem(
    val reportId: String,
    val wordText: String?,
    val clueText: String,
    val reason: String,
    val surface: String,
    val puzzleId: String?,
    val note: String?,
    // "dismiss" (rejeté) or "action" (traité).
    val decision: String,
    val triagedAt: String,
)

@Serializable
data class SignalementHistoryResponse(
    val items: List<SignalementHistoryItem>,
)
