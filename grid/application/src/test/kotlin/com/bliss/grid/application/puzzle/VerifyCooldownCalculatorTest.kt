package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isTrue
import io.kotest.property.Arb
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Instant

class VerifyCooldownCalculatorTest {
    private val t0 = Instant.parse("2026-06-30T00:00:00Z")

    @Test
    fun `never verified is allowed with no countdown`() {
        assertThat(VerifyCooldownCalculator.view(null, t0))
            .isEqualTo(VerifyCooldownCalculator.Result(allowed = true, secondsUntilNextVerify = 0))
    }

    @Test
    fun `10 minutes ago is not allowed with 1200s remaining`() {
        assertThat(VerifyCooldownCalculator.view(t0, t0.plusSeconds(600)))
            .isEqualTo(VerifyCooldownCalculator.Result(allowed = false, secondsUntilNextVerify = 1200))
    }

    @Test
    fun `exactly 30 minutes ago is allowed`() {
        assertThat(VerifyCooldownCalculator.view(t0, t0.plusSeconds(1800)))
            .isEqualTo(VerifyCooldownCalculator.Result(allowed = true, secondsUntilNextVerify = 0))
    }

    @Test
    fun `29 minutes 59 seconds ago is not yet allowed`() {
        assertThat(VerifyCooldownCalculator.view(t0, t0.plusSeconds(1799)))
            .isEqualTo(VerifyCooldownCalculator.Result(allowed = false, secondsUntilNextVerify = 1))
    }

    @Test
    fun `backward clock skew clamps to a full cooldown, never negative`() {
        assertThat(VerifyCooldownCalculator.view(t0, t0.minusSeconds(60)))
            .isEqualTo(VerifyCooldownCalculator.Result(allowed = false, secondsUntilNextVerify = 1800))
    }

    @Test
    fun `secondsUntilNextVerify always stays within 0 to 1800`() =
        runTest {
            checkAll(Arb.long(-100_000L..100_000L)) { offsetSeconds ->
                val result = VerifyCooldownCalculator.view(t0, t0.plusSeconds(offsetSeconds))
                assertThat(
                    result.secondsUntilNextVerify in 0..VerifyCooldownCalculator.COOLDOWN_SECONDS,
                ).isTrue()
            }
        }
}
