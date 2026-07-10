package com.bliss.grid.api.dto

import assertk.assertThat
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import io.kotest.property.Arb
import io.kotest.property.arbitrary.bind
import io.kotest.property.arbitrary.boolean
import io.kotest.property.arbitrary.int
import io.kotest.property.arbitrary.list
import io.kotest.property.arbitrary.of
import io.kotest.property.checkAll
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Test

/** ADR-0001 serialization property tests for the `/verify` wire DTOs (ADR-0099). */
class VerifyGridDtoSerializationPropertyTest {
    private val json = Json { encodeDefaults = true }

    private val arbCellInput: Arb<VerifyCellInputDto> =
        Arb.bind(Arb.int(0..49), Arb.int(0..49), Arb.of(('A'..'Z').map { it.toString() })) { row, column, letter ->
            VerifyCellInputDto(row, column, letter)
        }

    private val arbCellVerdict: Arb<VerifyCellVerdictDto> =
        Arb.bind(Arb.int(0..49), Arb.int(0..49), Arb.boolean()) { row, column, correct ->
            VerifyCellVerdictDto(row, column, correct)
        }

    @Test
    fun `VerifyGridRequest round-trips through JSON for arbitrary cell lists, including empty`() =
        runTest {
            checkAll(Arb.list(arbCellInput, 0..8)) { cells ->
                val request = VerifyGridRequest(cells)
                val encoded = json.encodeToString(VerifyGridRequest.serializer(), request)
                val decoded = json.decodeFromString(VerifyGridRequest.serializer(), encoded)
                assertThat(decoded).isEqualTo(request)
                // ADR-0003 §6: required `cells` stays on the wire even when empty.
                assertThat(encoded).contains("\"cells\"")
            }
        }

    @Test
    fun `VerifyGridResponse round-trips and always carries secondsUntilNextVerify on the wire`() =
        runTest {
            checkAll(Arb.list(arbCellVerdict, 0..8), Arb.int(0..1800)) { cells, seconds ->
                val response = VerifyGridResponse(cells, seconds)
                val encoded = json.encodeToString(VerifyGridResponse.serializer(), response)
                assertThat(encoded).contains("\"secondsUntilNextVerify\":$seconds")
                val decoded = json.decodeFromString(VerifyGridResponse.serializer(), encoded)
                assertThat(decoded).isEqualTo(response)
            }
        }
}
