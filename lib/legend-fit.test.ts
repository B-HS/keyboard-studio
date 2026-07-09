import { describe, expect, test } from 'vitest'
import { estimateTextWidthEm, fitFontSize, wrapAndFit } from './legend-fit'

describe('estimateTextWidthEm', () => {
    test('returns zero for an empty string', () => {
        expect(estimateTextWidthEm('')).toBe(0)
    })

    test('uses the average width for regular characters', () => {
        expect(estimateTextWidthEm('AAAA')).toBeCloseTo(2.48, 10)
    })

    test('gives narrow glyphs less width than wide glyphs', () => {
        expect(estimateTextWidthEm('iiii')).toBeLessThan(estimateTextWidthEm('AAAA'))
        expect(estimateTextWidthEm('mmmm')).toBeGreaterThan(estimateTextWidthEm('AAAA'))
    })

    test('grows monotonically as text lengthens', () => {
        expect(estimateTextWidthEm('Caps Lock')).toBeGreaterThan(estimateTextWidthEm('Caps'))
    })
})

describe('wrapAndFit', () => {
    test('wraps a two-word label onto two lines instead of shrinking', () => {
        const result = wrapAndFit({ text: 'Caps Lock', maxWidthPx: 47.5, fontSizePx: 12, maxLines: 3, minFontSizePx: 7 })
        expect(result.lines).toEqual(['Caps', 'Lock'])
        expect(result.fontSizePx).toBe(12)
    })

    test('keeps a short label on a single line at full size', () => {
        const result = wrapAndFit({ text: 'Enter', maxWidthPx: 100, fontSizePx: 12, maxLines: 3, minFontSizePx: 7 })
        expect(result.lines).toEqual(['Enter'])
        expect(result.fontSizePx).toBe(12)
    })

    test('scales a single overflowing word down to a minimum instead of clipping', () => {
        const result = wrapAndFit({ text: 'Backspace', maxWidthPx: 40, fontSizePx: 12, maxLines: 3, minFontSizePx: 7 })
        expect(result.lines).toEqual(['Backspace'])
        expect(result.fontSizePx).toBeLessThan(12)
        expect(result.fontSizePx).toBeGreaterThanOrEqual(7)
        expect(estimateTextWidthEm('Backspace') * result.fontSizePx).toBeLessThanOrEqual(40)
    })

    test('never emits a font smaller than the minimum', () => {
        const result = wrapAndFit({ text: 'Wwwwwwwwwwwwwwww', maxWidthPx: 10, fontSizePx: 12, maxLines: 3, minFontSizePx: 7 })
        expect(result.fontSizePx).toBe(7)
    })

    test('respects the maximum line budget', () => {
        const result = wrapAndFit({ text: 'one two three four five', maxWidthPx: 24, fontSizePx: 12, maxLines: 2, minFontSizePx: 7 })
        expect(result.lines.length).toBeLessThanOrEqual(2)
    })

    test('returns the text unchanged when there is no width budget', () => {
        const result = wrapAndFit({ text: 'Caps Lock', maxWidthPx: 0, fontSizePx: 12, maxLines: 3, minFontSizePx: 7 })
        expect(result.lines).toEqual(['Caps Lock'])
        expect(result.fontSizePx).toBe(12)
    })

    test('is deterministic across repeated calls', () => {
        const params = { text: 'Backspace', maxWidthPx: 40, fontSizePx: 12, maxLines: 3, minFontSizePx: 7 } as const
        expect(wrapAndFit({ ...params })).toEqual(wrapAndFit({ ...params }))
    })
})

describe('fitFontSize', () => {
    test('shrinks explicit lines so the widest one fits', () => {
        const result = fitFontSize({ lines: ['AAAAAAAAAA'], maxWidthPx: 31, fontSizePx: 12, minFontSizePx: 7 })
        expect(result).toBe(7)
    })

    test('keeps the base size when every line already fits', () => {
        const result = fitFontSize({ lines: ['A', 'B'], maxWidthPx: 200, fontSizePx: 12, minFontSizePx: 7 })
        expect(result).toBe(12)
    })

    test('returns the base size when there is no width budget', () => {
        expect(fitFontSize({ lines: ['Caps'], maxWidthPx: 0, fontSizePx: 12, minFontSizePx: 7 })).toBe(12)
    })
})
