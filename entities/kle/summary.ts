import { isEncoderKey } from '@entities/kle/encoder'
import { getKeyboardBoundsU, KEY_UNIT_MM } from '@entities/kle/geometry'
import { KleKey, KleKeyboard } from '@entities/kle/types'
import { assignMatrix } from '@entities/pcb/matrix'
import { orderPhysicalKeys } from '@entities/pcb/netlist'
import { getUsableKeys } from '@entities/plate/generate'

const STAB_MIN_UNIT = 2
const STABILIZER_SIZE_UNITS = [8, 7, 6.5, 6.25, 6, 4, 3, 2]

const roundUnit = (value: number) => Number(value.toFixed(3))

const stabilizerSizeUnit = (unit: number) => {
    for (const size of STABILIZER_SIZE_UNITS) if (unit >= size) return size
    return null
}

const keyStabilizerUnit = (key: KleKey) => {
    if (isEncoderKey(key)) return null
    if (key.width >= STAB_MIN_UNIT) return stabilizerSizeUnit(key.width)
    if (key.height >= STAB_MIN_UNIT) return stabilizerSizeUnit(key.height)
    return null
}

export const buildKeyboardSummary = (keyboard: KleKeyboard) => {
    const usableKeys = getUsableKeys(keyboard.keys)
    const switches = usableKeys.filter((key) => !isEncoderKey(key))
    const encoders = usableKeys.filter((key) => isEncoderKey(key))

    const keycapCounts = new Map<string, { widthU: number; heightU: number; count: number }>()
    for (const key of switches) {
        const widthU = roundUnit(key.width)
        const heightU = roundUnit(key.height)
        const id = `${widthU}x${heightU}`
        const existing = keycapCounts.get(id)
        if (existing) existing.count++
        else keycapCounts.set(id, { widthU, heightU, count: 1 })
    }
    const keycaps = Array.from(keycapCounts.values()).sort((left, right) => left.widthU - right.widthU || left.heightU - right.heightU)

    const stabilizerCounts = new Map<number, number>()
    for (const key of switches) {
        const unit = keyStabilizerUnit(key)
        if (unit === null) continue
        stabilizerCounts.set(unit, (stabilizerCounts.get(unit) ?? 0) + 1)
    }
    const stabilizers = Array.from(stabilizerCounts.entries())
        .map(([sizeU, count]) => ({ sizeU, label: `${sizeU}u`, count }))
        .sort((left, right) => left.sizeU - right.sizeU)

    const matrix = assignMatrix(keyboard.keys)
    const diodeCount = orderPhysicalKeys(matrix).length
    const bounds = getKeyboardBoundsU(usableKeys)

    return {
        totalKeys: keyboard.keys.length,
        switchCount: switches.length,
        encoderCount: encoders.length,
        diodeCount,
        keycaps,
        stabilizers,
        widthU: roundUnit(bounds.width),
        heightU: roundUnit(bounds.height),
        widthMm: roundUnit(bounds.width * KEY_UNIT_MM),
        heightMm: roundUnit(bounds.height * KEY_UNIT_MM),
        rows: matrix.rows,
        cols: matrix.cols,
    }
}

export type KeyboardSummary = ReturnType<typeof buildKeyboardSummary>

export const renderKeyboardSummaryText = (summary: KeyboardSummary) => {
    const lines = [
        'Keyboard build summary',
        '======================',
        '',
        `Total keys: ${summary.totalKeys}`,
        `Switches: ${summary.switchCount}`,
        `Rotary encoders: ${summary.encoderCount}`,
        `Diodes: ${summary.diodeCount}`,
        `Matrix: ${summary.rows} x ${summary.cols}`,
        `Layout size: ${summary.widthU.toFixed(2)} x ${summary.heightU.toFixed(2)} u (${summary.widthMm.toFixed(1)} x ${summary.heightMm.toFixed(1)} mm)`,
        '',
        'Keycap inventory',
        '----------------',
    ]
    if (summary.keycaps.length === 0) lines.push('None')
    else for (const cap of summary.keycaps) lines.push(`${cap.widthU}u x ${cap.heightU}u: ${cap.count}`)
    lines.push('', 'Stabilizers', '-----------')
    if (summary.stabilizers.length === 0) lines.push('None')
    else for (const stab of summary.stabilizers) lines.push(`${stab.label}: ${stab.count}`)
    lines.push('')
    return lines.join('\n')
}
