import { describe, expect, test } from 'vitest'
import { parseKle } from './parse'
import { KLE_PRESETS } from './presets'

describe('KLE_PRESETS registry', () => {
    test('exposes the known preset ids with no duplicates', () => {
        const ids = KLE_PRESETS.map((preset) => preset.id)
        expect(ids).toEqual(['ansi-60', 'iso-60', 'ansi-tkl', 'ansi-104', 'ortho-40', 'alice'])
        expect(new Set(ids).size).toBe(ids.length)
    })

    test('gives every preset a non-empty display name', () => {
        for (const preset of KLE_PRESETS) expect(preset.name.length).toBeGreaterThan(0)
    })

    test('every preset raw parses to a keyboard with keys and metadata', () => {
        for (const preset of KLE_PRESETS) {
            const keyboard = parseKle(preset.raw)
            expect(keyboard.keys.length).toBeGreaterThan(0)
            expect(keyboard.meta.name.length).toBeGreaterThan(0)
        }
    })

    test('leads every raw layout with a metadata object', () => {
        for (const preset of KLE_PRESETS) {
            const first = preset.raw[0]
            expect(Array.isArray(first)).toBe(false)
            expect(typeof first).toBe('object')
        }
    })
})
