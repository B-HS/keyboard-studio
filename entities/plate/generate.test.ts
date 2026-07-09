import { describe, expect, test } from 'vitest'
import { getKeyboardBoundsU, getKeyCenterMm, KEY_UNIT_MM, Point } from '@entities/kle/geometry'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { buildPlate, getUsableKeys, isKeyStabilized } from './generate'
import { ANSI_60_DEFAULT_GEOMETRY, MIXED_DEFAULT_GEOMETRY, MX_OPEN_DEFAULT_GEOMETRY } from './generate.fixtures'
import { DEFAULT_PLATE_OPTIONS } from './types'

const ansi60Raw = KLE_PRESETS.find((preset) => preset.id === 'ansi-60')?.raw ?? []

const mixedRaw: unknown[] = [
    [{ w: 2.25 }, 'Enter'],
    [{ y: 0.25, h: 2 }, 'RShift'],
    [{ r: 15, x: 3 }, 'Rot'],
]

const spanX = (polygon: Point[]) => Math.max(...polygon.map((point) => point.x)) - Math.min(...polygon.map((point) => point.x))

const centeredSpan = (polygon: Point[], center: Point, axis: 'x' | 'y') => Math.max(...polygon.map((point) => Math.abs(point[axis] - center[axis])))

const centroid = (polygon: Point[]) => ({
    x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
    y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
})

describe('buildPlate holes', () => {
    test('produces one cutout per key plus a stabilizer pair for every stabilized key', () => {
        const keyboard = parseKle(ansi60Raw)
        const usableKeys = getUsableKeys(keyboard.keys)
        const stabilizedKeys = usableKeys.filter((key) => isKeyStabilized(key, DEFAULT_PLATE_OPTIONS))
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)

        expect(usableKeys.length).toBe(61)
        expect(stabilizedKeys.length).toBe(5)
        expect(plate.holes.length).toBe(usableKeys.length + stabilizedKeys.length * 2)
        expect(plate.holes.length).toBe(71)
    })

    test('emits no stabilizer slots when the stabilizer option is none', () => {
        const keyboard = parseKle(ansi60Raw)
        const usableKeys = getUsableKeys(keyboard.keys)
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, stabilizer: 'none' })

        expect(plate.holes.length).toBe(usableKeys.length)
    })
})

describe('buildPlate kerf', () => {
    test('shrinks each cutout by the kerf amount per axis', () => {
        const keyboard = parseKle([['A']])
        const withoutKerf = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0 })
        const withKerf = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0.2 })

        expect(spanX(withoutKerf.holes[0])).toBeCloseTo(14, 6)
        expect(spanX(withKerf.holes[0])).toBeCloseTo(13.8, 6)
    })
})

describe('buildPlate encoder cutout', () => {
    test('emits a single 24-gon EC11 hole of radius 4mm and no stabilizer', () => {
        const keyboard = parseKle([[{ sm: 'rot_ec11', w: 2 }, 'Enc']])
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0 })

        expect(isKeyStabilized(keyboard.keys[0], DEFAULT_PLATE_OPTIONS)).toBe(false)
        expect(plate.holes.length).toBe(1)

        const cutout = plate.holes[0]
        expect(cutout.length).toBe(24)
        expect(spanX(cutout)).toBeCloseTo(8, 6)

        const center = getKeyCenterMm(keyboard.keys[0])
        for (const point of cutout) {
            expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(4, 6)
        }
    })

    test('applies kerf to the EC11 hole radius', () => {
        const keyboard = parseKle([[{ sm: 'rot_ec11' }, 'Enc']])
        const withKerf = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0.4 })
        const center = getKeyCenterMm(keyboard.keys[0])

        for (const point of withKerf.holes[0]) {
            expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(3.8, 6)
        }
    })
})

describe('buildPlate choc cutout', () => {
    test('emits a 13.8 mm square cutout for the choc switch profile', () => {
        const keyboard = parseKle([['A']])
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, cutout: 'choc', kerf: 0 })
        const cutout = plate.holes[0]
        const spanY = Math.max(...cutout.map((point) => point.y)) - Math.min(...cutout.map((point) => point.y))

        expect(spanX(cutout)).toBeCloseTo(13.8, 6)
        expect(spanY).toBeCloseTo(13.8, 6)
    })
})

describe('buildPlate outline', () => {
    test('expands the key footprint bounds by the edge margin', () => {
        const keyboard = parseKle(ansi60Raw)
        const bounds = getKeyboardBoundsU(getUsableKeys(keyboard.keys))
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const marginX = DEFAULT_PLATE_OPTIONS.edgeMarginX
        const marginY = DEFAULT_PLATE_OPTIONS.edgeMarginY
        const xs = plate.outline.map((point) => point.x)
        const ys = plate.outline.map((point) => point.y)

        expect(Math.min(...xs)).toBeCloseTo(bounds.minX * KEY_UNIT_MM - marginX, 6)
        expect(Math.min(...ys)).toBeCloseTo(bounds.minY * KEY_UNIT_MM - marginY, 6)
        expect(Math.max(...xs)).toBeCloseTo(bounds.maxX * KEY_UNIT_MM + marginX, 6)
        expect(Math.max(...ys)).toBeCloseTo(bounds.maxY * KEY_UNIT_MM + marginY, 6)
        expect(plate.widthMm).toBeCloseTo(bounds.width * KEY_UNIT_MM + 2 * marginX, 6)
        expect(plate.heightMm).toBeCloseTo(bounds.height * KEY_UNIT_MM + 2 * marginY, 6)
    })

    test('applies the horizontal and vertical edge margins independently', () => {
        const keyboard = parseKle(ansi60Raw)
        const bounds = getKeyboardBoundsU(getUsableKeys(keyboard.keys))
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, edgeMarginX: 5, edgeMarginY: 1.5 })

        expect(plate.widthMm).toBeCloseTo(bounds.width * KEY_UNIT_MM + 2 * 5, 6)
        expect(plate.heightMm).toBeCloseTo(bounds.height * KEY_UNIT_MM + 2 * 1.5, 6)
    })
})

