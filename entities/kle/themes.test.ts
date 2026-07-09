import { describe, expect, test } from 'vitest'
import { parseKle } from './parse'
import { applyColorTheme, COLOR_THEMES } from './themes'

const HEX = /^#[0-9a-f]{6}$/
const [FIRST_THEME] = COLOR_THEMES

const SWATCH_GROUPS = ['alpha', 'modifier', 'accent'] as const

describe('COLOR_THEMES catalog', () => {
    test('ships six curated themes with unique ids', () => {
        expect(COLOR_THEMES.length).toBe(6)
        expect(new Set(COLOR_THEMES.map((theme) => theme.id)).size).toBe(6)
    })

    test('every swatch cap and text is a valid 6-digit hex color', () => {
        for (const theme of COLOR_THEMES) {
            for (const group of SWATCH_GROUPS) {
                expect(theme[group].cap).toMatch(HEX)
                expect(theme[group].text).toMatch(HEX)
            }
        }
    })
})

describe('applyColorTheme classification', () => {
    test('single-character legends become alpha keys', () => {
        const keys = parseKle([['A', 'Z', '5']]).keys
        const themed = applyColorTheme(keys, FIRST_THEME)
        for (const key of themed) {
            expect(key.color).toBe(FIRST_THEME.alpha.cap)
            expect(key.defaults.textColor).toBe(FIRST_THEME.alpha.text)
        }
    })

    test('Esc and Enter legends become accent keys', () => {
        const keys = parseKle([['Esc', 'Enter']]).keys
        const themed = applyColorTheme(keys, FIRST_THEME)
        for (const key of themed) {
            expect(key.color).toBe(FIRST_THEME.accent.cap)
            expect(key.defaults.textColor).toBe(FIRST_THEME.accent.text)
        }
    })

    test('multi-character and blank legends become modifier keys', () => {
        const keys = parseKle([['Shift', 'Backspace', 'F1', '']]).keys
        const themed = applyColorTheme(keys, FIRST_THEME)
        for (const key of themed) {
            expect(key.color).toBe(FIRST_THEME.modifier.cap)
            expect(key.defaults.textColor).toBe(FIRST_THEME.modifier.text)
        }
    })

    test('decal and ghost keys are returned untouched by reference', () => {
        const keys = parseKle([['A', { d: true }, 'Decal', { g: true }, 'Ghost']]).keys
        const themed = applyColorTheme(keys, FIRST_THEME)
        expect(keys[1].decal).toBe(true)
        expect(keys[2].ghost).toBe(true)
        expect(themed[1]).toBe(keys[1])
        expect(themed[2]).toBe(keys[2])
        expect(themed[1].color).toBe(keys[1].color)
        expect(themed[2].color).toBe(keys[2].color)
        expect(themed[0].color).toBe(FIRST_THEME.alpha.cap)
    })
})

describe('applyColorTheme immutability', () => {
    test('does not mutate the input keys', () => {
        const keys = parseKle([['Esc', 'A', 'Shift']]).keys
        const snapshot = JSON.stringify(keys)
        applyColorTheme(keys, FIRST_THEME)
        expect(JSON.stringify(keys)).toBe(snapshot)
    })

    test('produces fresh objects, defaults and label arrays for themed keys', () => {
        const keys = parseKle([['A']]).keys
        const themed = applyColorTheme(keys, FIRST_THEME)
        expect(themed[0]).not.toBe(keys[0])
        expect(themed[0].defaults).not.toBe(keys[0].defaults)
        expect(themed[0].labels).not.toBe(keys[0].labels)
        expect(themed[0].textColor).not.toBe(keys[0].textColor)
        expect(themed[0].textSize).not.toBe(keys[0].textSize)
    })

    test('applies cleanly across every theme', () => {
        const keys = parseKle([['Esc', 'A', 'Shift', 'Enter']]).keys
        for (const theme of COLOR_THEMES) {
            const themed = applyColorTheme(keys, theme)
            expect(themed[0].color).toBe(theme.accent.cap)
            expect(themed[1].color).toBe(theme.alpha.cap)
            expect(themed[2].color).toBe(theme.modifier.cap)
            expect(themed[3].color).toBe(theme.accent.cap)
        }
    })
})
