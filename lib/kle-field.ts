export const LABEL_SLOT_COUNT = 12

const HEX_SHORTHAND_PATTERN = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_FULL_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

export const parseNumericInput = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const value = Number(trimmed)
    if (!Number.isFinite(value)) return null
    return value
}

export const clampToRange = (value: number, min?: number, max?: number) => {
    let result = value
    if (min !== undefined && result < min) result = min
    if (max !== undefined && result > max) result = max
    return result
}

export const formatNumeric = (value: number) => (Object.is(value, -0) ? '0' : String(value))

export const normalizeHexColor = (raw: string) => {
    const value = raw.trim().toLowerCase()
    const shorthand = HEX_SHORTHAND_PATTERN.exec(value)
    if (shorthand) return `#${shorthand[1]}${shorthand[1]}${shorthand[2]}${shorthand[2]}${shorthand[3]}${shorthand[3]}`
    if (HEX_FULL_PATTERN.test(value)) return value
    return null
}

export const setLabelSlot = <TValue>(source: (TValue | null)[], index: number, value: TValue | null) =>
    Array.from({ length: Math.max(LABEL_SLOT_COUNT, source.length) }, (_, slot) => (slot === index ? value : (source[slot] ?? null)))

export const sharedValue = <TValue>(values: TValue[]) => {
    if (values.length === 0) return null
    const first = values[0]
    for (let index = 1; index < values.length; index++) if (values[index] !== first) return null
    return first
}
