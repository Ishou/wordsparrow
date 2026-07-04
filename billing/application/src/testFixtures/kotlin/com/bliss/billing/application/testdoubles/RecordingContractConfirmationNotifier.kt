package com.bliss.billing.application.testdoubles

import com.bliss.billing.application.ports.ContractConfirmation
import com.bliss.billing.application.ports.ContractConfirmationNotifier
import com.bliss.billing.application.ports.RenewalReceipt

/** Records notifier calls; [failOnce] throws once to prove send failures never break webhook handling. */
class RecordingContractConfirmationNotifier : ContractConfirmationNotifier {
    val contractConfirmations = mutableListOf<ContractConfirmation>()
    val renewalReceipts = mutableListOf<RenewalReceipt>()
    var failOnce = false

    override suspend fun confirmContractFormation(confirmation: ContractConfirmation) {
        maybeFail()
        contractConfirmations += confirmation
    }

    override suspend fun confirmRenewal(receipt: RenewalReceipt) {
        maybeFail()
        renewalReceipts += receipt
    }

    private fun maybeFail() {
        if (failOnce) {
            failOnce = false
            throw IllegalStateException("notifier failed (simulated)")
        }
    }
}
