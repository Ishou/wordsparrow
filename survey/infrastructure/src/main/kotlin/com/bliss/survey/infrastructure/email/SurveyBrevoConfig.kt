package com.bliss.survey.infrastructure.email

/** Brevo credentials for survey's own transactional sender (ADR-0103); shares identity's Brevo account/key but sends from its own address. */
data class SurveyBrevoConfig(
    val apiKey: String,
    val senderEmail: String,
    val senderName: String,
)
