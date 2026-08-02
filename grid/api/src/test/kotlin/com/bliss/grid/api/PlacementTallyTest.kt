package com.bliss.grid.api

import com.bliss.grid.application.puzzle.dailyPuzzleConstraints
import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.generation.GridConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.bufferedWriter
import kotlin.random.Random

/** Counts placements per word so a candidate list can be ranked by solver demand, not corpus frequency. */
@Tag("bench")
class PlacementTallyTest {
    private val log = LoggerFactory.getLogger(PlacementTallyTest::class.java)

    @Test
    fun `tally placed answers per size`() {
        val label = System.getenv("TALLY_LABEL") ?: "tally"
        val repo = CsvWordRepository.frenchCorpus()
        val generator = GridGenerator(repo)

        val sizes =
            listOf(
                Triple("daily", dailyPuzzleConstraints(), System.getenv("TALLY_N_DAILY")?.toIntOrNull() ?: 300),
                Triple("default", defaultPuzzleConstraints(), System.getenv("TALLY_N_DEFAULT")?.toIntOrNull() ?: 100),
            )
        for ((size, constraints, n) in sizes) {
            tally(generator, label, size, constraints, n)
        }
    }

    private fun tally(
        generator: GridGenerator,
        label: String,
        size: String,
        constraints: GridConstraints,
        n: Int,
    ) {
        val counts = HashMap<String, Int>()
        var placed = 0
        var succeeded = 0
        val start = System.currentTimeMillis()
        for (i in 0 until n) {
            val grid = generator.generate(constraints, Random(i.toLong() * 7919)) ?: continue
            succeeded++
            grid.placements.forEach {
                val text = it.word.text
                counts[text] = (counts[text] ?: 0) + 1
                placed++
            }
        }
        val outDir = Path.of("data/eval")
        Files.createDirectories(outDir)
        val outFile = outDir.resolve("tally_${label}_$size.csv")
        outFile.bufferedWriter().use { w ->
            w.write("word,placements\n")
            counts.entries.sortedByDescending { it.value }.forEach { w.write("${it.key},${it.value}\n") }
        }
        log.info(
            "tally_done label={} size={} grids={} succeeded={} placements={} distinct={} elapsed_ms={} path={}",
            label,
            size,
            n,
            succeeded,
            placed,
            counts.size,
            System.currentTimeMillis() - start,
            outFile,
        )
    }
}
