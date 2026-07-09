import { describe, expect, test } from 'vitest'
import { ROTARY_ENCODER_SM } from '@entities/kle/encoder'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { buildKeyboardSummary, renderKeyboardSummaryText } from '@entities/kle/summary'
import { KleKey, KleKeyboard } from '@entities/kle/types'

const makeKey = (overrides: Partial<KleKey> = {}): KleKey => ({
    color: '#cccccc',
    labels: [],
    textColor: [],
    textSize: [],
    defaults: { textColor: '#000000', textSize: 3 },
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    x2: 0,
    y2: 0,
    width2: 1,
    height2: 1,
    rotationX: 0,
    rotationY: 0,
    rotationAngle: 0,
    decal: false,
    ghost: false,
    stepped: false,
    nub: false,
    profile: '',
    sm: '',
    sb: '',
    st: '',
    switchRotation: 0,
    stabRotation: 0,
    ...overrides,
})

const makeKeyboard = (keys: KleKey[]): KleKeyboard => ({
    meta: {
        author: '',
        backcolor: '#eeeeee',
        background: null,
        name: '',
        notes: '',
        radii: '',
        switchBrand: '',
        switchMount: '',
        switchType: '',
    },
    keys,
})

const findPreset = (id: string) => {
    const preset = KLE_PRESETS.find((entry) => entry.id === id)
    if (!preset) throw new Error(`missing preset ${id}`)
    return preset
}

