import { isEncoderKey } from '@entities/kle/encoder'
import { getKeyboardBoundsU, getKeyCenterMm, KEY_UNIT_MM, rotatePoint } from '@entities/kle/geometry'
import { KleKey, KleKeyboard } from '@entities/kle/types'
import {
    DIODE_DO35_HALF_SPAN_MM,
    DIODE_DO35_PAD_PITCH_MM,
    MOUNTING_HOLE_INSET_MM,
    STAB_BASE_OFFSET_MM,
    STAB_HOLE_BOTTOM_Y_MM,
    STAB_HOLE_TOP_Y_MM,
    STAB_SIZE_TABLE,
} from '@entities/pcb/constants'
import { assignMatrix } from '@entities/pcb/matrix'
import { buildNetlist, orderPhysicalKeys } from '@entities/pcb/netlist'
import { PcbOptions } from '@entities/pcb/types'

const ORIGIN = { x: 0, y: 0 }
const SIZE_EPSILON = 0.001
const SWITCH_SELECTION_SIZES = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]
const HTML_TAG_PATTERN = /<[^>]*>/g

const sizeLabel = (size: number) => `${size.toFixed(2)}u`

const worldOffset = (base: { x: number; y: number }, offset: { x: number; y: number }, angleDeg: number) => {
    const rotated = rotatePoint(offset, ORIGIN, angleDeg)
    return { x: base.x + rotated.x, y: base.y + rotated.y }
}

const keyEffectiveSize = (key: KleKey) => {
    if (key.height >= 2 && key.width < 2) return { size: key.height, vertical: true }
    return { size: key.width, vertical: false }
}

const selectSwitchSize = (effectiveSize: number) => {
    let chosen = SWITCH_SELECTION_SIZES[0]
    for (const candidate of SWITCH_SELECTION_SIZES) {
        if (candidate <= effectiveSize + SIZE_EPSILON) chosen = candidate
    }
    return chosen
}

const switchFootprintKey = (key: KleKey) => {
    const { size, vertical } = keyEffectiveSize(key)
    return `${sizeLabel(selectSwitchSize(size))}${vertical ? '_90deg' : ''}`
}

const deriveSwitchValue = (key: KleKey) => {
    const primaryLegend = key.labels[0] ?? ''
    const stripped = primaryLegend.replace(HTML_TAG_PATTERN, '').replace(/\s+/g, ' ').trim()
    return stripped.length > 0 ? stripped : 'SW'
}

const selectStabPlan = (effectiveSize: number) => {
    if (effectiveSize < 3) return { size: 2, offset: STAB_BASE_OFFSET_MM, base: true }
    if (effectiveSize >= STAB_SIZE_TABLE[STAB_SIZE_TABLE.length - 1].size) {
        const entry = STAB_SIZE_TABLE[STAB_SIZE_TABLE.length - 1]
        return { size: entry.size, offset: entry.offset, base: false }
    }
    let best = STAB_SIZE_TABLE[0]
    for (const entry of STAB_SIZE_TABLE) {
        if (Math.abs(entry.size - effectiveSize) <= Math.abs(best.size - effectiveSize)) best = entry
    }
    return { size: best.size, offset: best.offset, base: false }
}

const buildStabHoles = (center: { x: number; y: number }, angleDeg: number, offset: number) =>
    [
        { x: -offset, y: STAB_HOLE_TOP_Y_MM },
        { x: -offset, y: STAB_HOLE_BOTTOM_Y_MM },
        { x: offset, y: STAB_HOLE_TOP_Y_MM },
        { x: offset, y: STAB_HOLE_BOTTOM_Y_MM },
    ].map((local) => worldOffset(center, local, angleDeg))

