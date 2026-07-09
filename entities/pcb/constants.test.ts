import { describe, expect, test } from 'vitest'
import {
    DIODE_DO35_DRILL_MM,
    DIODE_DO35_HALF_SPAN_MM,
    DIODE_DO35_PAD_DIAMETER_MM,
    DIODE_DO35_PAD_PITCH_MM,
    STAB_HOLE_BOTTOM_Y_MM,
    STAB_HOLE_TOP_Y_MM,
    STAB_SIZE_TABLE,
    SWITCH_PIN_DRILL_MM,
    SWITCH_PIN_PAD_DIAMETER_MM,
} from '@entities/pcb/constants'

describe('pcb constant relationships', () => {
    test('the DO-35 half span is exactly half the pad pitch', () => {
        expect(DIODE_DO35_HALF_SPAN_MM * 2).toBeCloseTo(DIODE_DO35_PAD_PITCH_MM, 6)
    })

    test('every through-hole drill is smaller than its annular pad', () => {
        expect(SWITCH_PIN_DRILL_MM).toBeLessThan(SWITCH_PIN_PAD_DIAMETER_MM)
        expect(DIODE_DO35_DRILL_MM).toBeLessThan(DIODE_DO35_PAD_DIAMETER_MM)
    })

    test('the stabilizer wire slot spans from a negative top to a positive bottom', () => {
        expect(STAB_HOLE_TOP_Y_MM).toBeLessThan(0)
        expect(STAB_HOLE_BOTTOM_Y_MM).toBeGreaterThan(0)
        expect(STAB_HOLE_TOP_Y_MM).toBeLessThan(STAB_HOLE_BOTTOM_Y_MM)
    })
})

describe('STAB_SIZE_TABLE', () => {
    test('is sorted by ascending unit size with strictly ascending offsets', () => {
        for (let index = 1; index < STAB_SIZE_TABLE.length; index++) {
            expect(STAB_SIZE_TABLE[index].size).toBeGreaterThan(STAB_SIZE_TABLE[index - 1].size)
            expect(STAB_SIZE_TABLE[index].offset).toBeGreaterThan(STAB_SIZE_TABLE[index - 1].offset)
        }
    })

    test('keeps every slot offset positive', () => {
        for (const entry of STAB_SIZE_TABLE) expect(entry.offset).toBeGreaterThan(0)
    })
})
