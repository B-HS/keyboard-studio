import { describe, expect, test } from 'vitest'
import { parseKle } from './parse'
import { serializeKle, sortKleKeys } from './serialize'
import { KLE_PRESETS } from './presets'
import type { KleKeyboard } from './types'

const roundTrip = (raw: unknown[]) => parseKle(serializeKle(parseKle(raw)))

const expectStableRoundTrip = (raw: unknown[]) => {
    const original = parseKle(raw)
    const cycled = roundTrip(raw)
    expect(cycled.meta).toEqual(original.meta)
    expect(sortKleKeys(cycled.keys)).toEqual(sortKleKeys(original.keys))
}

describe('serializeKle preset round-trips', () => {
    for (const preset of KLE_PRESETS) {
        test(`${preset.id} survives parse -> serialize -> parse`, () => {
            expectStableRoundTrip(preset.raw)
        })
    }
})

describe('serializeKle idempotence', () => {
    for (const preset of KLE_PRESETS) {
        test(`${preset.id} serialization is a fixed point`, () => {
            const once = serializeKle(parseKle(preset.raw))
            const twice = serializeKle(parseKle(once))
            expect(twice).toEqual(once)
        })
    }
})

describe('serializeKle targeted layouts', () => {
    test('ISO enter secondary rectangle', () => {
        expectStableRoundTrip([[{ x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, 'Enter']])
    })

    test('big-ass enter secondary rectangle', () => {
        expectStableRoundTrip([[{ w: 1.5, h: 2, w2: 2.25, h2: 1, x2: -0.75, y2: 1 }, 'Enter']])
    })

    test('alice rotation clusters', () => {
        const preset = KLE_PRESETS.find((entry) => entry.id === 'alice')
        expect(preset).toBeDefined()
        if (preset) expectStableRoundTrip(preset.raw)
    })

    test('per-label colors', () => {
        expectStableRoundTrip([[{ t: '#ff0000\n\n\n\n\n\n\n\n\n#0000ff' }, 'A\n\n\n\n\n\n\n\nB']])
    })

    test('per-label sizes via fa', () => {
        expectStableRoundTrip([[{ fa: [5, 0, 0, 0, 0, 0, 0, 0, 2] }, 'A\n\n\n\n\n\n\n\nB']])
    })

    test('secondary label size via f2', () => {
        expectStableRoundTrip([[{ f: 3, f2: 6 }, 'A\nB']])
    })

    test('non-default default font size via f', () => {
        expectStableRoundTrip([[{ f: 9 }, 'Big']])
    })

    for (const align of [0, 1, 2, 3, 4, 5, 6, 7]) {
        test(`alignment flag a=${align}`, () => {
            expectStableRoundTrip([[{ a: align }, 'A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL']])
        })
    }

    test('decal / ghost / stepped / nub / profile / switch fields', () => {
        expectStableRoundTrip([
            [{ d: true }, 'Decal'],
            [{ g: true }, 'Ghost'],
            [{ l: true, w: 1.25, w2: 1.5, x2: -0.25 }, 'Stepped'],
            [{ n: true }, 'Nub'],
            [{ p: 'SA-R3' }, 'Profile'],
            [{ sm: 'cherry', sb: 'gateron', st: 'brown' }, 'Switch'],
        ])
    })

    test('rotary encoder switch mount round-trips', () => {
        expectStableRoundTrip([[{ sm: 'rot_ec11' }, 'Enc']])
    })

    test('custom cap colors carry through', () => {
        expectStableRoundTrip([[{ c: '#ff8800' }, 'Orange', { c: '#00aa55' }, 'Green', 'Default']])
    })

    test('metadata fields survive', () => {
        expectStableRoundTrip([
            { name: 'Test', author: 'me', backcolor: '#222222', notes: 'hello', switchMount: 'plate', switchBrand: 'cherry', switchType: 'mx' },
            ['A', 'B'],
        ])
    })
})

describe('serializeKle manufacturing rotation', () => {
    for (const angle of [0, 90, 180, 270]) {
        test(`switch rotation ${angle} round-trips`, () => {
            expectStableRoundTrip([[{ _r: angle }, 'A']])
        })
        test(`stabilizer rotation ${angle} round-trips`, () => {
            expectStableRoundTrip([[{ _rs: angle }, 'A']])
        })
    }

    test('mixed per-key rotations round-trip', () => {
        expectStableRoundTrip([[{ _r: 90, _rs: 180 }, 'A', { _r: 270 }, 'B', 'C']])
    })

    test('explicit-zero reset round-trips', () => {
        expectStableRoundTrip([[{ _r: 180 }, 'A', { _r: 0 }, 'B', 'C']])
    })

    test('emits _r once while the running value is unchanged', () => {
        const serialized = JSON.stringify(serializeKle(parseKle([[{ _r: 90 }, 'A', 'B']])))
        expect(serialized.split('"_r"').length - 1).toBe(1)
    })

    test('re-emits _r to reset a later key back to zero', () => {
        const serialized = JSON.stringify(serializeKle(parseKle([[{ _r: 90 }, 'A', { _r: 0 }, 'B']])))
        expect(serialized.split('"_r"').length - 1).toBe(2)
    })
})

describe('serializeKle handles mutated keys', () => {
    const mutate = (keyboard: KleKeyboard, index: number, patch: Partial<KleKeyboard['keys'][number]>) => {
        const next: KleKeyboard = {
            meta: keyboard.meta,
            keys: keyboard.keys.map((key) => ({
                ...key,
                labels: [...key.labels],
                textColor: [...key.textColor],
                textSize: [...key.textSize],
                defaults: { ...key.defaults },
            })),
        }
        next.keys[index] = { ...next.keys[index], ...patch }
        return next
    }

    test('changed legend, width and color round-trip', () => {
        const base = parseKle(KLE_PRESETS[0].raw)
        const labels = [...base.keys[0].labels]
        labels[0] = 'MUT'
        const mutated = mutate(base, 0, { labels, width: 2, width2: 2, color: '#123456' })
        const cycled = parseKle(serializeKle(mutated))
        expect(sortKleKeys(cycled.keys)).toEqual(sortKleKeys(mutated.keys))
    })

    test('cleared legend round-trips', () => {
        const base = parseKle(KLE_PRESETS[4].raw)
        const cleared = mutate(base, 3, { labels: new Array(12).fill(null), textColor: new Array(12).fill(null), textSize: new Array(12).fill(null) })
        const cycled = parseKle(serializeKle(cleared))
        expect(sortKleKeys(cycled.keys)).toEqual(sortKleKeys(cleared.keys))
    })
})
