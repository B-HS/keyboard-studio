import { describe, expect, test } from 'vitest'
import { isEncoderKey } from '@entities/kle/encoder'
import { getKeyCenterMm, rotatePoint } from '@entities/kle/geometry'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { KleKeyboard } from '@entities/kle/types'
import {
    DIODE_DO35_HALF_SPAN_MM,
    DIODE_DO35_PAD_DIAMETER_MM,
    DIODE_DO35_PAD_PITCH_MM,
    DIODE_PAD_HEIGHT_MM,
    DIODE_PAD_OFFSET_MM,
    DIODE_PAD_WIDTH_MM,
    ENCODER_PAD_A_POSITION_MM,
    ENCODER_PAD_B_POSITION_MM,
    ENCODER_PAD_C_POSITION_MM,
    ENCODER_PIN_PAD_DIAMETER_MM,
    ENCODER_SWITCH_PAD_ONE_POSITION_MM,
    ENCODER_SWITCH_PAD_TWO_POSITION_MM,
    STAB_POST_DIAMETER_MM,
    STAB_WIRE_DIAMETER_MM,
    SWITCH_CENTER_HOLE_DIAMETER_MM,
    SWITCH_FIXATION_PIN_DIAMETER_MM,
    SWITCH_FIXATION_PIN_OFFSET_MM,
    SWITCH_PIN_ONE_POSITION_MM,
    SWITCH_PIN_PAD_DIAMETER_MM,
    SWITCH_PIN_TWO_POSITION_MM,
} from '@entities/pcb/constants'
import { computePcbLayout } from '@entities/pcb/layout'
import { DEFAULT_PCB_OPTIONS, PcbOptions } from '@entities/pcb/types'
import { buildPcbPreview } from '@widgets/pcb-panel'

const MATRIX_LABEL_OFFSET_MM = 5
const CONTAINMENT_EPSILON = 1e-6

const withOptions = (overrides: Partial<PcbOptions>) => ({ ...DEFAULT_PCB_OPTIONS, ...overrides })

const rotatedWorldPoint = (base: { x: number; y: number }, offset: { x: number; y: number }, angleDeg: number) => {
    const rotated = rotatePoint(offset, { x: 0, y: 0 }, angleDeg)
    return { x: base.x + rotated.x, y: base.y + rotated.y }
}

const primitiveExtents = (keyboard: KleKeyboard, options: PcbOptions) => {
    const layout = computePcbLayout(keyboard, options)
    const { order, netlist, stabilizers, board } = layout
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const addCircle = (cx: number, cy: number, radius: number) => {
        minX = Math.min(minX, cx - radius)
        minY = Math.min(minY, cy - radius)
        maxX = Math.max(maxX, cx + radius)
        maxY = Math.max(maxY, cy + radius)
    }
    const addPoint = (x: number, y: number) => addCircle(x, y, 0)
    for (let ordinal = 0; ordinal < order.length; ordinal++) {
        const key = keyboard.keys[order[ordinal]]
        const center = getKeyCenterMm(key)
        const angle = key.rotationAngle + options.switchRotation + key.switchRotation
        const net = netlist.switchNets[ordinal]
        const encoderNet = netlist.encoderNets[ordinal]
        if (isEncoderKey(key) && encoderNet) {
            for (const offset of [
                ENCODER_PAD_A_POSITION_MM,
                ENCODER_PAD_B_POSITION_MM,
                ENCODER_PAD_C_POSITION_MM,
                ENCODER_SWITCH_PAD_ONE_POSITION_MM,
                ENCODER_SWITCH_PAD_TWO_POSITION_MM,
            ]) {
                const pad = rotatedWorldPoint(center, offset, angle)
                addCircle(pad.x, pad.y, ENCODER_PIN_PAD_DIAMETER_MM / 2)
            }
        } else {
            addCircle(center.x, center.y, SWITCH_CENTER_HOLE_DIAMETER_MM / 2)
            for (const sign of [-1, 1]) {
                const pin = rotatedWorldPoint(center, { x: sign * SWITCH_FIXATION_PIN_OFFSET_MM, y: 0 }, angle)
                addCircle(pin.x, pin.y, SWITCH_FIXATION_PIN_DIAMETER_MM / 2)
            }
            const padOne = rotatedWorldPoint(center, SWITCH_PIN_ONE_POSITION_MM, angle)
            const padTwo = rotatedWorldPoint(center, SWITCH_PIN_TWO_POSITION_MM, angle)
            addCircle(padOne.x, padOne.y, SWITCH_PIN_PAD_DIAMETER_MM / 2)
            addCircle(padTwo.x, padTwo.y, SWITCH_PIN_PAD_DIAMETER_MM / 2)
        }
        const diodeCenter = rotatedWorldPoint(center, { x: options.diodeOffsetXMm, y: options.diodeOffsetYMm }, angle)
        const do35Origin = rotatedWorldPoint(center, { x: options.diodeOffsetXMm - DIODE_DO35_HALF_SPAN_MM, y: options.diodeOffsetYMm }, angle)
        if (options.diode === 'do-35') {
            const junction = rotatedWorldPoint(do35Origin, { x: DIODE_DO35_PAD_PITCH_MM, y: 0 }, angle)
            addCircle(do35Origin.x, do35Origin.y, DIODE_DO35_PAD_DIAMETER_MM / 2)
            addCircle(junction.x, junction.y, DIODE_DO35_PAD_DIAMETER_MM / 2)
        } else {
            const halfWidth = DIODE_PAD_OFFSET_MM + DIODE_PAD_WIDTH_MM / 2
            const halfHeight = DIODE_PAD_HEIGHT_MM / 2
            for (const corner of [
                { x: -halfWidth, y: -halfHeight },
                { x: halfWidth, y: -halfHeight },
                { x: halfWidth, y: halfHeight },
                { x: -halfWidth, y: halfHeight },
            ]) {
                const world = rotatedWorldPoint(diodeCenter, corner, angle)
                addPoint(world.x, world.y)
            }
        }
        addPoint(center.x, center.y)
        addPoint(diodeCenter.x, diodeCenter.y)
        addPoint(center.x, center.y - MATRIX_LABEL_OFFSET_MM)
    }
    for (const stab of stabilizers) {
        stab.holes.forEach((hole, index) => addCircle(hole.x, hole.y, (index % 2 === 0 ? STAB_POST_DIAMETER_MM : STAB_WIRE_DIAMETER_MM) / 2))
    }
    return { minX, minY, maxX, maxY, board }
}

