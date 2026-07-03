package com.bliss.identity.application.testdoubles

import com.bliss.identity.application.ports.RandomFactory
import com.bliss.identity.domain.auth.ChallengeSecret
import com.bliss.identity.domain.auth.OtpCode
import com.bliss.identity.domain.auth.PkceVerifier
import com.bliss.identity.domain.auth.State

/** Returns values in the configured sequence; throws when a sequence is exhausted. */
class FixedRandomFactory(
    states: List<State> = emptyList(),
    pkceVerifiers: List<PkceVerifier> = emptyList(),
    otpCodes: List<OtpCode> = emptyList(),
    challengeSecrets: List<ChallengeSecret> = emptyList(),
) : RandomFactory {
    private val stateQueue = ArrayDeque(states)
    private val pkceQueue = ArrayDeque(pkceVerifiers)
    private val otpQueue = ArrayDeque(otpCodes)
    private val secretQueue = ArrayDeque(challengeSecrets)

    override fun newState(): State = stateQueue.removeFirstOrNull() ?: error("FixedRandomFactory exhausted for State.")

    override fun newPkceVerifier(): PkceVerifier = pkceQueue.removeFirstOrNull() ?: error("FixedRandomFactory exhausted for PkceVerifier.")

    override fun newOtpCode(): OtpCode = otpQueue.removeFirstOrNull() ?: error("FixedRandomFactory exhausted for OtpCode.")

    override fun newChallengeSecret(): ChallengeSecret =
        secretQueue.removeFirstOrNull() ?: error("FixedRandomFactory exhausted for ChallengeSecret.")
}
