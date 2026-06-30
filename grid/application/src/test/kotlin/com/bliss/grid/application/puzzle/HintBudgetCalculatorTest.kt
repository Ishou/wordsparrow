package com.bliss.grid.application.puzzle

import assertk.assertThat
import assertk.assertions.isEqualTo
import io.kotest.property.Arb
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.long
import io.kotest.property.checkAll
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

class HintBudgetCalculatorTest {
    private val t0 = Instant.parse("2026-06-30T00:00:00Z")
    private val ten = Duration.ofMinutes(10)

    @Test
    fun `never spent reads full with no countdown`() {
        assertThat(HintBudgetCalculator.view(HintBudgetCalculator.State(3, null), t0, 3, ten))
            .isEqualTo(HintBudgetCalculator.View(3, null))
    }

    @Test
    fun `spend from full drops to 2 and anchors at now`() {
        assertThat(HintBudgetCalculator.spend(HintBudgetCalculator.State(3, null), t0, 3, ten))
            .isEqualTo(HintBudgetCalculator.State(2, t0))
        assertThat(HintBudgetCalculator.view(HintBudgetCalculator.State(2, t0), t0, 3, ten))
            .isEqualTo(HintBudgetCalculator.View(2, 600))
    }

    @Test
    fun `partial spend keeps in-flight regen progress`() {
        // Spending at +3min must not reset the +10min countdown to +13min.
        assertThat(HintBudgetCalculator.spend(HintBudgetCalculator.State(2, t0), t0.plusSeconds(180), 3, ten))
            .isEqualTo(HintBudgetCalculator.State(1, t0))
        assertThat(HintBudgetCalculator.view(HintBudgetCalculator.State(1, t0), t0.plusSeconds(180), 3, ten))
            .isEqualTo(HintBudgetCalculator.View(1, 420))
    }

    @Test
    fun `regen counts whole intervals only and preserves the remainder`() {
        assertThat(HintBudgetCalculator.view(HintBudgetCalculator.State(0, t0), t0.plusSeconds(1500), 3, ten))
            .isEqualTo(HintBudgetCalculator.View(2, 300))
    }

    @Test
    fun `regen to cap clamps and clears the countdown`() {
        assertThat(HintBudgetCalculator.view(HintBudgetCalculator.State(0, t0), t0.plusSeconds(99999), 3, ten))
            .isEqualTo(HintBudgetCalculator.View(3, null))
    }

    @Test
    fun `spend when empty with no regen yet returns null`() {
        assertThat(HintBudgetCalculator.spend(HintBudgetCalculator.State(0, t0), t0.plusSeconds(60), 3, ten))
            .isEqualTo(null)
    }

    @Test
    fun `spend after one regenerated token advances the anchor by one interval`() {
        assertThat(HintBudgetCalculator.spend(HintBudgetCalculator.State(0, t0), t0.plusSeconds(650), 3, ten))
            .isEqualTo(HintBudgetCalculator.State(0, t0.plusSeconds(600)))
    }

    @Test
    fun `backward clock skew never regenerates negative tokens`() {
        assertThat(HintBudgetCalculator.view(HintBudgetCalculator.State(1, t0), t0.minusSeconds(60), 3, ten))
            .isEqualTo(HintBudgetCalculator.View(1, 600))
    }

    @Test
    fun `tokensRemaining always stays within 0 to capacity`() =
        runTest {
            checkAll(Arb.int(0..3), Arb.long(-100_000L..100_000L)) { tokens, offsetSeconds ->
                val view =
                    HintBudgetCalculator.view(
                        HintBudgetCalculator.State(tokens, t0),
                        t0.plusSeconds(offsetSeconds),
                        3,
                        ten,
                    )
                assertThat(view.tokensRemaining in 0..3).isEqualTo(true)
            }
        }
}
