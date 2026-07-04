package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.CancellationConfirmation
import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.PreRenewalNotice
import com.bliss.billing.application.ports.RenewalReceipt

/** Records notifier calls; [failOnce] throws once to prove send failures never break webhook handling; [chatelSendSucceeds] simulates an unresolvable price/email. */
class RecordingContractConfirmationNotifier : ContractConfirmationNotifier {
    val contractConfirmations = mutableListOf<ContractConfirmation>()
    val renewalReceipts = mutableListOf<RenewalReceipt>()
    val cancellationConfirmations = mutableListOf<CancellationConfirmation>()
    val preRenewalNotices = mutableListOf<PreRenewalNotice>()
    var failOnce = false
    var chatelSendSucceeds = true

    override suspend fun confirmContractFormation(confirmation: ContractConfirmation) {
        maybeFail()
        contractConfirmations += confirmation
    }

    override suspend fun confirmRenewal(receipt: RenewalReceipt) {
        maybeFail()
        renewalReceipts += receipt
    }

    override suspend fun confirmCancellation(confirmation: CancellationConfirmation) {
        maybeFail()
        cancellationConfirmations += confirmation
    }

    override suspend fun sendChatelPreRenewalNotice(notice: PreRenewalNotice): Boolean {
        maybeFail()
        if (!chatelSendSucceeds) return false
        preRenewalNotices += notice
        return true
    }

    private fun maybeFail() {
        if (failOnce) {
            failOnce = false
            throw IllegalStateException("notifier failed (simulated)")
        }
    }
}
