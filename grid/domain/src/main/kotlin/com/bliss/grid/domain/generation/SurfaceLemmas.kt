package com.bliss.grid.domain.generation

/**
 * Pure-domain read seam mapping a folded surface to every folded lemma the
 * corpus records for it. The loader's `byText` merge keeps one variant per
 * folded surface and discards the others' lemmas, so a surface like `LIE`
 * (noun `lie` + verb `lier`) reaches the generator carrying a single lemma;
 * this seam restores the dropped ones so per-grid dedup blocks inflected
 * homographs (`lie`/`lia`, `es`/`été`, `régie`/`régissons`). See ADR-0100.
 *
 * [Inert] contributes no extra lemmas, degenerating dedup to the surface's
 * own [com.bliss.grid.domain.model.Word.lemma] (legacy single-lemma behavior).
 */
fun interface SurfaceLemmas {
    fun lemmasOf(surface: String): Set<String>

    companion object {
        val Inert: SurfaceLemmas = SurfaceLemmas { emptySet() }

        fun fromMap(bySurface: Map<String, Set<String>>): SurfaceLemmas =
            if (bySurface.isEmpty()) Inert else SurfaceLemmas { bySurface[it].orEmpty() }
    }
}