describe('buildKeyboardSummary', () => {
    test('counts total keys, switches, encoders, and diodes for a plain grid', () => {
        const keyboard = makeKeyboard([makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0 }), makeKey({ x: 0, y: 1 }), makeKey({ x: 1, y: 1 })])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.totalKeys).toBe(4)
        expect(summary.switchCount).toBe(4)
        expect(summary.encoderCount).toBe(0)
        expect(summary.diodeCount).toBe(4)
        expect(summary.rows).toBe(2)
        expect(summary.cols).toBe(2)
    })

    test('excludes decal and ghost keys from switch count but keeps them in total', () => {
        const keyboard = makeKeyboard([makeKey(), makeKey({ x: 1, decal: true }), makeKey({ x: 2, ghost: true })])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.totalKeys).toBe(3)
        expect(summary.switchCount).toBe(1)
        expect(summary.diodeCount).toBe(1)
    })

    test('counts rotary encoders separately and keeps them out of switches and keycaps', () => {
        const keyboard = makeKeyboard([makeKey(), makeKey({ x: 1, sm: ROTARY_ENCODER_SM })])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.switchCount).toBe(1)
        expect(summary.encoderCount).toBe(1)
        expect(summary.diodeCount).toBe(2)
        const keycapTotal = summary.keycaps.reduce((sum, cap) => sum + cap.count, 0)
        expect(keycapTotal).toBe(1)
    })

    test('groups keycap inventory by width x height and sorts ascending', () => {
        const keyboard = makeKeyboard([
            makeKey({ x: 0, y: 0 }),
            makeKey({ x: 1, y: 0 }),
            makeKey({ x: 2, y: 0, width: 2 }),
            makeKey({ x: 0, y: 1, width: 1.25 }),
        ])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.keycaps).toEqual([
            { widthU: 1, heightU: 1, count: 2 },
            { widthU: 1.25, heightU: 1, count: 1 },
            { widthU: 2, heightU: 1, count: 1 },
        ])
    })

    test('maps stabilized keys onto the plate size buckets', () => {
        const keyboard = makeKeyboard([
            makeKey({ x: 0, y: 0, width: 2 }),
            makeKey({ x: 2, y: 0, width: 2.25 }),
            makeKey({ x: 4.25, y: 0, width: 2.75 }),
            makeKey({ x: 0, y: 1, width: 6.25 }),
            makeKey({ x: 6.25, y: 1, width: 7 }),
            makeKey({ x: 0, y: 2, width: 1, height: 2 }),
        ])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.stabilizers).toEqual([
            { sizeU: 2, label: '2u', count: 4 },
            { sizeU: 6.25, label: '6.25u', count: 1 },
            { sizeU: 7, label: '7u', count: 1 },
        ])
    })

    test('does not assign stabilizers to sub-2u keys or encoders', () => {
        const keyboard = makeKeyboard([makeKey({ width: 1.75 }), makeKey({ x: 2, width: 2, sm: ROTARY_ENCODER_SM })])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.stabilizers).toEqual([])
    })

    test('reports layout dimensions in u and mm', () => {
        const keyboard = makeKeyboard([makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0 }), makeKey({ x: 0, y: 1 })])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.widthU).toBe(2)
        expect(summary.heightU).toBe(2)
        expect(summary.widthMm).toBeCloseTo(38.1, 3)
        expect(summary.heightMm).toBeCloseTo(38.1, 3)
    })

    test('summarizes the ANSI 60% preset with the expected inventory', () => {
        const keyboard = parseKle(findPreset('ansi-60').raw)
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.totalKeys).toBe(61)
        expect(summary.switchCount).toBe(61)
        expect(summary.encoderCount).toBe(0)
        expect(summary.rows).toBe(5)
        expect(summary.widthU).toBe(15)
        expect(summary.heightU).toBe(5)
        expect(summary.widthMm).toBeCloseTo(285.75, 2)
        expect(summary.keycaps.reduce((sum, cap) => sum + cap.count, 0)).toBe(61)
        expect(summary.keycaps.find((cap) => cap.widthU === 6.25 && cap.heightU === 1)).toEqual({ widthU: 6.25, heightU: 1, count: 1 })
        expect(summary.stabilizers).toEqual([
            { sizeU: 2, label: '2u', count: 4 },
            { sizeU: 6.25, label: '6.25u', count: 1 },
        ])
    })

    test('groups the ISO enter as a distinct 1.25u x 2u keycap', () => {
        const keyboard = parseKle([[{ x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, 'Enter'], ['A']])
        const summary = buildKeyboardSummary(keyboard)
        expect(summary.switchCount).toBe(2)
        expect(summary.keycaps).toContainEqual({ widthU: 1.25, heightU: 2, count: 1 })
        expect(summary.keycaps).toContainEqual({ widthU: 1, heightU: 1, count: 1 })
    })

    test('keeps counts and finite bounds for the rotated alice preset', () => {
        const summary = buildKeyboardSummary(parseKle(findPreset('alice').raw))
        expect(summary.switchCount).toBe(61)
        expect(summary.encoderCount).toBe(0)
        expect(summary.diodeCount).toBe(61)
        expect(summary.keycaps.reduce((sum, cap) => sum + cap.count, 0)).toBe(61)
        expect(summary.stabilizers).toContainEqual({ sizeU: 2, label: '2u', count: 2 })
        expect(summary.widthU).toBeGreaterThan(0)
        expect(summary.heightU).toBeGreaterThan(0)
        expect(Number.isFinite(summary.widthMm)).toBe(true)
        expect(Number.isFinite(summary.heightMm)).toBe(true)
    })
})

describe('renderKeyboardSummaryText', () => {
    test('renders headline totals and BOM sections', () => {
        const keyboard = makeKeyboard([makeKey({ width: 2 }), makeKey({ x: 2, sm: ROTARY_ENCODER_SM })])
        const text = renderKeyboardSummaryText(buildKeyboardSummary(keyboard))
        expect(text).toContain('Keyboard build summary')
        expect(text).toContain('Switches: 1')
        expect(text).toContain('Rotary encoders: 1')
        expect(text).toContain('Diodes: 2')
        expect(text).toContain('Keycap inventory')
        expect(text).toContain('Stabilizers')
        expect(text).toContain('2u: 1')
    })

    test('prints None when there are no keycaps or stabilizers', () => {
        const text = renderKeyboardSummaryText(buildKeyboardSummary(makeKeyboard([])))
        expect(text).toContain('Total keys: 0')
        const sections = text.split('Stabilizers')
        expect(sections[0]).toContain('None')
        expect(sections[1]).toContain('None')
    })
})
