import { isEncoderKey } from '@entities/kle/encoder'
import { getKeyboardBoundsU, getKeyCenterMm, KEY_UNIT_MM, Point, rotatePoint, roundCoordinate } from '@entities/kle/geometry'
import { KleKey } from '@entities/kle/types'
import { PlateGeometry, PlateOptions, STABILIZER_STYLES, SWITCH_CUTOUT_DEFAULTS } from './types'

const MX_OPEN_NOTCH_DEPTH_MM = 0.8
const MX_OPEN_NOTCH_HEIGHT_MM = 3.5

const ENCODER_CUTOUT_RADIUS_MM = 4
const ENCODER_CUTOUT_SEGMENTS = 24
const FULL_CIRCLE_RADIANS = Math.PI * 2

const STAB_MIN_UNIT = 2
const STAB_ROTATED_ANGLE_DEG = 90

const CORNER_SEGMENTS = 12
const RIGHT_ANGLE_DEG = 90
const DEGREES_TO_RADIANS = Math.PI / 180

const ORIGIN: Point = { x: 0, y: 0 }

const STABILIZER_SPACINGS = [
    { minUnit: 8, spacingMm: 66.675 },
    { minUnit: 7, spacingMm: 57.15 },
    { minUnit: 6.5, spacingMm: 52.38 },
    { minUnit: 6.25, spacingMm: 50.0 },
    { minUnit: 6, spacingMm: 47.625 },
    { minUnit: 4, spacingMm: 28.575 },
    { minUnit: 3, spacingMm: 19.05 },
    { minUnit: STAB_MIN_UNIT, spacingMm: 11.938 },
]

const getStabilizerSpacingMm = (unit: number) => {
    for (const entry of STABILIZER_SPACINGS) {
        if (unit >= entry.minUnit) return entry.spacingMm
    }
    return null
}

const buildRectangle = (centerX: number, centerY: number, width: number, height: number, kerf: number) => {
    const halfWidth = width / 2 - kerf / 2
    const halfHeight = height / 2 - kerf / 2
    return [
        { x: centerX - halfWidth, y: centerY - halfHeight },
        { x: centerX + halfWidth, y: centerY - halfHeight },
        { x: centerX + halfWidth, y: centerY + halfHeight },
        { x: centerX - halfWidth, y: centerY + halfHeight },
    ]
}

const buildMxOpenCutout = (width: number, height: number, kerf: number) => {
    const halfWidth = width / 2 - kerf / 2
    const halfHeight = height / 2 - kerf / 2
    const notchOuter = width / 2 + MX_OPEN_NOTCH_DEPTH_MM - kerf / 2
    const notchHalf = MX_OPEN_NOTCH_HEIGHT_MM / 2 - kerf / 2
    return [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: -notchHalf },
        { x: notchOuter, y: -notchHalf },
        { x: notchOuter, y: notchHalf },
        { x: halfWidth, y: notchHalf },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
        { x: -halfWidth, y: notchHalf },
        { x: -notchOuter, y: notchHalf },
        { x: -notchOuter, y: -notchHalf },
        { x: -halfWidth, y: -notchHalf },
    ]
}

const resolveSwitchSize = (options: PlateOptions) => {
    const base = SWITCH_CUTOUT_DEFAULTS[options.cutout]
    return { width: options.switchCutoutWidth ?? base.width, height: options.switchCutoutHeight ?? base.height }
}

const buildSwitchCutout = (options: PlateOptions) => {
    const { width, height } = resolveSwitchSize(options)
    if (options.cutout === 'mx-open') return [buildMxOpenCutout(width, height, options.kerf)]
    return [buildRectangle(0, 0, width, height, options.kerf)]
}

const buildEncoderCutout = (kerf: number) => {
    const radius = ENCODER_CUTOUT_RADIUS_MM - kerf / 2
    const polygon: Point[] = []
    for (let segment = 0; segment < ENCODER_CUTOUT_SEGMENTS; segment++) {
        const angleRad = (segment / ENCODER_CUTOUT_SEGMENTS) * FULL_CIRCLE_RADIANS
        polygon.push({ x: roundCoordinate(radius * Math.cos(angleRad)), y: roundCoordinate(radius * Math.sin(angleRad)) })
    }
    return [polygon]
}

const buildStabilizerSlots = (unit: number, rotate90: boolean, style: Exclude<PlateOptions['stabilizer'], 'none'>, kerf: number) => {
    const spacing = getStabilizerSpacingMm(unit)
    if (spacing == null) return []
    const dimensions = STABILIZER_STYLES[style]
    const slotCenterY = dimensions.slotHeight / 2 - dimensions.topAboveCenter
    const slots = [
        buildRectangle(-spacing, slotCenterY, dimensions.slotWidth, dimensions.slotHeight, kerf),
        buildRectangle(spacing, slotCenterY, dimensions.slotWidth, dimensions.slotHeight, kerf),
    ]
    if (!rotate90) return slots
    return slots.map((slot) => slot.map((point) => rotatePoint(point, ORIGIN, STAB_ROTATED_ANGLE_DEG)))
}

