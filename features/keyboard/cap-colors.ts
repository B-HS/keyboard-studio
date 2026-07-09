type Rgb = { r: number; g: number; b: number }

const HEX_SHORTHAND_PATTERN = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_FULL_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const CHANNEL_MIN = 0
const CHANNEL_MAX = 255
const READABLE_LUMINANCE_THRESHOLD = 0.6
const LUMINANCE_RED_WEIGHT = 0.299
const LUMINANCE_GREEN_WEIGHT = 0.587
const LUMINANCE_BLUE_WEIGHT = 0.114
const BLACK_TEXT = '#000000'
const WHITE_TEXT = '#ffffff'

export const parseColor = (input: string) => {
    const value = input.trim()
    const shorthand = HEX_SHORTHAND_PATTERN.exec(value)
    if (shorthand)
        return {
            r: parseInt(shorthand[1] + shorthand[1], 16),
            g: parseInt(shorthand[2] + shorthand[2], 16),
            b: parseInt(shorthand[3] + shorthand[3], 16),
        }
    const full = HEX_FULL_PATTERN.exec(value)
    if (full) return { r: parseInt(full[1], 16), g: parseInt(full[2], 16), b: parseInt(full[3], 16) }
    return null
}

const clampChannel = (channel: number) => Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, Math.round(channel)))

const toHex = (rgb: Rgb) => `#${[rgb.r, rgb.g, rgb.b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`

const scaleChannels = (color: string, factor: number) => {
    const rgb = parseColor(color)
    if (!rgb) return color
    return toHex({ r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor })
}

export const darken = (color: string, factor: number) => scaleChannels(color, factor)

export const lighten = (color: string, factor: number) => scaleChannels(color, factor)

export const readableTextFallback = (background: string) => {
    const rgb = parseColor(background)
    if (!rgb) return BLACK_TEXT
    const luminance = (LUMINANCE_RED_WEIGHT * rgb.r + LUMINANCE_GREEN_WEIGHT * rgb.g + LUMINANCE_BLUE_WEIGHT * rgb.b) / CHANNEL_MAX
    return luminance > READABLE_LUMINANCE_THRESHOLD ? BLACK_TEXT : WHITE_TEXT
}
