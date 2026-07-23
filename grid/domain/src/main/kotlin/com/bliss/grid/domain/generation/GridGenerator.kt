package com.bliss.grid.domain.generation

import com.bliss.grid.domain.model.Column
import com.bliss.grid.domain.model.Grid
import com.bliss.grid.domain.model.LetterCell
import com.bliss.grid.domain.model.Position
import com.bliss.grid.domain.model.Row
import kotlin.math.min
import kotlin.random.Random

private const val FILL_LAYOUT_MAX_ATTEMPTS = 80
private const val DISTILL_FILL_CHECK_MS = 2_000L

// Backoff is expensive, so retry the fill (cheap) not the template: a few fresh templates cover a cooled-out fill.
private const val DEFAULT_DISTILL_TEMPLATE_ATTEMPTS = 3

/**
 * Default per-attempt deadline. The outer retry loop in
 * `GeneratePuzzleUseCase` retries on failure with a fresh seed, so a tight
 * per-attempt budget paired with retries is usually faster than one long
 * attempt — the pathological 5s-tail puzzles abandon quickly and the next
 * seed often succeeds in <100ms.
 */
const val DEFAULT_GENERATION_TIMEOUT_MS = 5_000L

private const val NS_PER_MS: Long = 1_000_000L

/** Result of [GridGenerator.generateDistilled]: the served grid and whether ADR-0117's cooldown fallback fired. */
data class DistilledResult(
    val grid: Grid,
    val usedCooldownFallback: Boolean,
)

/**
 * Bitmask-CSP grid generator (Phase 1: sequential).
 *
 * Pipeline:
 *  1. Build a [Lexicon] once (cached for lifetime of this instance).
 *  2. Compute `L_useful` (longest length with adequate corpus).
 *  3. [BlackCellLayout.seed] a fresh black-cell substrate.
 *  4. Luby-scheduled restart loop:
 *     - Build [SlotRegistry] from the current layout.
 *     - Initial AC-3 over all slots.
 *     - [BitmaskCsp.search] with backtrack budget `BASE × luby(attempt)`.
 *     - On `OK` → build `Grid.fromPlacements`.
 *     - On failure → targeted perturbation at hot-slot midpoints,
 *       full re-seed every [GenerationKnobs.CONSEC_RESEED] failures.
 */
