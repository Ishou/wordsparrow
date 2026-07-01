package com.bliss.grid.domain.generation

import com.bliss.grid.domain.validation.GridValidator
import io.kotest.common.ExperimentalKotest
import io.kotest.property.Arb
import io.kotest.property.PropTestConfig
import io.kotest.property.arbitrary.int
import io.kotest.property.checkAll
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test

@OptIn(ExperimentalKotest::class)
class GridGeneratorPropertyTest {
    private val generator = GridGenerator(ListWordRepository(SMALL_FRENCH_WORDS))

    @Test
    fun `every generated grid has no orphan cell - each letter is in at least one word`() {
        runBlocking {
            checkAll(
                PropTestConfig(iterations = 20),
                Arb.int(4..6),
                Arb.int(4..6),
            ) { width, height ->
                val grid = generator.generate(GridConstraints(width, height))
                if (grid != null) {
                    val orphans = GridValidator.uncrossedCells(grid)
                    check(orphans.isEmpty()) {
                        "orphan (unfillable) cells $orphans for ${width}x$height"
                    }
                }
            }
        }
    }
}
