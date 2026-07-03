package com.bliss.identity.api.routes

import com.bliss.identity.api.auth.ChallengeCookies
import com.bliss.identity.api.auth.SessionCookies
import com.bliss.identity.api.dto.EmailStartRequest
import com.bliss.identity.api.dto.EmailVerifyRequest
import com.bliss.identity.api.dto.WhoAmIResponse
import com.bliss.identity.application.usecases.RequestEmailOtpCommand
import com.bliss.identity.application.usecases.RequestEmailOtpResult
import com.bliss.identity.application.usecases.RequestEmailOtpUseCase
import com.bliss.identity.application.usecases.VerifyEmailOtpCommand
import com.bliss.identity.application.usecases.VerifyEmailOtpError
import com.bliss.identity.application.usecases.VerifyEmailOtpUseCase
import com.bliss.identity.application.usecases.WhoAmIQuery
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.infrastructure.email.EmailSendFailed
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import java.time.Duration

fun Route.emailOtp(
    requestEmailOtp: RequestEmailOtpUseCase,
    verifyEmailOtp: VerifyEmailOtpUseCase,
    whoAmI: WhoAmIUseCase,
    sessionMaxAge: Duration,
    json: Json = EMAIL_OTP_JSON,
) {
    post("/v1/auth/email/start") {
        val request =
            try {
                call.receive<EmailStartRequest>()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                return@post call.problem(json, HttpStatusCode.BadRequest, "invalid_body", "Request body must match EmailStartRequest.")
            }
        val result =
            try {
                requestEmailOtp.execute(RequestEmailOtpCommand(request.email))
            } catch (e: CancellationException) {
                throw e
            } catch (_: IllegalArgumentException) {
                return@post call.problem(json, HttpStatusCode.BadRequest, "invalid_email", "The email address is invalid.")
            } catch (_: EmailSendFailed) {
                // Delivery failed downstream — surface it, never a fake 202 nor a 500 (ADR-0091 carry-forward).
                return@post call.problem(json, HttpStatusCode.BadGateway, "email_send_failed", "The verification email could not be sent.")
            }
        when (result) {
            is RequestEmailOtpResult.RateLimited ->
                call.problem(json, HttpStatusCode.TooManyRequests, "rate_limited", "Too many requests for this email; try again later.")
            is RequestEmailOtpResult.Sent -> {
                ChallengeCookies.issue(call, result.challengeSecret)
                call.respond(HttpStatusCode.Accepted)
            }
        }
    }

    post("/v1/auth/email/verify") {
        val request =
            try {
                call.receive<EmailVerifyRequest>()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                return@post call.problem(json, HttpStatusCode.BadRequest, "invalid_body", "Request body must match EmailVerifyRequest.")
            }
        val cookieSecret = ChallengeCookies.read(call)
        val result =
            try {
                verifyEmailOtp.execute(VerifyEmailOtpCommand(request.email, request.code, cookieSecret))
            } catch (e: CancellationException) {
                throw e
            } catch (_: VerifyEmailOtpError) {
                // Uniform 401 — the wire must not reveal which check failed (ADR-0091 threat model).
                return@post call.problem(json, HttpStatusCode.Unauthorized, "invalid_code", "The code is invalid or has expired.")
            }
        SessionCookies.issue(call, result.sessionId, sessionMaxAge)
        ChallengeCookies.clear(call)
        val identity = whoAmI.execute(WhoAmIQuery(result.sessionId))
        call.respond(
            HttpStatusCode.OK,
            WhoAmIResponse(
                userId = identity.userId.value.toString(),
                displayName = identity.displayName.value,
                role = identity.role.wire,
                capabilities = identity.capabilities.map { it.wire }.sorted(),
            ),
        )
    }
}

private val EMAIL_OTP_JSON: Json =
    Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
        explicitNulls = false
    }
