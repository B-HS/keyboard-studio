import { describe, expect, test } from 'vitest'
import { ROTARY_ENCODER_SM } from '@entities/kle/encoder'
import { KEY_UNIT_MM } from '@entities/kle/geometry'
import { KleKey, KleKeyboard } from '@entities/kle/types'
import { buildWiringDiagram, wiringColColor, wiringDiagramToSvg, wiringRowColor } from '@entities/pcb/wiring-diagram'

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

const grid2x2 = () => makeKeyboard([makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0 }), makeKey({ x: 0, y: 1 }), makeKey({ x: 1, y: 1 })])

describe('buildWiringDiagram', () => {
    test('produces one polyline per row and per column', () => {
        const diagram = buildWiringDiagram(grid2x2())
        expect(diagram.nodes).toHaveLength(4)
        expect(diagram.rows.map((line) => line.index)).toEqual([0, 1])
        expect(diagram.cols.map((line) => line.index)).toEqual([0, 1])
        expect(diagram.rowCount).toBe(2)
        expect(diagram.colCount).toBe(2)
    })

    test('sorts row points by x in millimetres regardless of key order', () => {
        const keyboard = makeKeyboard([makeKey({ x: 2, y: 0 }), makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0 })])
        const diagram = buildWiringDiagram(keyboard)
        const xs = diagram.rows[0].points.map((point) => point.x)
        expect(xs).toEqual([...xs].sort((left, right) => left - right))
        expect(diagram.rows[0].points[0].x).toBeCloseTo(0.5 * KEY_UNIT_MM, 6)
    })

    test('sorts column points by y in millimetres', () => {
        const diagram = buildWiringDiagram(grid2x2())
        const ys = diagram.cols[0].points.map((point) => point.y)
        expect(ys).toEqual([...ys].sort((left, right) => left - right))
    })

    test('marks encoder keys and excludes decal keys', () => {
        const keyboard = makeKeyboard([makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0, sm: ROTARY_ENCODER_SM }), makeKey({ x: 2, y: 0, decal: true })])
        const diagram = buildWiringDiagram(keyboard)
        expect(diagram.nodes).toHaveLength(2)
        expect(diagram.nodes.filter((node) => node.isEncoder)).toHaveLength(1)
    })

    test('computes millimetre bounds from key polygons', () => {
        const diagram = buildWiringDiagram(grid2x2())
        expect(diagram.bounds.width).toBeCloseTo(2 * KEY_UNIT_MM, 6)
        expect(diagram.bounds.height).toBeCloseTo(2 * KEY_UNIT_MM, 6)
    })

    test('returns empty bounds for an empty keyboard', () => {
        const diagram = buildWiringDiagram(makeKeyboard([]))
        expect(diagram.nodes).toHaveLength(0)
        expect(diagram.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 })
    })
})

describe('wiring color ramps', () => {
    test('produces distinct hsl strings for adjacent indices', () => {
        expect(wiringRowColor(0, 4)).toMatch(/^hsl\(/)
        expect(wiringColColor(0, 4)).toMatch(/^hsl\(/)
        expect(wiringRowColor(0, 4)).not.toBe(wiringRowColor(3, 4))
    })

    test('never emits a negative hue', () => {
        for (let index = 0; index < 6; index++) {
            const hue = Number(wiringRowColor(index, 6).slice(4).split(',')[0])
            expect(hue).toBeGreaterThanOrEqual(0)
            expect(hue).toBeLessThan(360)
        }
    })
})

describe('wiringDiagramToSvg', () => {
    test('serializes a standalone svg with inline colors and labels', () => {
        const svg = wiringDiagramToSvg(buildWiringDiagram(grid2x2()))
        expect(svg.startsWith('<?xml')).toBe(true)
        expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
        expect(svg).toContain('viewBox=')
        expect(svg).toContain('<polyline')
        expect(svg).toContain('hsl(')
        expect(svg).toContain('>R0<')
        expect(svg).toContain('>C0<')
        expect(svg).toContain('>Rows<')
        expect(svg).toContain('>Columns<')
        expect(svg).not.toContain('var(--')
    })

    test('draws an encoder marker when an encoder is present', () => {
        const withEncoder = makeKeyboard([makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0, sm: ROTARY_ENCODER_SM })])
        const svg = wiringDiagramToSvg(buildWiringDiagram(withEncoder))
        expect(svg).toContain('stroke="#7048e8"')
    })
})
