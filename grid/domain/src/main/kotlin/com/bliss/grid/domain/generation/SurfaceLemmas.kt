package com.bliss.grid.domain.generation

/** Pure-domain read seam recovering the folded lemmas a surface's merge dropped (ADR-0100); [Inert] keeps single-lemma behavior. */
fun interface SurfaceLemmas {
    fun lemmasOf(surface: String): Set<String>

    companion object {
        val Inert: SurfaceLemmas = SurfaceLemmas { emptySet() }

        fun fromMap(bySurface: Map<String, Set<String>>): SurfaceLemmas =
            if (bySurface.isEmpty()) Inert else SurfaceLemmas { bySurface[it].orEmpty() }
    }
}
