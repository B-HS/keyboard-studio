import { describe, expect, test } from 'vitest'
import {
    DIODE_DO35_FOOTPRINT,
    ENCODER_EC11_FOOTPRINT,
    MOUNTING_HOLE_FOOTPRINT,
    SOLDER_SWITCH_FOOTPRINTS,
    STABILIZER_2U_FOOTPRINT,
    SWITCH_FOOTPRINTS,
    WIRE_PADS_1X12_FOOTPRINT,
} from '@entities/pcb/footprint-data'

const SELECTION_SIZE_LABELS = ['1.00u', '1.25u', '1.50u', '1.75u', '2.00u', '2.25u', '2.50u', '2.75u', '3.00u']
const FALLBACK_KEY = 'SW_Cherry_MX_PCB'

const parensAreBalanced = (document: string) => {
    let depth = 0
    let insideString = false
    for (let index = 0; index < document.length; index++) {
        const character = document[index]
        if (insideString) {
            if (character === '\\') {
                index++
                continue
            }
            if (character === '"') insideString = false
            continue
        }
        if (character === '"') {
            insideString = true
            continue
        }
        if (character === '(') depth++
        else if (character === ')') {
            depth--
            if (depth < 0) return false
        }
    }
    return depth === 0 && !insideString
}

describe('switch footprint records', () => {
    test('solder and hotswap records expose the identical set of footprint keys', () => {
        expect(Object.keys(SWITCH_FOOTPRINTS).sort()).toEqual(Object.keys(SOLDER_SWITCH_FOOTPRINTS).sort())
    })

    test('every layout-selectable size and its vertical variant exists in both records', () => {
        for (const record of [SWITCH_FOOTPRINTS, SOLDER_SWITCH_FOOTPRINTS]) {
            for (const label of SELECTION_SIZE_LABELS) {
                expect(record[label]).toBeTruthy()
                if (label !== '1.00u') expect(record[`${label}_90deg`]).toBeTruthy()
            }
            expect(record[FALLBACK_KEY]).toBeTruthy()
        }
    })

    test('every footprint value is a balanced footprint node', () => {
        for (const record of [SWITCH_FOOTPRINTS, SOLDER_SWITCH_FOOTPRINTS]) {
            for (const source of Object.values(record)) {
                expect(source.startsWith('(footprint "')).toBe(true)
                expect(parensAreBalanced(source)).toBe(true)
            }
        }
    })
})

describe('fixed component footprints', () => {
    const fixed: [string, string, string][] = [
        ['DO-35 diode', DIODE_DO35_FOOTPRINT, 'D_DO-35_SOD27_P7.62mm_Horizontal'],
        ['EC11 encoder', ENCODER_EC11_FOOTPRINT, 'RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm'],
        ['mounting hole', MOUNTING_HOLE_FOOTPRINT, 'MountingHole_5.4mm_NPTH'],
        ['2u stabilizer', STABILIZER_2U_FOOTPRINT, 'Stabilizer_Cherry_MX_2.00u'],
        ['wire pad strip', WIRE_PADS_1X12_FOOTPRINT, 'WirePads_1x12_P2.54'],
    ]

    for (const [name, source, footprintName] of fixed) {
        test(`the ${name} footprint is balanced and carries its expected name`, () => {
            expect(source.startsWith(`(footprint "${footprintName}"`)).toBe(true)
            expect(parensAreBalanced(source)).toBe(true)
        })
    }
})
