package com.bliss.identity.api

import com.bliss.identity.api.config.IdentityApiConfig
import com.bliss.identity.api.routes.CallbackDispatcher
import com.bliss.identity.application.ports.OidcProviderConfig
import com.bliss.identity.application.ports.OidcResponseMode
import com.bliss.identity.application.ports.UserDeletedBroadcaster
import com.bliss.identity.application.ports.UserRenamedBroadcaster
import com.bliss.identity.application.usecases.ApplySubscriptionChangeUseCase
import com.bliss.identity.application.usecases.BeginOidcLoginUseCase
import com.bliss.identity.application.usecases.CompleteOidcLoginUseCase
import com.bliss.identity.application.usecases.CompleteProviderLinkUseCase
import com.bliss.identity.application.usecases.DeleteUserUseCase
import com.bliss.identity.application.usecases.GetMeUseCase
import com.bliss.identity.application.usecases.GetProgressUseCase
import com.bliss.identity.application.usecases.ListProgressUseCase
import com.bliss.identity.application.usecases.LogoutAllUseCase
import com.bliss.identity.application.usecases.LogoutUseCase
import com.bliss.identity.application.usecases.PutProgressUseCase
import com.bliss.identity.application.usecases.RequestEmailOtpUseCase
import com.bliss.identity.application.usecases.UpdateMeUseCase
import com.bliss.identity.application.usecases.VerifyEmailOtpUseCase
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.domain.oidc.OidcVerifier
import com.bliss.identity.domain.provider.Provider
import com.bliss.identity.infrastructure.auth.SecureRandomFactory
import com.bliss.identity.infrastructure.auth.Sha256TokenHasher
import com.bliss.identity.infrastructure.email.BrevoEmailSender
import com.bliss.identity.infrastructure.events.NatsUserDeletedBroadcaster
import com.bliss.identity.infrastructure.events.NatsUserRenamedBroadcaster
import com.bliss.identity.infrastructure.id.UuidV7IdGenerator
import com.bliss.identity.infrastructure.oidc.JoseOidcVerifier
import com.bliss.identity.infrastructure.oidc.JwksCache
import com.bliss.identity.infrastructure.oidc.KtorOidcCodeExchanger
import com.bliss.identity.infrastructure.oidc.StaticOidcProviderConfigSource
import com.bliss.identity.infrastructure.persistence.PostgresAuthAttemptRepository
import com.bliss.identity.infrastructure.persistence.PostgresEmailOtpChallengeRepository
import com.bliss.identity.infrastructure.persistence.PostgresPuzzleProgressRepository
import com.bliss.identity.infrastructure.persistence.PostgresSessionRepository
import com.bliss.identity.infrastructure.persistence.PostgresSubscriptionTierRepository
import com.bliss.identity.infrastructure.persistence.PostgresUserProviderRepository
import com.bliss.identity.infrastructure.persistence.PostgresUserRepository
import com.bliss.identity.infrastructure.time.SystemClock
import io.ktor.client.engine.HttpClientEngine
import io.nats.client.JetStream
import java.time.Duration
import javax.sql.DataSource