const ansi60 = () => parseKle(KLE_PRESETS[0].raw)
const encoderKeyboard = () => parseKle([['0,0', '0,1', { sm: 'rot_ec11' }, '0,2']])

const assertContained = (keyboard: KleKeyboard, options: PcbOptions) => {
    const extents = primitiveExtents(keyboard, options)
    const { substrate } = buildPcbPreview(keyboard, options)
    expect(substrate.left).toBeLessThanOrEqual(extents.minX + CONTAINMENT_EPSILON)
    expect(substrate.top).toBeLessThanOrEqual(extents.minY + CONTAINMENT_EPSILON)
    expect(substrate.right).toBeGreaterThanOrEqual(extents.maxX - CONTAINMENT_EPSILON)
    expect(substrate.bottom).toBeGreaterThanOrEqual(extents.maxY - CONTAINMENT_EPSILON)
}

describe('buildPcbPreview substrate bounds', () => {
    test('ansi-60 default footprints overflow a key-bounds-only substrate (bug reproduction)', () => {
        const extents = primitiveExtents(ansi60(), DEFAULT_PCB_OPTIONS)
        expect(extents.maxY).toBeGreaterThan(extents.board.bottom)
    })

    test('ansi-60 default substrate contains every rendered primitive', () => {
        assertContained(ansi60(), DEFAULT_PCB_OPTIONS)
    })

    test('substrate hugs the outermost primitive within the visual padding', () => {
        const extents = primitiveExtents(ansi60(), DEFAULT_PCB_OPTIONS)
        const { substrate } = buildPcbPreview(ansi60(), DEFAULT_PCB_OPTIONS)
        expect(substrate.bottom - extents.maxY).toBeCloseTo(2, 6)
    })

    test('containment holds across option and rotation combinations', () => {
        assertContained(ansi60(), withOptions({ diode: 'sod-123' }))
        assertContained(ansi60(), withOptions({ switchRotation: 90 }))
        assertContained(ansi60(), withOptions({ switchRotation: 270, diode: 'sod-123' }))
        assertContained(ansi60(), withOptions({ diodeOffsetYMm: 12 }))
    })

    test('containment holds for presets and encoder keyboards', () => {
        for (const preset of KLE_PRESETS) assertContained(parseKle(preset.raw), DEFAULT_PCB_OPTIONS)
        assertContained(encoderKeyboard(), DEFAULT_PCB_OPTIONS)
        assertContained(encoderKeyboard(), withOptions({ switchRotation: 180 }))
    })

    test('viewBox is four numbers enclosing the substrate', () => {
        const { substrate, viewBox } = buildPcbPreview(ansi60(), DEFAULT_PCB_OPTIONS)
        const parts = viewBox.split(' ').map(Number)
        expect(parts).toHaveLength(4)
        expect(parts.every((value) => Number.isFinite(value))).toBe(true)
        const [minX, minY, boxWidth, boxHeight] = parts
        expect(minX).toBeLessThanOrEqual(substrate.left)
        expect(minY).toBeLessThanOrEqual(substrate.top)
        expect(minX + boxWidth).toBeGreaterThanOrEqual(substrate.right)
        expect(minY + boxHeight).toBeGreaterThanOrEqual(substrate.bottom)
    })
})
