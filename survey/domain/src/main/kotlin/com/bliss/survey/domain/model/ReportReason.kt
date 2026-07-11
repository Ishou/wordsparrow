package com.bliss.survey.domain.model

enum class ReportReason {
    MOT_OFFENSANT,
    DEFINITION_OFFENSANTE,
    ERREUR_SENS,
    ERREUR_GRAMMAIRE,
    DEFINITION_REVELE,
    AMBIGU,
    TROP_FACILE,
    TROP_DIFFICILE,
    AUTRE,
    ;

    fun isHarm(): Boolean = this == MOT_OFFENSANT || this == DEFINITION_OFFENSANTE
}

enum class ReportStatus {
    PENDING,
    DISMISSED,
    ACTIONED,
}

enum class ReportSurface {
    SOLO,
    DAILY,
    MULTIPLAYER,
    MINI_GAME,
}
