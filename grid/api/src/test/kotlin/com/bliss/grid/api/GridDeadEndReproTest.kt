package com.bliss.grid.api

import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.domain.validation.GridValidator
import com.bliss.grid.domain.validation.GridViolation
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import kotlin.random.Random

/** Regression gate: no generated word shorter than GridValidator.DEAD_END_MIN_LEN may end in a dead end (ADR-0039 amendment). */
@Tag("bench")
class GridDeadEndReproTest {
    @Test
    fun `no generated grid has a short dead-end word over many seeds`() {
        val repo = CsvWordRepository.frenchFromClasspath()
        val generator = GridGenerator(repo)
        val constraints = defaultPuzzleConstraints()
        val validator = GridValidator()

        val total = 150
        var generated = 0
        var offendingGrids = 0
        val examples = mutableListOf<Pair<Long, List<GridViolation.ShortDeadEnd>>>()
        for (seed in 0L until total.toLong()) {
            val grid = generator.generate(constraints, Random(seed)) ?: continue
            generated++
            val deadEnds = validator.validate(grid).filterIsInstance<GridViolation.ShortDeadEnd>()
            if (deadEnds.isNotEmpty()) {
                offendingGrids++
                if (examples.size < 12) examples.add(seed to deadEnds)
            }
        }
        assertEquals(
            0,
            offendingGrids,
            "generator produced $offendingGrids/$generated grids with short dead-end words; examples: $examples",
        )
    }
}
