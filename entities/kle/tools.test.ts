import { describe, expect, test } from 'vitest'
import { getKeyboardBoundsU, getKeyCenterU, getKeyPolygonU, Point } from './geometry'
import { parseKle } from './parse'
import { KLE_PRESETS } from './presets'
import { addMatrixCoordinateLegends, mirrorKeys, moveKeysBy, removeAllLegends } from './tools'

const orthoKeys = () => parseKle(KLE_PRESETS.find((preset) => preset.id === 'ortho-40')!.raw).keys

const aliceKeyboard = () => parseKle(KLE_PRESETS.find((preset) => preset.id === 'alice')!.raw)

const signedArea = (points: Point[]) => {
    let sum = 0
    for (let index = 0; index < points.length; index++) {
        const current = points[index]
        const next = points[(index + 1) % points.length]
        sum += current.x * next.y - next.x * current.y
    }
    return sum / 2
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const expectTranslated = (polygon: Point[], base: Point[], deltaX: number, deltaY: number) => {
    expect(polygon.length).toBe(base.length)
    polygon.forEach((point, index) => {
        expect(point.x).toBeCloseTo(base[index].x + deltaX, 6)
        expect(point.y).toBeCloseTo(base[index].y + deltaY, 6)
    })
}

describe('addMatrixCoordinateLegends', () => {
    test('writes positional "row,col" legends into slot 0 as round numbers', () => {
        const result = addMatrixCoordinateLegends(orthoKeys())
        expect(result[0].labels[0]).toBe('0,0')
        expect(result[11].labels[0]).toBe('0,11')
        expect(result[12].labels[0]).toBe('1,0')
        expect(result[47].labels[0]).toBe('3,11')
    })

    test('keeps labels dense at 12 slots and only replaces slot 0', () => {
        const result = addMatrixCoordinateLegends(orthoKeys())
        expect(result[0].labels.length).toBe(12)
        expect(result[0].labels.slice(1).every((label) => label === null)).toBe(true)
    })

    test('skips decal keys, leaving their original labels intact', () => {
        const keys = parseKle([['A', { d: true }, 'B']]).keys
        expect(keys[1].decal).toBe(true)
        const result = addMatrixCoordinateLegends(keys)
        expect(result[0].labels[0]).toBe('0,0')
        expect(result[1].labels[0]).toBe('B')
    })

    test('does not mutate the input keys', () => {
        const keys = orthoKeys()
        const snapshot = JSON.stringify(keys)
        addMatrixCoordinateLegends(keys)
        expect(JSON.stringify(keys)).toBe(snapshot)
    })
})

describe('removeAllLegends', () => {
    test('clears labels, colors and sizes to 12 nulls for every key when indices is null', () => {
        const result = removeAllLegends(addMatrixCoordinateLegends(orthoKeys()), null)
        for (const key of result) {
            expect(key.labels).toEqual(new Array(12).fill(null))
            expect(key.textColor).toEqual(new Array(12).fill(null))
            expect(key.textSize).toEqual(new Array(12).fill(null))
        }
    })

    test('clears only targeted keys and leaves the rest untouched', () => {
        const source = addMatrixCoordinateLegends(orthoKeys())
        const result = removeAllLegends(source, [0, 2])
        expect(result[0].labels).toEqual(new Array(12).fill(null))
        expect(result[2].labels).toEqual(new Array(12).fill(null))
        expect(result[1].labels[0]).toBe('0,1')
        expect(result[3].labels[0]).toBe('0,3')
    })

    test('does not mutate the input keys', () => {
        const keys = addMatrixCoordinateLegends(orthoKeys())
        const snapshot = JSON.stringify(keys)
        removeAllLegends(keys, null)
        removeAllLegends(keys, [1, 4])
        expect(JSON.stringify(keys)).toBe(snapshot)
    })
})

describe('mirrorKeys', () => {
    test('appends horizontally mirrored copies flipped across the selection right edge', () => {
        const keys = parseKle([['A', 'B']]).keys
        const result = mirrorKeys(keys, [0, 1], 'horizontal')
        expect(result.length).toBe(4)
        expect(result[2].x).toBeCloseTo(3, 6)
        expect(result[3].x).toBeCloseTo(2, 6)
    })

    test('appends vertically mirrored copies flipped across the selection bottom edge', () => {
        const keys = parseKle([['A'], ['B']]).keys
        const result = mirrorKeys(keys, [0, 1], 'vertical')
        expect(result.length).toBe(4)
        expect(result[2].y).toBeCloseTo(3, 6)
        expect(result[3].y).toBeCloseTo(2, 6)
    })

    test('mirrors the secondary rectangle offset to (width - width2 - x2)', () => {
        const keys = parseKle([[{ w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, 'Enter']]).keys
        const original = keys[0]
        const result = mirrorKeys(keys, [0], 'horizontal')
        const copy = result[1]
        expect(copy.x2).toBeCloseTo(original.width - original.width2 - original.x2, 6)
        expect(Math.abs(signedArea(getKeyPolygonU(copy)))).toBeCloseTo(Math.abs(signedArea(getKeyPolygonU(original))), 6)
    })

    test('preserves polygon area for every mirrored copy of the rotated alice cluster', () => {
        const keys = aliceKeyboard().keys
        const leftIndices = keys
            .map((key, index) => ({ key, index }))
            .filter(({ key }) => key.rotationAngle === -12)
            .map(({ index }) => index)
        expect(leftIndices.length).toBeGreaterThan(0)
        const result = mirrorKeys(keys, leftIndices, 'horizontal')
        leftIndices.forEach((sourceIndex, position) => {
            const copy = result[keys.length + position]
            expect(copy.rotationAngle).toBe(12)
            const originalArea = Math.abs(signedArea(getKeyPolygonU(keys[sourceIndex])))
            const copyArea = Math.abs(signedArea(getKeyPolygonU(copy)))
            expect(copyArea).toBeCloseTo(originalArea, 6)
        })
    })

    test('preserves pairwise center distances across the mirror', () => {
        const keys = aliceKeyboard().keys
        const leftIndices = keys
            .map((key, index) => ({ key, index }))
            .filter(({ key }) => key.rotationAngle === -12)
            .map(({ index }) => index)
        const result = mirrorKeys(keys, leftIndices, 'horizontal')
        for (let first = 0; first < leftIndices.length; first++) {
            for (let second = first + 1; second < leftIndices.length; second++) {
                const originalDistance = distance(getKeyCenterU(keys[leftIndices[first]]), getKeyCenterU(keys[leftIndices[second]]))
                const mirroredDistance = distance(getKeyCenterU(result[keys.length + first]), getKeyCenterU(result[keys.length + second]))
                expect(mirroredDistance).toBeCloseTo(originalDistance, 6)
            }
        }
    })

    test('double mirror restores orientation and yields a rigid horizontal translation', () => {
        const keys = aliceKeyboard().keys
        const leftIndices = keys
            .map((key, index) => ({ key, index }))
            .filter(({ key }) => key.rotationAngle === -12)
            .map(({ index }) => index)
        const bounds = getKeyboardBoundsU(leftIndices.map((index) => keys[index]))
        const expectedDelta = 2 * (bounds.maxX - bounds.minX)
        const once = mirrorKeys(keys, leftIndices, 'horizontal')
        const copyIndices = leftIndices.map((_, position) => keys.length + position)
        const twice = mirrorKeys(once, copyIndices, 'horizontal')
        leftIndices.forEach((sourceIndex, position) => {
            const doubled = twice[once.length + position]
            expect(doubled.rotationAngle).toBe(keys[sourceIndex].rotationAngle)
            expectTranslated(getKeyPolygonU(doubled), getKeyPolygonU(keys[sourceIndex]), expectedDelta, 0)
        })
    })

    test('returns a shallow copy without mutating inputs when nothing is selected', () => {
        const keys = parseKle([['A', 'B']]).keys
        const snapshot = JSON.stringify(keys)
        const result = mirrorKeys(keys, [], 'horizontal')
        expect(result.length).toBe(2)
        expect(JSON.stringify(keys)).toBe(snapshot)
    })

    test('does not mutate the input keys', () => {
        const keys = aliceKeyboard().keys
        const snapshot = JSON.stringify(keys)
        mirrorKeys(keys, [0, 1, 2], 'horizontal')
        mirrorKeys(keys, [0, 1, 2], 'vertical')
        expect(JSON.stringify(keys)).toBe(snapshot)
    })
})

describe('moveKeysBy', () => {
    test('rigidly translates non-rotated keys by the delta', () => {
        const keys = orthoKeys()
        const result = moveKeysBy(keys, [5], 1.5, -2)
        expectTranslated(getKeyPolygonU(result[5]), getKeyPolygonU(keys[5]), 1.5, -2)
    })

    test('rigidly translates rotated clusters by moving the rotation origin too', () => {
        const keys = aliceKeyboard().keys
        const leftIndices = keys
            .map((key, index) => ({ key, index }))
            .filter(({ key }) => key.rotationAngle === -12)
            .map(({ index }) => index)
        const deltaX = 2
        const deltaY = 3
        const result = moveKeysBy(keys, leftIndices, deltaX, deltaY)
        for (const index of leftIndices) {
            expect(result[index].rotationX).toBeCloseTo(keys[index].rotationX + deltaX, 6)
            expect(result[index].rotationY).toBeCloseTo(keys[index].rotationY + deltaY, 6)
            expectTranslated(getKeyPolygonU(result[index]), getKeyPolygonU(keys[index]), deltaX, deltaY)
        }
    })

    test('leaves unselected keys as the same reference', () => {
        const keys = orthoKeys()
        const result = moveKeysBy(keys, [0], 1, 1)
        expect(result[1]).toBe(keys[1])
    })

    test('does not mutate the input keys', () => {
        const keys = aliceKeyboard().keys
        const snapshot = JSON.stringify(keys)
        moveKeysBy(keys, [0, 1, 2], 3, 4)
        expect(JSON.stringify(keys)).toBe(snapshot)
    })
})
