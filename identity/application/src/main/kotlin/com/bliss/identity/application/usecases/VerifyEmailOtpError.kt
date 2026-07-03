package com.bliss.identity.application.usecases

// Every variant maps to a uniform 401 at the route (ADR-0091): the wire must not reveal which check failed.
sealed class VerifyEmailOtpError(
    message: String,
) : RuntimeException(message) {
    class NoChallenge : VerifyEmailOtpError("No active challenge for this email.")

    class BindingMismatch : VerifyEmailOtpError("Challenge-cookie binding secret does not match.")

    class CodeMismatch : VerifyEmailOtpError("Submitted code does not match.")

    class Expired : VerifyEmailOtpError("Challenge has expired.")

    class Locked : VerifyEmailOtpError("Challenge is locked after too many attempts.")
}
