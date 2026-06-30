package com.bliss.billing.infrastructure.nats

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.CheckoutUrls
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.EventIdGenerator
import com.bliss.billing.application.ports.ProviderSubscriptionState
import com.bliss.billing.application.ports.SubscriptionChanged
import com.bliss.billing.application.ports.SubscriptionPublisher
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.application.usecases.HandleUserDeleted
import com.bliss.billing.domain.BillingSource
import com.bliss.billing.domain.Subscription
import com.bliss.billing.domain.SubscriptionStatus
import com.bliss.billing.domain.Tier
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class UserDeletedConsumerTest {
    private lateinit var natsContainer: GenericContainer<*>
    private lateinit var nats: Connection
    private val scope = CoroutineScope(SupervisorJob())

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
        // Create the stream that publishers (identity-api) own in production.
        nats.jetStreamManagement().addStream(
            StreamConfiguration
                .builder()
                .name(UserDeletedConsumer.STREAM_NAME)
                .subjects(UserDeletedConsumer.SUBJECT)
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

    @Test
    fun `cancels at the provider and erases the projection then acks exactly once`() =
        runBlocking {
            val durable = uniqueDurable()
            bootstrap(durable)
            val provider = RecordingProvider()
            val repository = InMemorySubscriptions()
            val userId = UUID.randomUUID()
            repository.save(subscription(userId, "sub_active"))
            val consumer = consumerFor(provider, repository, durable)
            consumer.start()

            publishDeleted(userId)
            awaitUntil { provider.cancelCalls.contains("sub_active") }
            delay(1000)
            consumer.stop()

            assertThat(provider.cancelCalls.toList()).isEqualTo(listOf("sub_active"))
            assertThat(repository.findByUserId(userId)).isNull()
        }

    @Test
    fun `a provider cancel failure is not acked so the event redelivers`() =
        runBlocking {
            val durable = uniqueDurable()
            bootstrap(durable)
            val provider = RecordingProvider(failRefs = mutableSetOf("sub_fail"))
            val repository = InMemorySubscriptions()
            val userId = UUID.randomUUID()
            repository.save(subscription(userId, "sub_fail"))
            val consumer = consumerFor(provider, repository, durable)
            consumer.start()

            publishDeleted(userId)
            // nak triggers immediate redelivery; observe more than the single first delivery.
            awaitUntil { provider.cancelCalls.size >= 2 }
            consumer.stop()

            val survivor = repository.findByUserId(userId)
            assertThat(survivor).isNotNull()
            assertThat(survivor!!.status).isEqualTo(SubscriptionStatus.PENDING_CANCELLATION)
            assertThat(survivor.externalRef).isEqualTo("sub_fail")
        }

    @Test
    fun `a user with no subscription is acked as a no-op`() =
        runBlocking {
            val durable = uniqueDurable()
            bootstrap(durable)
            val provider = RecordingProvider()
            val repository = InMemorySubscriptions()
            val consumer = consumerFor(provider, repository, durable)
            consumer.start()

            publishDeleted(UUID.randomUUID())
            delay(2000)
            consumer.stop()

            assertThat(provider.cancelCalls.toList()).isEqualTo(emptyList())
        }

    @Test
    fun `a permanently failing message is dead-lettered after max deliveries`() =
        runBlocking {
            val durable = uniqueDurable()
            bootstrap(durable)
            val provider = RecordingProvider(failRefs = mutableSetOf("sub_poison"))
            val repository = InMemorySubscriptions()
            val userId = UUID.randomUUID()
            repository.save(subscription(userId, "sub_poison"))
            val consumer = consumerFor(provider, repository, durable)
            consumer.start()

            val dlq = ConcurrentLinkedQueue<String>()
            val dlqDispatcher =
                nats.createDispatcher { msg -> dlq += String(msg.data, Charsets.UTF_8) }
            dlqDispatcher.subscribe("${MaxDeliveriesDlqRepublisher.DEFAULT_DLQ_SUBJECT_PREFIX}${UserDeletedConsumer.SUBJECT}")
            val republisher =
                MaxDeliveriesDlqRepublisher(
                    connection = nats,
                    jetStreamManagement = nats.jetStreamManagement(),
                    streamName = UserDeletedConsumer.STREAM_NAME,
                    consumerNames = listOf(durable),
                )
            republisher.start()

            publishDeleted(userId)
            awaitUntil(timeout = Duration.ofSeconds(15)) { dlq.isNotEmpty() }
            consumer.stop()
            republisher.close()
            nats.closeDispatcher(dlqDispatcher)

            assertThat(dlq.any { it.contains(userId.toString()) }).isEqualTo(true)
            assertThat(repository.findByUserId(userId)).isNotNull()
        }

    private fun consumerFor(
        provider: BillingProviderPort,
        repository: SubscriptionRepository,
        durable: String,
    ): UserDeletedConsumer {
        val useCase =
            HandleUserDeleted(
                provider = provider,
                repository = repository,
                publisher = RecordingPublisher(),
                clock = Clock { FIXED_NOW },
                eventIds = EventIdGenerator { UUID.randomUUID() },
            )
        return UserDeletedConsumer(
            nats = nats,
            handleUserDeleted = useCase,
            scope = scope,
            durableName = durable,
            pollWait = Duration.ofMillis(200),
        )
    }

    // Short ackWait makes a nak-driven redelivery observable within the test window.
    private fun bootstrap(durable: String) {
        nats.jetStreamManagement().addOrUpdateConsumer(
            UserDeletedConsumer.STREAM_NAME,
            io.nats.client.api.ConsumerConfiguration
                .builder()
                .durable(durable)
                .filterSubject(UserDeletedConsumer.SUBJECT)
                .ackPolicy(io.nats.client.api.AckPolicy.Explicit)
                .ackWait(Duration.ofSeconds(2))
                .maxDeliver(UserDeletedConsumerConfig.MAX_DELIVER)
                .deliverSubject("_DELIVER.$durable")
                .build(),
        )
    }

    private fun publishDeleted(userId: UUID) {
        val payload = """{"userId":"$userId","deletedAt":"${Instant.parse("2026-06-29T12:00:00Z")}"}"""
        nats.jetStream().publish(UserDeletedConsumer.SUBJECT, payload.toByteArray())
    }

    private suspend fun awaitUntil(
        timeout: Duration = Duration.ofSeconds(5),
        predicate: () -> Boolean,
    ) {
        val deadline = System.nanoTime() + timeout.toNanos()
        while (!predicate() && System.nanoTime() < deadline) {
            delay(50)
        }
    }

    private fun uniqueDurable(): String = "billing-api-test-${UUID.randomUUID().toString().take(8)}"

    private fun subscription(
        userId: UUID,
        externalRef: String,
    ): Subscription =
        Subscription(
            userId = userId,
            tier = Tier.of("supporter"),
            status = SubscriptionStatus.ACTIVE,
            source = BillingSource.MOLLIE,
            externalRef = externalRef,
            periodEnd = Instant.parse("2026-07-29T00:00:00Z"),
        )

    private class RecordingProvider(
        private val failRefs: MutableSet<String> = mutableSetOf(),
    ) : BillingProviderPort {
        val cancelCalls = ConcurrentLinkedQueue<String>()

        override suspend fun createCheckout(
            userId: UUID,
            tier: Tier,
        ): CheckoutUrls = error("unused")

        override suspend fun createSubscription(
            userId: UUID,
            firstPaymentRef: String,
            tier: Tier,
        ): ProviderSubscriptionState = error("unused")

        override suspend fun fetchByReference(externalRef: String): ProviderSubscriptionState? = null

        override suspend fun cancel(externalRef: String) {
            cancelCalls += externalRef
            if (externalRef in failRefs) throw RuntimeException("provider down")
        }
    }

    private class InMemorySubscriptions : SubscriptionRepository {
        private val byUser = ConcurrentHashMap<UUID, Subscription>()

        override suspend fun findByUserId(userId: UUID): Subscription? = byUser[userId]

        override suspend fun findByExternalRef(externalRef: String): Subscription? =
            byUser.values.firstOrNull { it.externalRef == externalRef }

        override suspend fun save(subscription: Subscription) {
            byUser[subscription.userId] = subscription
        }

        override suspend fun delete(userId: UUID) {
            byUser.remove(userId)
        }

        override suspend fun listActive(): List<Subscription> = byUser.values.toList()
    }

    private class RecordingPublisher : SubscriptionPublisher {
        val events = CopyOnWriteArrayList<SubscriptionChanged>()

        override suspend fun publish(event: SubscriptionChanged) {
            events += event
        }
    }

    private companion object {
        val FIXED_NOW: Instant = Instant.parse("2026-06-29T12:00:00Z")
    }
}
