package com.bliss.billing.application.usecases

import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.PreRenewalNotice
import com.bliss.billing.application.ports.RenewalReceipt
import org.slf4j.LoggerFactory

/** Dark-mode notifier (ADR-0092): logs the would-send and does nothing, used until BILLING_EMAIL_ENABLED flips bright. */
class NoOpContractConfirmationNotifier : ContractConfirmationNotifier {
    private val log = LoggerFactory.getLogger(NoOpContractConfirmationNotifier::class.java)

    override suspend fun confirmContractFormation(confirmation: ContractConfirmation) {
        log.info("billing_email_disabled kind=contract_confirmation user_id={}", confirmation.userId)
    }

    override suspend fun confirmRenewal(receipt: RenewalReceipt) {
        log.info("billing_email_disabled kind=renewal_receipt user_id={}", receipt.userId)
    }

    override suspend fun confirmCancellation(confirmation: CancellationConfirmation) {
        log.info("billing_email_disabled kind=cancellation_confirmation user_id={}", confirmation.userId)
    }

    override suspend fun sendChatelPreRenewalNotice(notice: PreRenewalNotice): Boolean {
        log.info("billing_email_disabled kind=chatel_pre_renewal user_id={} period_end={}", notice.userId, notice.periodEnd)
        return false
    }
}
