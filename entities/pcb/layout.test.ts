import { describe, expect, test } from 'vitest'
import { getKeyCenterMm } from '@entities/kle/geometry'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { computePcbLayout } from '@entities/pcb/layout'
import { DEFAULT_PCB_OPTIONS, PcbOptions } from '@entities/pcb/types'

const withOptions = (overrides: Partial<PcbOptions>): PcbOptions => ({ ...DEFAULT_PCB_OPTIONS, ...overrides })
const single = (item: Record<string, unknown> | string, label = 'A') => computePcbLayout(parseKle([[item, label]]), DEFAULT_PCB_OPTIONS)

describe('computePcbLayout switch footprint selection', () => {
    test('maps a 1u key to the 1.00u footprint key', () => {
        expect(computePcbLayout(parseKle([['A']]), DEFAULT_PCB_OPTIONS).switches[0].footprintKey).toBe('1.00u')
    })

    test('maps a 2.25u key to the exact 2.25u footprint key', () => {
        expect(single({ w: 2.25 }).switches[0].footprintKey).toBe('2.25u')
    })

    test('maps a 2.5u key to the exact 2.50u footprint key', () => {
        expect(single({ w: 2.5 }).switches[0].footprintKey).toBe('2.50u')
    })

    test('caps an oversized spacebar at the largest 3.00u footprint key', () => {
        expect(single({ w: 6.25 }).switches[0].footprintKey).toBe('3.00u')
        expect(single({ w: 4 }).switches[0].footprintKey).toBe('3.00u')
    })

    test('selects the rotated 2.00u_90deg key for a vertical 2u key', () => {
        expect(computePcbLayout(parseKle([[{ h: 2 }, 'A']]), DEFAULT_PCB_OPTIONS).switches[0].footprintKey).toBe('2.00u_90deg')
    })
})

describe('computePcbLayout switch value derivation', () => {
    test('strips html markup from the primary legend', () => {
        expect(single('<b>Ctrl</b>').switches[0].value).toBe('Ctrl')
    })

    test('falls back to SW for an empty legend', () => {
        expect(computePcbLayout(parseKle([['']]), DEFAULT_PCB_OPTIONS).switches[0].value).toBe('SW')
    })

    test('keeps a coordinate legend verbatim', () => {
        expect(computePcbLayout(parseKle([['0,0']]), DEFAULT_PCB_OPTIONS).switches[0].value).toBe('0,0')
    })
})

describe('computePcbLayout rotation composition', () => {
    test('sums layout, global and per-key switch rotation then negates for KiCad', () => {
        const layout = computePcbLayout(parseKle([[{ r: 12, _r: 90 }, '0,0']]), withOptions({ switchRotation: 90 }))
        expect(layout.switches[0].angle).toBeCloseTo(-192, 6)
        expect(layout.diodes[0].angle).toBeCloseTo(-192, 6)
    })

    test('leaves the switch angle at zero for an unrotated key', () => {
        expect(computePcbLayout(parseKle([['A']]), DEFAULT_PCB_OPTIONS).switches[0].angle).toBeCloseTo(0, 6)
    })
})

describe('computePcbLayout diode placement', () => {
    test('offsets the DO-35 origin half a span left and one row below the switch center', () => {
        const layout = computePcbLayout(parseKle([['A']]), DEFAULT_PCB_OPTIONS)
        const center = getKeyCenterMm(parseKle([['A']]).keys[0])
        expect(layout.diodes[0].origin.x).toBeCloseTo(center.x - 3.81, 6)
        expect(layout.diodes[0].origin.y).toBeCloseTo(center.y + 5.08, 6)
        expect(layout.diodes[0].center.x).toBeCloseTo(center.x, 6)
        expect(layout.diodes[0].center.y).toBeCloseTo(center.y + 5.08, 6)
    })

    test('carries the matrix nets from the switch onto its diode', () => {
        const layout = computePcbLayout(parseKle([['0,0']]), DEFAULT_PCB_OPTIONS)
        expect(layout.diodes[0].rowNet).toBe(layout.switches[0].rowNet)
        expect(layout.diodes[0].junctionNet).toBe(layout.switches[0].junctionNet)
    })
})

describe('computePcbLayout stabilizers', () => {
    test('plans a size-matched 6.25u stabilizer with the tabled slot offset', () => {
        const stab = single({ w: 6.25 }, '0,0').stabilizers
        expect(stab).toHaveLength(1)
        expect(stab[0].sizeLabel).toBe('6.25u')
        expect(stab[0].offset).toBe(50)
        expect(stab[0].base).toBe(false)
        expect(stab[0].center.x).toBeCloseTo(59.53125, 6)
        expect(stab[0].holes).toHaveLength(4)
    })

    test('uses the base 2u plan for a sub-3u stabilized key', () => {
        const stab = single({ w: 2.25 }, '0,0').stabilizers
        expect(stab).toHaveLength(1)
        expect(stab[0].base).toBe(true)
        expect(stab[0].offset).toBeCloseTo(11.938, 6)
    })

    test('omits stabilizers below 2u and when the option is disabled', () => {
        expect(single({ w: 1.75 }, '0,0').stabilizers).toHaveLength(0)
        expect(computePcbLayout(parseKle([[{ w: 6.25 }, '0,0']]), withOptions({ stabFootprints: false })).stabilizers).toHaveLength(0)
    })
})

describe('computePcbLayout board bounds', () => {
    test('hugs the key bounds', () => {
        expect(computePcbLayout(parseKle([['A']]), DEFAULT_PCB_OPTIONS).board).toEqual({ left: 0, top: 0, right: 19.05, bottom: 19.05 })
    })
})

describe('computePcbLayout ordering and encoders', () => {
    test('orders physical keys by row then column from the matrix', () => {
        const keyboard = parseKle([
            ['1,0', '1,1'],
            ['0,0', '0,1'],
        ])
        const layout = computePcbLayout(keyboard, DEFAULT_PCB_OPTIONS)
        const orderedCells = layout.order.map((keyIndex) => layout.matrix.perKey[keyIndex])
        expect(orderedCells).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
        ])
        expect(layout.switches.map((item) => item.reference)).toEqual(['SW1', 'SW2', 'SW3', 'SW4'])
    })

    test('flags encoder keys in the switch list', () => {
        const layout = computePcbLayout(parseKle([['0,0', '0,1', { sm: 'rot_ec11' }, '0,2']]), DEFAULT_PCB_OPTIONS)
        expect(layout.switches.filter((item) => item.isEncoder)).toHaveLength(1)
        expect(layout.diodes).toHaveLength(3)
    })

    test('produces one switch and one diode per physical key of a preset', () => {
        const keyboard = parseKle(KLE_PRESETS[0].raw)
        const physicalCount = keyboard.keys.filter((key) => !key.decal && !key.ghost).length
        const layout = computePcbLayout(keyboard, DEFAULT_PCB_OPTIONS)
        expect(layout.switches).toHaveLength(physicalCount)
        expect(layout.diodes).toHaveLength(physicalCount)
    })
})