class GridGenerator(
    private val repository: WordRepository,
    private val clock: Clock = SystemClock,
) {
    // Lexicon construction can be expensive on a large French corpus; build
    // it lazily on the first `generate` call and reuse for subsequent calls.
    @Volatile private var cachedLexicon: Lexicon? = null

    // Corpus-backed multi-lemma dedup seam (ADR-0100); Inert for repositories that don't carry it.
    private val surfaceLemmas: SurfaceLemmas by lazy { repository.surfaceLemmas() }

    private fun lexicon(): Lexicon =
        cachedLexicon
            ?: synchronized(this) {
                cachedLexicon ?: Lexicon(repository).also { cachedLexicon = it }
            }

    fun generate(
        constraints: GridConstraints,
        random: Random = Random.Default,
        metrics: GenerationMetrics? = null,
        timeoutMs: Long = DEFAULT_GENERATION_TIMEOUT_MS,
        cooldownPolicy: ClueCooldownPolicy = ClueCooldownPolicy.Inert,
    ): Grid? {
        val w = constraints.width
        val h = constraints.height
        if (w < 2 || h < 2) return null
        val deadlineNs = clock.nanoTime() + timeoutMs * NS_PER_MS

        val lex = lexicon()
        val lUseful = lex.usefulLength
        if (lUseful < constraints.minWordLength) return null

        val bias = clampedBias(constraints.longWordBias)
        val biasedLTarget = lTargetFor(bias, lUseful, constraints.minWordLength)
        val lTarget = min(maxOf(GenerationKnobs.DEFAULT_L_TARGET, biasedLTarget), lUseful)
        val lTargetH = (constraints.lTargetHorizontal ?: lTarget).coerceIn(constraints.minWordLength, lUseful)
        val lTargetV = (constraints.lTargetVertical ?: lTarget).coerceIn(constraints.minWordLength, lUseful)
        val lMinGood = lMinGood(bias, lUseful, constraints.minWordLength)
        val effectiveBlackRatio = GenerationKnobs.DEFAULT_BLACK_RATIO * densityFactor(bias)
        val whitenP = whitenProbability(bias)

        val perAttemptSec = perAttemptSeconds(w * h)
        val perAttemptNs = (perAttemptSec * 1e9).toLong()

        val layoutStart = clock.nanoTime()
        var cells =
            BlackCellLayout.seed(
                width = w,
                height = h,
                minLen = constraints.minWordLength,
                lTarget = lTarget,
                lUseful = lUseful,
                blackRatio = effectiveBlackRatio,
                random = random,
                lMinGood = lMinGood,
                lengthTwoPenalty = constraints.lengthTwoPenalty,
                lTargetHorizontal = lTargetH,
                lTargetVertical = lTargetV,
            )
        if (constraints.anchorCount > 0) {
            LayoutAnchorer.carve(cells, constraints.minWordLength, lUseful, lex, constraints.anchorCount, constraints.anchorLength)
        }
        metrics?.skeletonMs = (clock.nanoTime() - layoutStart) / NS_PER_MS

        val searchStart = clock.nanoTime()
        var consecFails = 0
        var attempts = 0
        var perturbations = 0

        while (attempts < GenerationKnobs.MAX_RESTARTS && clock.nanoTime() < deadlineNs) {
            attempts++
            val build = SlotRegistry.build(cells, lex, constraints.minWordLength)
            if (build == null) {
                consecFails++
                cells =
                    reseedOrPerturb(
                        cells,
                        w,
                        h,
                        constraints.minWordLength,
                        lTarget,
                        lUseful,
                        lTargetH = lTargetH,
                        lTargetV = lTargetV,
                        hotCells = emptyList(),
                        consecFails = consecFails,
                        random = random,
                        blackRatio = effectiveBlackRatio,
                        lMinGood = lMinGood,
                        whitenP = whitenP,
                        lengthTwoPenalty = constraints.lengthTwoPenalty,
                        lex = lex,
                        anchorCount = constraints.anchorCount,
                        anchorLength = constraints.anchorLength,
                    )
                perturbations++
                continue
            }
            val acceptor = WordAcceptor(constraints.themeLimits, cooldownPolicy, surfaceLemmas)
            val csp = BitmaskCsp(build.slots, lex, acceptor, clock, random)
            if (!csp.initialArcConsistency()) {
                consecFails++
                cells =
                    reseedOrPerturb(
                        cells,
                        w,
                        h,
                        constraints.minWordLength,
                        lTarget,
                        lUseful,
                        lTargetH = lTargetH,
                        lTargetV = lTargetV,
                        hotCells = emptyList(),
                        consecFails = consecFails,
                        random = random,
                        blackRatio = effectiveBlackRatio,
                        lMinGood = lMinGood,
                        whitenP = whitenP,
                        lengthTwoPenalty = constraints.lengthTwoPenalty,
                        lex = lex,
                        anchorCount = constraints.anchorCount,
                        anchorLength = constraints.anchorLength,
                    )
                perturbations++
                continue
            }
            if (metrics?.fillFirstSlotDomainSize == -1) {
                val firstSid = csp.selectSlot()
                if (firstSid >= 0) {
                    metrics.fillFirstSlotDomainSize = lex.popcount(build.slots[firstSid].domain)
                }
            }
            val budget = GenerationKnobs.BASE_BUDGET_BACKTRACKS * luby(attempts)
            val attemptDeadline = min(deadlineNs, clock.nanoTime() + perAttemptNs)
            val result = csp.search(attemptDeadline, budget) { clock.nanoTime() > deadlineNs }
            metrics?.let { it.fillBacktracks = it.fillBacktracks + csp.backtracks }
            if (result == BitmaskCsp.Result.OK) {
                metrics?.fillMs = (clock.nanoTime() - searchStart) / NS_PER_MS
                metrics?.slotPlanMs = 0
                metrics?.slotPlanBacktracks = perturbations
                val placements = SlotRegistry.toPlacements(build.slots)
                if (placements.any { it.word.text.length < constraints.minWordLength }) return null
                return try {
                    val grid = Grid.fromPlacements(w, h, placements)
                    metrics?.succeeded = true
                    metrics?.attempts = attempts
                    grid
                } catch (_: IllegalArgumentException) {
                    null
                }
            }
            // Restart: perturb the layout toward easier topology.
            val hot = csp.hotSlotMiddleCells(GenerationKnobs.HOT_SLOTS_FOR_PERTURB)
            consecFails++
            cells =
                reseedOrPerturb(
                    cells,
                    w,
                    h,
                    constraints.minWordLength,
                    lTarget,
                    lUseful,
                    lTargetH = lTargetH,
                    lTargetV = lTargetV,
                    hotCells = hot,
                    consecFails = consecFails,
                    random = random,
                    blackRatio = effectiveBlackRatio,
                    lMinGood = lMinGood,
                    whitenP = whitenP,
                    lengthTwoPenalty = constraints.lengthTwoPenalty,
                    lex = lex,
                    anchorCount = constraints.anchorCount,
                    anchorLength = constraints.anchorLength,
                )
            perturbations++
        }
        metrics?.fillMs = (clock.nanoTime() - searchStart) / NS_PER_MS
        metrics?.slotPlanBacktracks = perturbations
        metrics?.attempts = attempts
        return null
    }

    /** Daily template path (ADR-0117): dense grid, backoff-distilled, then best-of-N fill. See ADR for rationale. */
    fun generateDistilled(
        constraints: GridConstraints,
        random: Random = Random.Default,
        timeoutMs: Long = DEFAULT_GENERATION_TIMEOUT_MS,
        bestOfN: Int = 1,
        distillFillCheckMs: Long = DISTILL_FILL_CHECK_MS,
        cooldownPolicy: ClueCooldownPolicy = ClueCooldownPolicy.Inert,
        templateAttempts: Int = DEFAULT_DISTILL_TEMPLATE_ATTEMPTS,
    ): DistilledResult? {
        val minLen = constraints.minWordLength
        var fallbackFill: Grid? = null
        val served =
            firstFillableTemplate(random, templateAttempts) { attemptRandom ->
                val (template, inertFill) =
                    distillTemplate(constraints, attemptRandom, timeoutMs, distillFillCheckMs)
                        ?: return@firstFillableTemplate null
                fallbackFill = inertFill
                fillLayout(
                    template,
                    minLen,
                    Random(attemptRandom.nextLong()),
                    timeoutMs = timeoutMs,
                    bestOfN = bestOfN,
                    themeLimits = constraints.themeLimits,
                    cooldownPolicy = cooldownPolicy,
                )
            }
        // Cooldown fallback (ADR-0117): if no template fills under the clue cooldown, serve the Inert fill captured during backoff -- a possible repeat beats a missing daily.
        val grid = served ?: fallbackFill
        return grid?.let { DistilledResult(it, usedCooldownFallback = served == null) }
    }

    /** Return the first of [attempts] freshly-seeded templates that fills, so a cooled-out fill retries the fill -- never the expensive backoff. */
    internal fun firstFillableTemplate(
        random: Random,
        attempts: Int,
        produce: (Random) -> Grid?,
    ): Grid? {
        repeat(attempts) {
            val grid = produce(Random(random.nextLong()))
            if (grid != null) return grid
        }
        return null
    }

    // One distilled template plus a proven Inert fill of it: dense start + backoff probes run Inert (a structural "can this SHAPE fill?" question). The over-thinned template is only marginally fillable, so the fill captured by the last accepted probe -- not a fresh fill -- is the reliable fallback.
    private fun distillTemplate(
        constraints: GridConstraints,
        random: Random,
        timeoutMs: Long,
        distillFillCheckMs: Long,
    ): Pair<CellArray, Grid>? {
        val minLen = constraints.minWordLength
        val dense = generate(constraints, random, timeoutMs = timeoutMs, cooldownPolicy = ClueCooldownPolicy.Inert) ?: return null
        val start = reconstructLayout(dense, constraints.width, constraints.height)
        var lastFill: Grid? = null
        val template =
            BackoffDistiller.distill(start, minLen, lexicon()) { candidate ->
                val filled =
                    fillLayout(
                        candidate,
                        minLen,
                        Random(random.nextLong()),
                        timeoutMs = distillFillCheckMs,
                        themeLimits = constraints.themeLimits,
                        cooldownPolicy = ClueCooldownPolicy.Inert,
                    )
                if (filled != null) lastFill = filled
                filled != null
            }
        // lastFill is the fill of the final template (the last accepted whitening's own probe); fill the un-thinned start if nothing whitened.
        val fill =
            lastFill
                ?: fillLayout(
                    template,
                    minLen,
                    Random(random.nextLong()),
                    timeoutMs = timeoutMs,
                    themeLimits = constraints.themeLimits,
                    cooldownPolicy = ClueCooldownPolicy.Inert,
                )
        return fill?.let { template to it }
    }

    /** Fill a fixed black-cell layout (no perturbation), keeping the highest-coverage of up to [bestOfN] fills. */
    internal fun fillLayout(
        cells: CellArray,
        minLen: Int,
        random: Random = Random.Default,
        timeoutMs: Long = DEFAULT_GENERATION_TIMEOUT_MS,
        bestOfN: Int = 1,
        themeLimits: Map<String, Int> = DEFAULT_THEME_LIMITS,
        cooldownPolicy: ClueCooldownPolicy = ClueCooldownPolicy.Inert,
    ): Grid? {
        val lex = lexicon()
        val w = cells.width
        val h = cells.height
        val deadlineNs = clock.nanoTime() + timeoutMs * NS_PER_MS
        var best: Grid? = null
        var bestCov = -1L
        var successes = 0
        var attempt = 0
        while (successes < bestOfN && attempt < FILL_LAYOUT_MAX_ATTEMPTS && clock.nanoTime() < deadlineNs) {
            attempt++
            val build = SlotRegistry.build(cells, lex, minLen) ?: return null
            val csp =
                BitmaskCsp(build.slots, lex, WordAcceptor(themeLimits, cooldownPolicy, surfaceLemmas), clock, Random(random.nextLong()))
            if (!csp.initialArcConsistency()) continue
            val budget = GenerationKnobs.BASE_BUDGET_BACKTRACKS * luby(attempt)
            val attemptDeadline = min(deadlineNs, clock.nanoTime() + (perAttemptSeconds(w * h) * 1e9).toLong())
            if (csp.search(attemptDeadline, budget) { clock.nanoTime() > deadlineNs } != BitmaskCsp.Result.OK) continue
            val placements = SlotRegistry.toPlacements(build.slots)
            if (placements.any { it.word.text.length < minLen }) continue
            val grid = runCatching { Grid.fromPlacements(w, h, placements) }.getOrNull() ?: continue
            successes++
            val cov = LongWordCoverage.coverageOf(grid, minLen)
            if (cov > bestCov) {
                bestCov = cov
                best = grid
            }
        }
        return best
    }

    internal fun reconstructLayout(
        grid: Grid,
        w: Int,
        h: Int,
    ): CellArray {
        val cells = CellArray(w, h)
        for (r in 0 until h) {
            for (c in 0 until w) {
                if (grid.cells[Position(Row(r), Column(c))] !is LetterCell) cells.set(r, c, CellArray.BLACK)
            }
        }
        return cells
    }

    /** Internal rather than private so tests can drive the full-re-seed branch directly. */
    internal fun reseedOrPerturb(
        cells: CellArray,
        w: Int,
        h: Int,
        minLen: Int,
        lTarget: Int,
        lUseful: Int,
        lTargetH: Int = lTarget,
        lTargetV: Int = lTarget,
        hotCells: List<Pair<Int, Int>>,
        consecFails: Int,
        random: Random,
        blackRatio: Double,
        lMinGood: Int,
        whitenP: Double,
        lengthTwoPenalty: Double,
        lex: Lexicon,
        anchorCount: Int,
        anchorLength: Int,
    ): CellArray {
        if (consecFails > 0 && consecFails % GenerationKnobs.CONSEC_RESEED == 0) {
            val reseeded =
                BlackCellLayout.seed(
                    width = w,
                    height = h,
                    minLen = minLen,
                    lTarget = lTarget,
                    lUseful = lUseful,
                    blackRatio = blackRatio,
                    random = random,
                    lMinGood = lMinGood,
                    lengthTwoPenalty = lengthTwoPenalty,
                    lTargetHorizontal = lTargetH,
                    lTargetVertical = lTargetV,
                )
            if (anchorCount > 0) {
                LayoutAnchorer.carve(reseeded, minLen, lUseful, lex, anchorCount, anchorLength)
            }
            return reseeded
        }
        BlackCellLayout.perturb(
            cells = cells,
            minLen = minLen,
            lUseful = lUseful,
            hotCells = hotCells,
            intensity = GenerationKnobs.PERTURB_INTENSITY,
            random = random,
            whitenProbability = whitenP,
        )
        return cells
    }
}
