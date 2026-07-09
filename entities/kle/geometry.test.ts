import { describe, expect, test } from 'vitest'
import { parseKle } from './parse'
import { getKeyboardBoundsU, getKeyCenterMm, getKeyCenterU, getKeyPolygonU, KEY_UNIT_MM, rotatePoint, roundCoordinate } from './geometry'

describe('roundCoordinate', () => {
    test('quantizes to six decimal places for stable SSR attribute strings', () => {
        expect(roundCoordinate(0.12345678)).toBe(0.123457)
        expect(String(roundCoordinate(0.1 + 0.2))).toBe('0.3')
    })

    test('leaves already-short values untouched and is idempotent', () => {
        expect(roundCoordinate(1.5)).toBe(1.5)
        expect(roundCoordinate(roundCoordinate(Math.SQRT2))).toBe(roundCoordinate(Math.SQRT2))
    })

    test('produces identical output for the same input across calls', () => {
        const value = 19.05 / 3
        expect(roundCoordinate(value)).toBe(roundCoordinate(value))
    })
})

describe('rotatePoint', () => {
    test('rotates 90 degrees clockwise in a y-down system', () => {
        const rotated = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90)
        expect(rotated.x).toBeCloseTo(0, 5)
        expect(rotated.y).toBeCloseTo(1, 10)
    })

    test('rotates around a non-origin pivot', () => {
        const rotated = rotatePoint({ x: 2, y: 1 }, { x: 1, y: 1 }, 180)
        expect(rotated.x).toBeCloseTo(0, 5)
        expect(rotated.y).toBeCloseTo(1, 10)
    })
})

describe('getKeyPolygonU', () => {
    test('returns four corners for a simple key', () => {
        const key = parseKle([['A']]).keys[0]
        const polygon = getKeyPolygonU(key)
        expect(polygon.length).toBe(4)
        expect(polygon[0]).toEqual({ x: 0, y: 0 })
        expect(polygon[1]).toEqual({ x: 1, y: 0 })
        expect(polygon[2]).toEqual({ x: 1, y: 1 })
        expect(polygon[3]).toEqual({ x: 0, y: 1 })
    })

    test('produces a six-corner outline for the ISO enter', () => {
        const key = parseKle([[{ x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, 'Enter']]).keys[0]
        const polygon = getKeyPolygonU(key)
        expect(polygon.length).toBe(6)
        const xs = polygon.map((point) => point.x)
        const ys = polygon.map((point) => point.y)
        expect(Math.min(...xs)).toBeCloseTo(0, 5)
        expect(Math.max(...xs)).toBeCloseTo(1.5, 10)
        expect(Math.min(...ys)).toBeCloseTo(0, 5)
        expect(Math.max(...ys)).toBeCloseTo(2, 10)
    })
})

describe('getKeyCenter', () => {
    test('centers a 2u key on its primary rect', () => {
        const key = parseKle([[{ w: 2 }, 'A']]).keys[0]
        const center = getKeyCenterU(key)
        expect(center.x).toBeCloseTo(1, 10)
        expect(center.y).toBeCloseTo(0.5, 10)
    })

    test('converts the center to millimeters', () => {
        const key = parseKle([['A']]).keys[0]
        const center = getKeyCenterMm(key)
        expect(center.x).toBeCloseTo(0.5 * KEY_UNIT_MM, 10)
        expect(center.y).toBeCloseTo(0.5 * KEY_UNIT_MM, 10)
    })
})

describe('getKeyboardBoundsU', () => {
    test('returns zeros for an empty keyboard', () => {
        expect(getKeyboardBoundsU([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 })
    })

    test('accounts for rotation when computing bounds', () => {
        const keys = parseKle([[{ r: 45 }, 'A']]).keys
        const bounds = getKeyboardBoundsU(keys)
        const halfDiagonal = Math.SQRT1_2
        expect(bounds.minX).toBeCloseTo(-halfDiagonal, 5)
        expect(bounds.maxX).toBeCloseTo(halfDiagonal, 5)
        expect(bounds.minY).toBeCloseTo(0, 5)
        expect(bounds.maxY).toBeCloseTo(Math.SQRT2, 5)
        expect(bounds.width).toBeCloseTo(Math.SQRT2, 5)
        expect(bounds.height).toBeCloseTo(Math.SQRT2, 5)
    })

    test('spans a two-key row', () => {
        const keys = parseKle([['A', 'B']]).keys
        const bounds = getKeyboardBoundsU(keys)
        expect(bounds.minX).toBeCloseTo(0, 5)
        expect(bounds.maxX).toBeCloseTo(2, 10)
        expect(bounds.width).toBeCloseTo(2, 10)
        expect(bounds.height).toBeCloseTo(1, 10)
    })
})
