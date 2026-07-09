import { describe, expect, test } from 'vitest'
import { clampToRange, formatNumeric, LABEL_SLOT_COUNT, normalizeHexColor, parseNumericInput, setLabelSlot, sharedValue } from './kle-field'

describe('parseNumericInput', () => {
    test('parses valid numbers including negatives and decimals', () => {
        expect(parseNumericInput('1.25')).toBe(1.25)
        expect(parseNumericInput('-180')).toBe(-180)
        expect(parseNumericInput('  0.5  ')).toBe(0.5)
    })

    test('returns null for empty and non-numeric input', () => {
        expect(parseNumericInput('')).toBeNull()
        expect(parseNumericInput('   ')).toBeNull()
        expect(parseNumericInput('-')).toBeNull()
        expect(parseNumericInput('abc')).toBeNull()
        expect(parseNumericInput('NaN')).toBeNull()
        expect(parseNumericInput('Infinity')).toBeNull()
    })
})

describe('clampToRange', () => {
    test('clamps to provided bounds', () => {
        expect(clampToRange(0.1, 0.25)).toBe(0.25)
        expect(clampToRange(200, -180, 180)).toBe(180)
        expect(clampToRange(-200, -180, 180)).toBe(-180)
    })

    test('leaves value untouched when in range or unbounded', () => {
        expect(clampToRange(5, 0.25)).toBe(5)
        expect(clampToRange(-3)).toBe(-3)
    })
})

describe('formatNumeric', () => {
    test('formats numbers and normalizes negative zero', () => {
        expect(formatNumeric(1.25)).toBe('1.25')
        expect(formatNumeric(-0)).toBe('0')
        expect(formatNumeric(0)).toBe('0')
    })
})

describe('normalizeHexColor', () => {
    test('expands shorthand and lowercases full hex', () => {
        expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
        expect(normalizeHexColor('#FF0088')).toBe('#ff0088')
        expect(normalizeHexColor('  #123456 ')).toBe('#123456')
    })

    test('returns null for invalid hex', () => {
        expect(normalizeHexColor('red')).toBeNull()
        expect(normalizeHexColor('#12')).toBeNull()
        expect(normalizeHexColor('')).toBeNull()
    })
})

describe('setLabelSlot', () => {
    test('writes a slot immutably and pads to the label slot count', () => {
        const next = setLabelSlot<string>([], 4, 'X')
        expect(next.length).toBe(LABEL_SLOT_COUNT)
        expect(next[4]).toBe('X')
        expect(next[0]).toBeNull()
    })

    test('does not mutate the source array', () => {
        const source: (string | null)[] = ['A', null, 'C']
        const next = setLabelSlot(source, 1, 'B')
        expect(source[1]).toBeNull()
        expect(next[1]).toBe('B')
        expect(next[0]).toBe('A')
        expect(next[2]).toBe('C')
    })

    test('clears a slot with null', () => {
        const next = setLabelSlot<number>([1, 2, 3], 2, null)
        expect(next[2]).toBeNull()
        expect(next[0]).toBe(1)
    })
})

describe('sharedValue', () => {
    test('returns the common value when all match', () => {
        expect(sharedValue(['#fff', '#fff', '#fff'])).toBe('#fff')
        expect(sharedValue([true, true])).toBe(true)
        expect(sharedValue([3])).toBe(3)
    })

    test('returns null when values differ or the list is empty', () => {
        expect(sharedValue(['#fff', '#000'])).toBeNull()
        expect(sharedValue([true, false])).toBeNull()
        expect(sharedValue([])).toBeNull()
    })
})