// Hand-rolled DI graph for identity-api. Constructs every adapter + use case from
// the runtime config + Postgres `DataSource`. Tests use `forTesting(...)` to supply
// only the use cases the route under test exercises.
class Wiring private constructor(
    private val _beginOidcLogin: BeginOidcLoginUseCase?,
    private val _completeOidcLogin: CompleteOidcLoginUseCase?,
    private val _completeProviderLink: CompleteProviderLinkUseCase?,
    private val _whoAmI: WhoAmIUseCase?,
    private val _logout: LogoutUseCase?,
    private val _getMe: GetMeUseCase?,
    private val _updateMe: UpdateMeUseCase?,
    private val _deleteUser: DeleteUserUseCase?,
    private val _listProgress: ListProgressUseCase?,
    private val _getProgress: GetProgressUseCase?,
    private val _putProgress: PutProgressUseCase?,
    private val _callbackDispatcher: CallbackDispatcher?,
    private val _applySubscriptionChange: ApplySubscriptionChangeUseCase?,
    private val _requestEmailOtp: RequestEmailOtpUseCase?,
    private val _verifyEmailOtp: VerifyEmailOtpUseCase?,
    private val _logoutAll: LogoutAllUseCase?,
) {
    val beginOidcLogin: BeginOidcLoginUseCase get() = require(_beginOidcLogin, "BeginOidcLoginUseCase")
    val completeOidcLogin: CompleteOidcLoginUseCase get() = require(_completeOidcLogin, "CompleteOidcLoginUseCase")
    val completeProviderLink: CompleteProviderLinkUseCase get() = require(_completeProviderLink, "CompleteProviderLinkUseCase")
    val whoAmI: WhoAmIUseCase get() = require(_whoAmI, "WhoAmIUseCase")
    val logout: LogoutUseCase get() = require(_logout, "LogoutUseCase")
    val getMe: GetMeUseCase get() = require(_getMe, "GetMeUseCase")
    val updateMe: UpdateMeUseCase get() = require(_updateMe, "UpdateMeUseCase")
    val deleteUser: DeleteUserUseCase get() = require(_deleteUser, "DeleteUserUseCase")
    val listProgress: ListProgressUseCase get() = require(_listProgress, "ListProgressUseCase")
    val getProgress: GetProgressUseCase get() = require(_getProgress, "GetProgressUseCase")
    val putProgress: PutProgressUseCase get() = require(_putProgress, "PutProgressUseCase")
    val callbackDispatcher: CallbackDispatcher get() = require(_callbackDispatcher, "CallbackDispatcher")
    val applySubscriptionChange: ApplySubscriptionChangeUseCase get() = require(_applySubscriptionChange, "ApplySubscriptionChangeUseCase")
    val requestEmailOtp: RequestEmailOtpUseCase get() = require(_requestEmailOtp, "RequestEmailOtpUseCase")
    val verifyEmailOtp: VerifyEmailOtpUseCase get() = require(_verifyEmailOtp, "VerifyEmailOtpUseCase")
    val logoutAll: LogoutAllUseCase get() = require(_logoutAll, "LogoutAllUseCase")

    // Nullable peek accessors so Module.kt can mount only the routes whose use case is wired,
    // letting tests supply a slim Wiring.forTesting(...) for the route under test.
    internal val beginOidcLoginOrNull: BeginOidcLoginUseCase? get() = _beginOidcLogin
    internal val completeOidcLoginOrNull: CompleteOidcLoginUseCase? get() = _completeOidcLogin
    internal val whoAmIOrNull: WhoAmIUseCase? get() = _whoAmI
    internal val logoutOrNull: LogoutUseCase? get() = _logout
    internal val getMeOrNull: GetMeUseCase? get() = _getMe
    internal val updateMeOrNull: UpdateMeUseCase? get() = _updateMe
    internal val deleteUserOrNull: DeleteUserUseCase? get() = _deleteUser
    internal val listProgressOrNull: ListProgressUseCase? get() = _listProgress
    internal val getProgressOrNull: GetProgressUseCase? get() = _getProgress
    internal val putProgressOrNull: PutProgressUseCase? get() = _putProgress
    internal val callbackDispatcherOrNull: CallbackDispatcher? get() = _callbackDispatcher
    internal val requestEmailOtpOrNull: RequestEmailOtpUseCase? get() = _requestEmailOtp
    internal val verifyEmailOtpOrNull: VerifyEmailOtpUseCase? get() = _verifyEmailOtp
    internal val logoutAllOrNull: LogoutAllUseCase? get() = _logoutAll

    private fun <T : Any> require(
        value: T?,
        name: String,
    ): T = value ?: error("Test wiring did not provide $name; the route under test must not call it.")

    companion object {
        fun forProduction(
            config: IdentityApiConfig,
            dataSource: DataSource,
            httpClientEngine: HttpClientEngine,
            jetStream: JetStream,
        ): Wiring {
            val clock = SystemClock
            val idGen = UuidV7IdGenerator()
            val random = SecureRandomFactory()

            val users = PostgresUserRepository(dataSource)
            val userProviders = PostgresUserProviderRepository(dataSource)
            val sessions = PostgresSessionRepository(dataSource)
            val attempts = PostgresAuthAttemptRepository(dataSource)
            val progress = PostgresPuzzleProgressRepository(dataSource)
            val subscriptions = PostgresSubscriptionTierRepository(dataSource)

            val providerConfigs =
                mapOf(
                    Provider.GOOGLE to
                        OidcProviderConfig(
                            provider = Provider.GOOGLE,
                            issuer = "https://accounts.google.com",
                            audience = config.google.clientId,
                            clientId = config.google.clientId,
                            authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth",
                            tokenUrl = "https://oauth2.googleapis.com/token",
                            jwksUri = "https://www.googleapis.com/oauth2/v3/certs",
                            redirectUri = "https://${config.publicHost}/v1/auth/google/callback",
                            responseMode = OidcResponseMode.QUERY,
                            clientAuth = config.googleAuth,
                        ),
                    Provider.APPLE to
                        OidcProviderConfig(
                            provider = Provider.APPLE,
                            issuer = "https://appleid.apple.com",
                            audience = config.apple.serviceId,
                            clientId = config.apple.serviceId,
                            authorizeUrl = "https://appleid.apple.com/auth/authorize",
                            tokenUrl = "https://appleid.apple.com/auth/token",
                            jwksUri = "https://appleid.apple.com/auth/keys",
                            redirectUri = "https://${config.publicHost}/v1/auth/apple/callback",
                            responseMode = OidcResponseMode.FORM_POST,
                            clientAuth = config.appleAuth,
                        ),
                )

            val configSource = StaticOidcProviderConfigSource(providerConfigs)

            val jwksCache =
                JwksCache.defaultProduction(
                    ttl = Duration.ofMinutes(5),
                    clock = { clock.now() },
                )
            val verifier: OidcVerifier = JoseOidcVerifier(jwksCache, clock = { clock.now() })

            val codeExchanger =
                KtorOidcCodeExchanger(
                    configSource = configSource,
                    engine = httpClientEngine,
                    clock = clock,
                )

            // NATS publishers (ADR-0049): user.deleted is ack-required; user.renamed is fire-and-forget.
            val deletedBroadcaster: UserDeletedBroadcaster = NatsUserDeletedBroadcaster(jetStream)
            val renamedBroadcaster: UserRenamedBroadcaster = NatsUserRenamedBroadcaster(jetStream)

            val completeOidcLoginUseCase =
                CompleteOidcLoginUseCase(
                    attempts,
                    codeExchanger,
                    verifier,
                    configSource,
                    users,
                    userProviders,
                    sessions,
                    idGen,
                    clock,
                )
            val completeProviderLinkUseCase =
                CompleteProviderLinkUseCase(
                    attempts,
                    codeExchanger,
                    verifier,
                    configSource,
                    users,
                    userProviders,
                    clock,
                )
            val callbackDispatcher =
                CallbackDispatcher(
                    attempts = attempts,
                    completeOidcLogin = completeOidcLoginUseCase,
                    completeProviderLink = completeProviderLinkUseCase,
                )

            // Flag retirement: 2026-10-01
            val emailOtpEnabled = System.getenv("IDENTITY_EMAIL_OTP_ENABLED")?.toBooleanStrictOrNull() == true
            var requestEmailOtp: RequestEmailOtpUseCase? = null
            var verifyEmailOtp: VerifyEmailOtpUseCase? = null
            if (emailOtpEnabled) {
                val brevo = config.brevo ?: error("IDENTITY_EMAIL_OTP_ENABLED=true requires BREVO_API_KEY")
                val challenges = PostgresEmailOtpChallengeRepository(dataSource)
                val hasher = Sha256TokenHasher()
                val emailSender = BrevoEmailSender(httpClientEngine, brevo)
                requestEmailOtp = RequestEmailOtpUseCase(challenges, emailSender, hasher, random, idGen, clock)
                verifyEmailOtp = VerifyEmailOtpUseCase(challenges, hasher, users, userProviders, sessions, idGen, clock)
            }

            return Wiring(
                _beginOidcLogin =
                    BeginOidcLoginUseCase(
                        configSource,
                        random,
                        idGen,
                        attempts,
                        clock,
                        config.attemptTtl,
                    ),
                _completeOidcLogin = completeOidcLoginUseCase,
                _completeProviderLink = completeProviderLinkUseCase,
                _whoAmI = WhoAmIUseCase(users, sessions, clock, config.sessionMaxAge, subscriptions),
                _logout = LogoutUseCase(sessions, clock),
                _getMe = GetMeUseCase(users, userProviders, subscriptions),
                _updateMe = UpdateMeUseCase(users, renamedBroadcaster, clock),
                _deleteUser = DeleteUserUseCase(users, deletedBroadcaster, clock),
                _listProgress = ListProgressUseCase(progress),
                _getProgress = GetProgressUseCase(progress),
                _putProgress = PutProgressUseCase(progress, clock),
                _callbackDispatcher = callbackDispatcher,
                _applySubscriptionChange = ApplySubscriptionChangeUseCase(users, subscriptions),
                _requestEmailOtp = requestEmailOtp,
                _verifyEmailOtp = verifyEmailOtp,
                _logoutAll = LogoutAllUseCase(sessions, clock),
            )
        }

        fun forTesting(
            beginOidcLogin: BeginOidcLoginUseCase? = null,
            completeOidcLogin: CompleteOidcLoginUseCase? = null,
            completeProviderLink: CompleteProviderLinkUseCase? = null,
            whoAmI: WhoAmIUseCase? = null,
            logout: LogoutUseCase? = null,
            getMe: GetMeUseCase? = null,
            updateMe: UpdateMeUseCase? = null,
            deleteUser: DeleteUserUseCase? = null,
            listProgress: ListProgressUseCase? = null,
            getProgress: GetProgressUseCase? = null,
            putProgress: PutProgressUseCase? = null,
            callbackDispatcher: CallbackDispatcher? = null,
            applySubscriptionChange: ApplySubscriptionChangeUseCase? = null,
            requestEmailOtp: RequestEmailOtpUseCase? = null,
            verifyEmailOtp: VerifyEmailOtpUseCase? = null,
            logoutAll: LogoutAllUseCase? = null,
        ): Wiring =
            Wiring(
                _beginOidcLogin = beginOidcLogin,
                _completeOidcLogin = completeOidcLogin,
                _completeProviderLink = completeProviderLink,
                _whoAmI = whoAmI,
                _logout = logout,
                _getMe = getMe,
                _updateMe = updateMe,
                _deleteUser = deleteUser,
                _listProgress = listProgress,
                _getProgress = getProgress,
                _putProgress = putProgress,
                _callbackDispatcher = callbackDispatcher,
                _applySubscriptionChange = applySubscriptionChange,
                _requestEmailOtp = requestEmailOtp,
                _verifyEmailOtp = verifyEmailOtp,
                _logoutAll = logoutAll,
            )
    }
}
