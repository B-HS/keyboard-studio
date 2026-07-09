const DEFAULT_CHAR_WIDTH_EM = 0.62
const NARROW_CHAR_WIDTH_EM = 0.3
const WIDE_CHAR_WIDTH_EM = 0.92
const NARROW_CHARS = new Set(" ijltfrI.,:;!|'`()[]{}")
const WIDE_CHARS = new Set('mwMW@%')
const FONT_SCALE_STEP = 0.94
const MAX_FIT_ITERATIONS = 48
const FONT_ROUND_DECIMALS = 4
const WHITESPACE_PATTERN = /\s+/

const roundFont = (value: number) => Number(value.toFixed(FONT_ROUND_DECIMALS))

export const estimateTextWidthEm = (text: string) => {
    let total = 0
    for (const char of text) {
        if (WIDE_CHARS.has(char)) total += WIDE_CHAR_WIDTH_EM
        else if (NARROW_CHARS.has(char)) total += NARROW_CHAR_WIDTH_EM
        else total += DEFAULT_CHAR_WIDTH_EM
    }
    return total
}

const wrapWords = (words: string[], maxWidthEm: number, maxLines: number) => {
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        if (lines.length >= maxLines - 1) {
            current = current ? `${current} ${word}` : word
            continue
        }
        const candidate = current ? `${current} ${word}` : word
        if (current && estimateTextWidthEm(candidate) > maxWidthEm) {
            lines.push(current)
            current = word
        } else {
            current = candidate
        }
    }
    lines.push(current)
    return lines
}

const everyLineFits = (lines: string[], maxWidthPx: number, fontSizePx: number) =>
    lines.every((line) => estimateTextWidthEm(line) * fontSizePx <= maxWidthPx)

type WrapAndFitParams = {
    text: string
    maxWidthPx: number
    fontSizePx: number
    maxLines: number
    minFontSizePx: number
}

export const wrapAndFit = ({ text, maxWidthPx, fontSizePx, maxLines, minFontSizePx }: WrapAndFitParams) => {
    const words = text.split(WHITESPACE_PATTERN).filter((word) => word.length > 0)
    if (words.length === 0 || maxWidthPx <= 0) return { lines: [text], fontSizePx: roundFont(fontSizePx) }
    let size = fontSizePx
    let lines = wrapWords(words, maxWidthPx / size, maxLines)
    let iterations = 0
    while (!everyLineFits(lines, maxWidthPx, size) && size > minFontSizePx && iterations < MAX_FIT_ITERATIONS) {
        size = Math.max(minFontSizePx, size * FONT_SCALE_STEP)
        lines = wrapWords(words, maxWidthPx / size, maxLines)
        iterations += 1
    }
    return { lines, fontSizePx: roundFont(size) }
}

type FitFontSizeParams = {
    lines: string[]
    maxWidthPx: number
    fontSizePx: number
    minFontSizePx: number
}

export const fitFontSize = ({ lines, maxWidthPx, fontSizePx, minFontSizePx }: FitFontSizeParams) => {
    if (maxWidthPx <= 0) return roundFont(fontSizePx)
    const widestEm = Math.max(...lines.map(estimateTextWidthEm))
    if (widestEm <= 0) return roundFont(fontSizePx)
    const fitted = Math.min(fontSizePx, maxWidthPx / widestEm)
    return roundFont(Math.max(minFontSizePx, fitted))
}
