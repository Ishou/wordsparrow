package com.bliss.identity.infrastructure.nats

import assertk.assertThat
import assertk.assertions.containsExactlyInAnyOrder
import assertk.assertions.isEqualTo
import com.bliss.identity.application.usecases.ApplySubscriptionChangeUseCase
import com.bliss.identity.application.usecases.WhoAmIQuery
import com.bliss.identity.application.usecases.WhoAmIUseCase
import com.bliss.identity.domain.session.Session
import com.bliss.identity.domain.session.SessionId
import com.bliss.identity.domain.user.Capability
import com.bliss.identity.domain.user.DisplayName
import com.bliss.identity.domain.user.SubscriptionTier
import com.bliss.identity.domain.user.User
import com.bliss.identity.domain.user.UserId
import com.bliss.identity.infrastructure.persistence.InMemorySessionRepository
import com.bliss.identity.infrastructure.persistence.InMemorySubscriptionTierRepository
import com.bliss.identity.infrastructure.persistence.InMemoryUserRepository
import com.bliss.identity.infrastructure.testdoubles.FixedClock
import io.nats.client.Connection
import io.nats.client.Nats
import io.nats.client.Options
import io.nats.client.api.RetentionPolicy
import io.nats.client.api.StorageType
import io.nats.client.api.StreamConfiguration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.testcontainers.DockerClientFactory
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.DockerImageName
import java.time.Duration
import java.time.Instant
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SubscriptionChangedConsumerTest {
    private lateinit var natsContainer: GenericContainer<*>
    private lateinit var nats: Connection
    private val scope = CoroutineScope(SupervisorJob())
    private val now: Instant = Instant.parse("2026-06-30T12:00:00Z")
    private val userId = UserId(UUID.randomUUID())
    private val sessionId = SessionId(UUID.randomUUID())

    @BeforeAll
    fun startNats() {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable()) { "Docker daemon not available" }
        natsContainer =
            GenericContainer(DockerImageName.parse("nats:2.10-alpine"))
                .withCommand("-js")
                .withExposedPorts(4222)
                .waitingFor(Wait.forLogMessage(".*Server is ready.*", 1))
        natsContainer.start()
        val url = "nats://${natsContainer.host}:${natsContainer.getMappedPort(4222)}"
        nats =
            Nats.connect(
                Options
                    .Builder()
                    .server(url)
                    .connectionTimeout(Duration.ofSeconds(5))
                    .build(),
            )
        nats.jetStreamManagement().addStream(
            StreamConfiguration
                .builder()
                .name(SubscriptionChangedConsumer.STREAM_NAME)
                .subjects(SubscriptionChangedConsumer.SUBJECT)
                .retentionPolicy(RetentionPolicy.Limits)
                .storageType(StorageType.Memory)
                .build(),
        )
    }

    @AfterAll
    fun stopNats() {
        if (::nats.isInitialized) nats.close()
        if (::natsContainer.isInitialized) natsContainer.stop()
    }

    private fun publish(
        tier: String,
        status: String,
        changedAt: Instant,
    ) {
        val payload =
            """{"userId":"${userId.value}","tier":"$tier","status":"$status","changedAt":"$changedAt"}"""
        nats.jetStream().publish(SubscriptionChangedConsumer.SUBJECT, payload.toByteArray())
    }

    private suspend fun awaitTier(
        subscriptions: InMemorySubscriptionTierRepository,
        expected: SubscriptionTier,
    ) {
        val deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos()
        while (subscriptions.find(userId)?.tier != expected && System.nanoTime() < deadline) delay(50)
        assertThat(subscriptions.find(userId)?.tier).isEqualTo(expected)
    }

    @Test
    fun `a subscriber event persists the tier and whoami then exposes the grilles capabilities`() =
        runBlocking {
            val users = InMemoryUserRepository()
            val sessions = InMemorySessionRepository()
            val subscriptions = InMemorySubscriptionTierRepository()
            users.create(User(userId, DisplayName.of("Alice"), now, now))
            sessions.create(Session(sessionId, userId, now, now, null))
            val apply = ApplySubscriptionChangeUseCase(users, subscriptions)
            val whoAmI = WhoAmIUseCase(users, sessions, FixedClock(now), Duration.ofDays(7), subscriptions)
            val consumer = SubscriptionChangedConsumer(nats, apply, scope, pollWait = Duration.ofMillis(200))
            consumer.start()

            publish("subscriber", "active", now)
            awaitTier(subscriptions, SubscriptionTier.SUBSCRIBER)

            val result = whoAmI.execute(WhoAmIQuery(sessionId))
            assertThat(result.capabilities)
                .containsExactlyInAnyOrder(Capability.HINT, Capability.GRILLES_ALL, Capability.GRILLES_GENERATE)

            // last-write-wins: an older free event is ignored.
            publish("free", "active", now.minusSeconds(60))
            delay(500)
            assertThat(subscriptions.find(userId)?.tier).isEqualTo(SubscriptionTier.SUBSCRIBER)

            // a newer cancelled event drops the user back to free.
            publish("subscriber", "cancelled", now.plusSeconds(60))
            awaitTier(subscriptions, SubscriptionTier.FREE)
            assertThat(whoAmI.execute(WhoAmIQuery(sessionId)).capabilities)
                .containsExactlyInAnyOrder(Capability.HINT)

            consumer.stop()
        }
}
