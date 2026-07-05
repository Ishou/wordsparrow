package com.bliss.grid.domain.generation

import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

// One-off audit: how often do the SlotRegistry invariants actually bind on the completed
// (pre-validity-constraints) co-generated board? Distinguishes true difficulty from over-encoding.
@Tag("bench")
class BoardInvariantAuditTest {
    private val board =
        (
            "#B#M#K#L#M#N#X#O#F#T#O#N#N#C\n" +
                "REVALORISONS#CASCADE#IMAGINA\n" +
                "A#SSO#I#CRI#Q#D#ENONCEE#NAIS\n" +
                "#S##OL#AIE##UE##R#SUENT#U#VA\n" +
                "#E#SKI#RE##VISION##E#TAU#JO#\n" +
                "F#FASSE#SUBI#TRIES#SN##LUES#\n" +
                "E#U##AGE#RIT##AERER#OBSTRUES\n" +
                "#CM#FILS#ELEVONS#MAGNESIEN#K\n" +
                "#REBATI#ETA#CC##VETU#SEMEE#I\n" +
                "DU#AM#S#URNE#TE#U#AA#O#E#SUS\n" +
                "I#IRE#ETRE#C#RAIE##NAISSE#K#\n" +
                "S#CREA#HO##ATOUT#P#ORNE#X#AZ\n" +
                "#LOESS#O##VRAI#EPUISE#J##OSO\n" +
                "#ENE##OR#METS#EMIRS#SNOB#YEN\n" +
                "L#E#T#CALICES#G##SO##OURSE#E\n" +
                "X##CUL#XV#U#EVADA#LA#CREEZ##\n" +
                "#EMANAT##I#ISOLER#ABLE#VU#R#\n" +
                "#RODERA#FAIM#U#TER#BU#PELLES\n" +
                "XE#USD#FI#TAXENT#ARE#ATTEINT\n" +
                "X##C#S#ML##ML#DE#TU##G##STE#"
        ).split("\n")

    @Test
    fun `count actual invariant violations on the completed board`() {
        val h = board.size
        val w = board[0].length
        val cells = CellArray(w, h)
        for (r in 0 until h) for (c in 0 until w) if (board[r][c] == '#') cells.set(r, c, CellArray.BLACK)

        var deadEndTips = 0
        for (r in 0 until h) for (c in 0 until w) {
            if (BlackCellLayout.isShortDeadEndTip(cells, r, c)) {
                deadEndTips++
                println("dead-end tip at r=$r c=$c")
            }
        }
        var deadBlacks = 0
        for (r in 0 until h) for (c in 0 until w) {
            if (!cells.isBlack(r, c)) continue
            val hostsAcross = c + 1 < w && !cells.isBlack(r, c + 1) && (c + 2 >= w || run { var i = c + 1; var n = 0; while (i < w && !cells.isBlack(r, i)) { n++; i++ }; n >= 2 })
            val hostsDown = r + 1 < h && !cells.isBlack(r + 1, c) && run { var i = r + 1; var n = 0; while (i < h && !cells.isBlack(i, c)) { n++; i++ }; n >= 2 }
            if (!hostsAcross && !hostsDown) {
                deadBlacks++
                println("dead black at r=$r c=$c")
            }
        }
        println("TOTAL: deadEndTips=$deadEndTips deadBlacks=$deadBlacks (of ${board.sumOf { row -> row.count { it == '#' } }} blacks)")
    }
}
