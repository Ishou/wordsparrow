package com.bliss.billing.worker

import com.bliss.billing.application.ports.BillingProviderPort
import com.bliss.billing.application.ports.Clock
import com.bliss.billing.application.ports.SubscriptionRepository
import com.bliss.billing.application.usecases.ReconcileSubscriptions
import com.bliss.billing.infrastructure.persistence.BillingDatabase
import com.bliss.billing.infrastructure.persistence.PostgresMollieCustomerStore
import com.bliss.billing.infrastructure.persistence.PostgresSubscriptionRepository
import com.bliss.billing.infrastructure.provider.MollieBillingAdapter
import com.bliss.billing.infrastructure.provider.MollieConfig
import com.bliss.billing.infrastructure.provider.SdkMollieClient
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.system.exitProcess

private val log = LoggerFactory.getLogger("com.bliss.billing.worker.Main")

fun main(args: Array<String>) {
    MDC.put("run_id", UUID.randomUUID().toString())
    val exit =
        when {
            args.contains("--help") || args.contains("-h") -> {
                printUsage()
                0
            }
            args.isEmpty() || args.contains("--reconcile") -> runReconcile()
            else -> {
                log.error("event=worker_unknown_arguments args=\"{}\"", args.joinToString(separator = " "))
                printUsage()
                1
            }
        }
    exitProcess(exit)
}

private fun printUsage() {
    log.info("usage: billing-worker [--reconcile] | --help")
}

private fun runReconcile(): Int {
    val database = BillingDatabase(poolName = "billing-worker", maxPoolSize = 2, requireUrl = true).apply { start() }
    return try {
        val dataSource = database.dataSource() ?: error("BILLING_DATABASE_URL produced a null DataSource")
        val config = MollieConfig.fromEnv()
        val provider = MollieBillingAdapter(SdkMollieClient(config), PostgresMollieCustomerStore(dataSource), config)
        reconcileAndExit(provider, PostgresSubscriptionRepository(dataSource), Clock { Instant.now() }, agingThreshold())
    } finally {
        database.stop()
    }
}

private fun agingThreshold(): Duration = Duration.ofHours(System.getenv("BILLING_RECONCILE_AGING_HOURS")?.toLongOrNull() ?: 24L)

internal fun reconcileAndExit(
    provider: BillingProviderPort,
    repository: SubscriptionRepository,
    clock: Clock,
    agingThreshold: Duration,
): Int =
    runBlocking {
        val summary = ReconcileSubscriptions(provider, repository, clock, agingThreshold).execute()
        log.info(
            "event=billing_reconcile_done provider_active={} orphans_cancelled={} aging_pending_cancellations={}",
            summary.providerActiveCount,
            summary.orphansCancelled,
            summary.agingPendingCancellations,
        )
        0
    }
