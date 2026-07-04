package com.bliss.identity.application.usecases

import com.bliss.identity.application.ports.Clock
import com.bliss.identity.application.ports.EmailOtpChallengeRepository
import com.bliss.identity.application.ports.EmailSender
import com.bliss.identity.application.ports.IdGenerator
import com.bliss.identity.application.ports.RandomFactory
import com.bliss.identity.application.ports.TokenHasher
import com.bliss.identity.application.ports.UserRepository
import com.bliss.identity.domain.auth.EmailOtpChallenge
import com.bliss.identity.domain.user.EmailAddress
import org.slf4j.LoggerFactory
import java.time.Duration
import java.time.ZoneOffset

data class RequestEmailOtpCommand(
    val email: String,
)

sealed interface RequestEmailOtpResult {
    data class Sent(
        val challengeSecret: String,
    ) : RequestEmailOtpResult

    data object RateLimited : RequestEmailOtpResult

    data object BudgetExhausted : RequestEmailOtpResult
}

// Enumeration-safe start step (ADR-0091): abuse is throttled per-email here; per-IP limiting is ingress-nginx's job.
class RequestEmailOtpUseCase(
    private val challenges: EmailOtpChallengeRepository,
    private val emailSender: EmailSender,
    private val hasher: TokenHasher,
    private val randomFactory: RandomFactory,
    private val idGenerator: IdGenerator,
    private val clock: Clock,
    private val users: UserRepository,
    private val ttl: Duration = Duration.ofMinutes(10),
    private val cooldown: Duration = Duration.ofSeconds(60),
    private val dailyCap: Int = 8,
    private val monthlyCap: Int = 4500,
    private val dailyBudget: Int = 150,
    private val newAccountDailyBudget: Int = 50,
) {
    suspend fun execute(command: RequestEmailOtpCommand): RequestEmailOtpResult {
        val email = EmailAddress.of(command.email)
        val now = clock.now()

        val monthStart =
            now
                .atZone(ZoneOffset.UTC)
                .toLocalDate()
                .withDayOfMonth(1)
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
        val monthlyCount = challenges.countAllCreatedSince(monthStart)
        if (monthlyCount >= monthlyCap) {
            log.warn("otp_monthly_budget_exhausted cap={} count={}", monthlyCap, monthlyCount)
            return RequestEmailOtpResult.BudgetExhausted
        }

        val dayStart =
            now
                .atZone(ZoneOffset.UTC)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
        if (challenges.countAllCreatedSince(dayStart) >= dailyBudget) {
            log.warn("otp_daily_budget_exhausted cap={}", dailyBudget)
            return RequestEmailOtpResult.BudgetExhausted
        }

        val accountExisted = users.findByEmail(email).isNotEmpty()
        if (!accountExisted && challenges.countNewAccountCreatedSince(dayStart) >= newAccountDailyBudget) {
            log.warn("otp_new_account_budget_exhausted cap={}", newAccountDailyBudget)
            return RequestEmailOtpResult.BudgetExhausted
        }

        val latestCreatedAt = challenges.latestCreatedAt(email)
        if (latestCreatedAt != null && latestCreatedAt.isAfter(now.minus(cooldown))) {
            return RequestEmailOtpResult.RateLimited
        }
        if (challenges.countCreatedSince(email, now.minus(DAILY_WINDOW)) >= dailyCap) {
            return RequestEmailOtpResult.RateLimited
        }

        val code = randomFactory.newOtpCode()
        val secret = randomFactory.newChallengeSecret()
        challenges.create(
            EmailOtpChallenge(
                id = idGenerator.newChallengeId(),
                email = email,
                codeHash = hasher.hash(code.value),
                bindingHash = hasher.hash(secret.value),
                attempts = 0,
                accountExisted = accountExisted,
                createdAt = now,
                expiresAt = now.plus(ttl),
                consumedAt = null,
            ),
        )
        emailSender.sendOtp(email, code)
        return RequestEmailOtpResult.Sent(secret.value)
    }

    companion object {
        private val DAILY_WINDOW: Duration = Duration.ofHours(24)
        private val log = LoggerFactory.getLogger(RequestEmailOtpUseCase::class.java)
    }
}
