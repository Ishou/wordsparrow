package com.bliss.grid.api

import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.domain.model.LetterCell
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import kotlin.random.Random

/** Regression gate: the generator must never produce a grid whose white cells are split into a disconnected pocket (a closed block). */
@Tag("bench")
class GridConnectivityReproTest {
    @Test
    fun `no generated grid has a closed block over many seeds`() {
        val repo = CsvWordRepository.frenchFromClasspath()
        val generator = GridGenerator(repo)
        val constraints = defaultPuzzleConstraints()

        val total = 400
        var generated = 0
        var closedBlockGrids = 0
        val examples = mutableListOf<Pair<Long, List<Int>>>()
        for (seed in 0L until total.toLong()) {
            val grid = generator.generate(constraints, Random(seed)) ?: continue
            generated++
            val letters =
                grid.cells.entries
                    .filter { it.value is LetterCell }
                    .map { it.key.row.value to it.key.column.value }
                    .toSet()
            val comps = components(letters)
            if (comps.size > 1) {
                closedBlockGrids++
                if (examples.size < 12) examples.add(seed to comps.map { it.size }.sortedDescending())
            }
        }
        assertEquals(
            0,
            closedBlockGrids,
            "generator produced $closedBlockGrids/$generated grids with a closed block; examples (seed -> component sizes): $examples",
        )
    }

    private fun components(letters: Set<Pair<Int, Int>>): List<Set<Pair<Int, Int>>> {
        val seen = HashSet<Pair<Int, Int>>()
        val comps = mutableListOf<Set<Pair<Int, Int>>>()
        for (cell in letters) {
            if (cell in seen) continue
            val comp = HashSet<Pair<Int, Int>>()
            val stack = ArrayDeque<Pair<Int, Int>>()
            stack.addLast(cell)
            while (stack.isNotEmpty()) {
                val x = stack.removeLast()
                if (x in seen) continue
                seen.add(x)
                comp.add(x)
                val (r, c) = x
                for (nb in listOf(r - 1 to c, r + 1 to c, r to c - 1, r to c + 1)) {
                    if (nb in letters && nb !in seen) stack.addLast(nb)
                }
            }
            comps.add(comp)
        }
        return comps
    }
}