describe('buildPlate default regression', () => {
    test('keeps existing default geometry byte-identical to the pre-refactor snapshot', () => {
        const ansi = buildPlate(parseKle(ansi60Raw).keys, DEFAULT_PLATE_OPTIONS)
        const mxOpen = buildPlate(parseKle([['A']]).keys, { ...DEFAULT_PLATE_OPTIONS, cutout: 'mx-open' })
        const mixed = buildPlate(parseKle(mixedRaw).keys, DEFAULT_PLATE_OPTIONS)

        expect(JSON.stringify(ansi)).toBe(ANSI_60_DEFAULT_GEOMETRY)
        expect(JSON.stringify(mxOpen)).toBe(MX_OPEN_DEFAULT_GEOMETRY)
        expect(JSON.stringify(mixed)).toBe(MIXED_DEFAULT_GEOMETRY)
    })
})

describe('buildPlate switch cutout size override', () => {
    test('overrides the per-type cutout dimensions independently', () => {
        const keyboard = parseKle([['A']])
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, switchCutoutWidth: 15, switchCutoutHeight: 13, kerf: 0 })
        const cutout = plate.holes[0]
        const spanY = Math.max(...cutout.map((point) => point.y)) - Math.min(...cutout.map((point) => point.y))

        expect(spanX(cutout)).toBeCloseTo(15, 6)
        expect(spanY).toBeCloseTo(13, 6)
    })

    test('falls back to the cutout-type default when the override is null', () => {
        const keyboard = parseKle([['A']])
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, cutout: 'alps', kerf: 0 })
        const cutout = plate.holes[0]
        const spanY = Math.max(...cutout.map((point) => point.y)) - Math.min(...cutout.map((point) => point.y))

        expect(spanX(cutout)).toBeCloseTo(15.5, 6)
        expect(spanY).toBeCloseTo(12.8, 6)
    })
})

describe('buildPlate stabilizer style', () => {
    test('applies the selected style slot dimensions', () => {
        const keyboard = parseKle([[{ w: 2.25 }, 'Enter']])
        const plate = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, stabilizer: 'mx-basic', kerf: 0 })
        const slot = plate.holes[1]
        const spanY = Math.max(...slot.map((point) => point.y)) - Math.min(...slot.map((point) => point.y))

        expect(spanX(slot)).toBeCloseTo(7, 6)
        expect(spanY).toBeCloseTo(15, 6)
    })
})

describe('buildPlate switch rotation', () => {
    test('rotates the mx-open notch from the horizontal axis to the vertical axis under a 90 degree switch rotation', () => {
        const keyboard = parseKle([['A']])
        const center = getKeyCenterMm(keyboard.keys[0])
        const upright = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, cutout: 'mx-open', kerf: 0 }).holes[0]

        keyboard.keys[0].switchRotation = 90
        const rotated = buildPlate(keyboard.keys, { ...DEFAULT_PLATE_OPTIONS, cutout: 'mx-open', kerf: 0 }).holes[0]

        expect(centeredSpan(upright, center, 'x')).toBeGreaterThan(centeredSpan(upright, center, 'y'))
        expect(centeredSpan(rotated, center, 'y')).toBeGreaterThan(centeredSpan(rotated, center, 'x'))
        expect(centeredSpan(rotated, center, 'y')).toBeCloseTo(centeredSpan(upright, center, 'x'), 6)
    })
})

describe('buildPlate stabilizer rotation', () => {
    test('a 90 degree stab rotation on a horizontal key separates the slots vertically like the auto-vertical heuristic', () => {
        const horizontal = parseKle([[{ w: 2 }, 'Space']])
        const uprightPlate = buildPlate(horizontal.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0 })
        const uprightGap = Math.abs(centroid(uprightPlate.holes[1]).x - centroid(uprightPlate.holes[2]).x)

        horizontal.keys[0].stabRotation = 90
        const rotatedPlate = buildPlate(horizontal.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0 })
        const rotatedGap = Math.abs(centroid(rotatedPlate.holes[1]).y - centroid(rotatedPlate.holes[2]).y)

        expect(uprightGap).toBeGreaterThan(1)
        expect(Math.abs(centroid(rotatedPlate.holes[1]).x - centroid(rotatedPlate.holes[2]).x)).toBeCloseTo(0, 6)
        expect(rotatedGap).toBeCloseTo(uprightGap, 6)

        const vertical = parseKle([[{ h: 2 }, 'RShift']])
        const verticalPlate = buildPlate(vertical.keys, { ...DEFAULT_PLATE_OPTIONS, kerf: 0 })
        const verticalGap = Math.abs(centroid(verticalPlate.holes[1]).y - centroid(verticalPlate.holes[2]).y)

        expect(Math.abs(centroid(verticalPlate.holes[1]).x - centroid(verticalPlate.holes[2]).x)).toBeCloseTo(0, 6)
        expect(verticalGap).toBeGreaterThan(1)
    })
})
