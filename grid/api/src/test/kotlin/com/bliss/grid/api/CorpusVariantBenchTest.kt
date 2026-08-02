package com.bliss.grid.api

import com.bliss.grid.application.puzzle.dailyPuzzleConstraints
import com.bliss.grid.application.puzzle.defaultPuzzleConstraints
import com.bliss.grid.domain.generation.GenerationMetrics
import com.bliss.grid.domain.generation.GridConstraints
import com.bliss.grid.domain.generation.GridGenerator
import com.bliss.grid.domain.generation.GridShapeHash
import com.bliss.grid.infrastructure.persistence.CsvWordRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.bufferedWriter
import kotlin.random.Random

private const val WARMUP_N = 5

/**
 * A/B grid-generation bench against whatever corpus `$CORPUS_DIR` points at,
 * so two corpus variants can be compared on identical seeds. `$BENCH_LABEL`
 * names the output CSVs; feed the pairs to [BenchDiff].
 *
 * Usage: `CORPUS_DIR=/path/to/corpus BENCH_LABEL=variant \
 *         ./gradlew :grid:api:benchTest --tests '*CorpusVariantBenchTest*'`
 */
@Tag("bench")
class CorpusVariantBenchTest {
    private val log = LoggerFactory.getLogger(CorpusVariantBenchTest::class.java)

    @Test
    fun `per-size metrics on the corpus under CORPUS_DIR`() {
        val label = System.getenv("BENCH_LABEL") ?: "corpus"
        val n = System.getenv("BENCH_N")?.toIntOrNull() ?: 100
        val repo = CsvWordRepository.frenchCorpus()
        val generator = GridGenerator(repo)

        for ((size, constraints) in sizes()) {
            run(generator, label, size, constraints, n)
        }
    }

    private fun sizes(): List<Pair<String, GridConstraints>> =
        listOf(
            "daily" to dailyPuzzleConstraints(),
            "default" to defaultPuzzleConstraints(),
        )

    private fun run(
        generator: GridGenerator,
        label: String,
        size: String,
        constraints: GridConstraints,
        n: Int,
    ) {
        repeat(WARMUP_N) { generator.generate(constraints, Random(it.toLong())) }

        val rows = ArrayList<String>(n)
        var successCount = 0
        val loopStart = System.currentTimeMillis()
        for (i in 0 until n) {
            val m = GenerationMetrics()
            val seed = i.toLong() * 1000
            val grid = generator.generate(constraints, Random(seed), metrics = m)
            if (m.succeeded) successCount++
            val total = m.skeletonMs + m.slotPlanMs + m.fillMs
            val shapeHash = if (grid != null) GridShapeHash.of(grid) else "FAIL"
            rows +=
                "$seed,$total,${m.skeletonMs},${m.slotPlanMs},${m.slotPlanBacktracks}," +
                "${m.fillMs},${m.fillBacktracks},${m.fillRepoCalls}," +
                "${m.fillFirstSlotDomainSize},$shapeHash,${m.succeeded}"
        }

        val outDir = Path.of("data/eval")
        Files.createDirectories(outDir)
        val outFile = outDir.resolve("bench_${label}_$size.csv")
        outFile.bufferedWriter().use { w ->
            w.write(
                "seed,total_ms,skeleton_ms,slot_plan_ms,slot_plan_backtracks," +
                    "fill_ms,fill_backtracks,fill_repo_calls,fill_first_slot_domain,shape_hash,succeeded\n",
            )
            rows.forEach { w.write("$it\n") }
        }
        log.info(
            "bench_variant_done label={} size={} width={} height={} n={} success={} elapsed_ms={} path={}",
            label,
            size,
            constraints.width,
            constraints.height,
            n,
            successCount,
            System.currentTimeMillis() - loopStart,
            outFile,
        )
    }
}