export const computePcbLayout = (keyboard: KleKeyboard, options: PcbOptions) => {
    const matrix = assignMatrix(keyboard.keys)
    const encoderFlags = keyboard.keys.map((key) => isEncoderKey(key))
    const netlist = buildNetlist(matrix, encoderFlags)
    const order = orderPhysicalKeys(matrix)
    const physicalKeys = order.map((keyIndex) => keyboard.keys[keyIndex])

    const margin = options.includeOutline ? options.edgeMargin : 0
    const bounds = getKeyboardBoundsU(physicalKeys)
    const contentLeft = bounds.minX * KEY_UNIT_MM - margin
    const contentTop = bounds.minY * KEY_UNIT_MM - margin
    const contentRight = bounds.maxX * KEY_UNIT_MM + margin
    const contentBottom = bounds.maxY * KEY_UNIT_MM + margin

    const board = {
        left: contentLeft,
        top: contentTop,
        right: contentRight,
        bottom: contentBottom,
    }

    const switches = order.map((keyIndex, ordinal) => {
        const key = keyboard.keys[keyIndex]
        const center = getKeyCenterMm(key)
        const switchNet = netlist.switchNets[ordinal]
        const switchAngle = key.rotationAngle + options.switchRotation + key.switchRotation
        return {
            keyIndex,
            reference: `SW${ordinal + 1}`,
            value: deriveSwitchValue(key),
            footprintKey: switchFootprintKey(key),
            isEncoder: encoderFlags[keyIndex],
            center,
            angle: -switchAngle,
            colNet: switchNet.colNet,
            junctionNet: switchNet.junctionNet,
            rowNet: switchNet.rowNet,
        }
    })

    const diodes = order.map((keyIndex, ordinal) => {
        const key = keyboard.keys[keyIndex]
        const center = getKeyCenterMm(key)
        const switchNet = netlist.switchNets[ordinal]
        const switchAngle = key.rotationAngle + options.switchRotation + key.switchRotation
        const diodeCenter = worldOffset(center, { x: options.diodeOffsetXMm, y: options.diodeOffsetYMm }, switchAngle)
        const origin = worldOffset(center, { x: options.diodeOffsetXMm - DIODE_DO35_HALF_SPAN_MM, y: options.diodeOffsetYMm }, switchAngle)
        return {
            reference: `D${ordinal + 1}`,
            center: diodeCenter,
            origin,
            angle: -switchAngle,
            rowNet: switchNet.rowNet,
            junctionNet: switchNet.junctionNet,
            pads: [
                { name: '1', x: 0, y: 0, net: switchNet.rowNet },
                { name: '2', x: DIODE_DO35_PAD_PITCH_MM, y: 0, net: switchNet.junctionNet },
            ],
        }
    })

    const stabilizers = options.stabFootprints
        ? order.flatMap((keyIndex) => {
              const key = keyboard.keys[keyIndex]
              const { size, vertical } = keyEffectiveSize(key)
              if (size < 2) return []
              const plan = selectStabPlan(size)
              const center = getKeyCenterMm(key)
              const angle = -key.rotationAngle - key.stabRotation + (vertical ? 90 : 0)
              return [
                  {
                      center,
                      angle,
                      offset: plan.offset,
                      base: plan.base,
                      sizeLabel: sizeLabel(plan.size),
                      holes: buildStabHoles(center, angle, plan.offset),
                  },
              ]
          })
        : []

    const mountingHoles = options.mountingHoles
        ? [
              { x: board.left + MOUNTING_HOLE_INSET_MM, y: board.top + MOUNTING_HOLE_INSET_MM },
              { x: board.right - MOUNTING_HOLE_INSET_MM, y: board.top + MOUNTING_HOLE_INSET_MM },
              { x: board.left + MOUNTING_HOLE_INSET_MM, y: board.bottom - MOUNTING_HOLE_INSET_MM },
              { x: board.right - MOUNTING_HOLE_INSET_MM, y: board.bottom - MOUNTING_HOLE_INSET_MM },
          ]
        : []

    return {
        matrix,
        netlist,
        order,
        physicalKeys,
        board,
        switches,
        diodes,
        stabilizers,
        mountingHoles,
    }
}