export const isKeyStabilized = (key: KleKey, options: PlateOptions) =>
    !isEncoderKey(key) && options.stabilizer !== 'none' && (key.width >= STAB_MIN_UNIT || key.height >= STAB_MIN_UNIT)

const buildKeyStabilizers = (key: KleKey, options: PlateOptions) => {
    if (options.stabilizer === 'none') return []
    if (key.width >= STAB_MIN_UNIT) return buildStabilizerSlots(key.width, false, options.stabilizer, options.kerf)
    if (key.height >= STAB_MIN_UNIT) return buildStabilizerSlots(key.height, true, options.stabilizer, options.kerf)
    return []
}

const placeLocalPolygons = (polygons: Point[][], angleDeg: number, center: Point) =>
    polygons.map((polygon) =>
        polygon.map((point) => {
            const rotated = rotatePoint(point, ORIGIN, angleDeg)
            return { x: rotated.x + center.x, y: rotated.y + center.y }
        }),
    )

const buildKeyHoles = (key: KleKey, options: PlateOptions) => {
    const center = getKeyCenterMm(key)
    if (isEncoderKey(key)) return placeLocalPolygons(buildEncoderCutout(options.kerf), key.rotationAngle, center)
    const switchHoles = placeLocalPolygons(buildSwitchCutout(options), key.rotationAngle + key.switchRotation, center)
    const stabilizerHoles = placeLocalPolygons(buildKeyStabilizers(key, options), key.rotationAngle + key.stabRotation, center)
    return [...switchHoles, ...stabilizerHoles]
}

const buildRoundedRectangleOutline = (left: number, top: number, right: number, bottom: number, cornerRadius: number) => {
    const width = right - left
    const height = bottom - top
    const radius = Math.max(0, Math.min(cornerRadius, width / 2, height / 2))
    if (radius <= 0) {
        return [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
        ]
    }
    const corners = [
        { centerX: right - radius, centerY: top + radius, startAngleDeg: -RIGHT_ANGLE_DEG },
        { centerX: right - radius, centerY: bottom - radius, startAngleDeg: 0 },
        { centerX: left + radius, centerY: bottom - radius, startAngleDeg: RIGHT_ANGLE_DEG },
        { centerX: left + radius, centerY: top + radius, startAngleDeg: 2 * RIGHT_ANGLE_DEG },
    ]
    const outline: Point[] = []
    for (const corner of corners) {
        for (let segment = 0; segment <= CORNER_SEGMENTS; segment++) {
            const angleDeg = corner.startAngleDeg + (RIGHT_ANGLE_DEG * segment) / CORNER_SEGMENTS
            const angleRad = angleDeg * DEGREES_TO_RADIANS
            outline.push({
                x: roundCoordinate(corner.centerX + radius * Math.cos(angleRad)),
                y: roundCoordinate(corner.centerY + radius * Math.sin(angleRad)),
            })
        }
    }
    return outline
}

const buildOutline = (keys: KleKey[], options: PlateOptions) => {
    const bounds = getKeyboardBoundsU(keys)
    const growX = options.edgeMarginX + options.kerf / 2
    const growY = options.edgeMarginY + options.kerf / 2
    const left = bounds.minX * KEY_UNIT_MM - growX
    const top = bounds.minY * KEY_UNIT_MM - growY
    const right = bounds.maxX * KEY_UNIT_MM + growX
    const bottom = bounds.maxY * KEY_UNIT_MM + growY
    return { outline: buildRoundedRectangleOutline(left, top, right, bottom, options.cornerRadius), widthMm: right - left, heightMm: bottom - top }
}

export const getUsableKeys = (keys: KleKey[]) => keys.filter((key) => !key.decal && !key.ghost)

export const signedArea = (points: Point[]) => {
    let sum = 0
    for (let index = 0; index < points.length; index++) {
        const current = points[index]
        const next = points[(index + 1) % points.length]
        sum += current.x * next.y - next.x * current.y
    }
    return sum / 2
}

export const toCounterClockwise = (points: Point[]) => (signedArea(points) < 0 ? [...points].reverse() : points)

export const buildPlate = (keys: KleKey[], options: PlateOptions): PlateGeometry => {
    const usableKeys = getUsableKeys(keys)
    const holes = usableKeys.flatMap((key) => buildKeyHoles(key, options))
    const { outline, widthMm, heightMm } = buildOutline(usableKeys, options)
    return { outline, holes, widthMm, heightMm }
}
