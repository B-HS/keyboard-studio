import { describe, expect, test } from 'vitest'
import { parseKle, parseKleText } from './parse'
import { KLE_PRESETS } from './presets'

describe('parseKle geometry accumulation', () => {
    test('parses sequential keys across rows', () => {
        const keyboard = parseKle([['A', 'B'], ['C']])
        expect(keyboard.keys.length).toBe(3)
        expect(keyboard.keys[0].x).toBe(0)
        expect(keyboard.keys[1].x).toBe(1)
        expect(keyboard.keys[0].y).toBe(0)
        expect(keyboard.keys[2].x).toBe(0)
        expect(keyboard.keys[2].y).toBe(1)
    })

    test('applies x offset before the next key', () => {
        const keyboard = parseKle([[{ x: 1 }, 'A']])
        expect(keyboard.keys[0].x).toBe(1)
    })

    test('applies width and height', () => {
        const keyboard = parseKle([[{ w: 2, h: 2 }, 'A']])
        expect(keyboard.keys[0].width).toBe(2)
        expect(keyboard.keys[0].height).toBe(2)
        expect(keyboard.keys[0].width2).toBe(2)
        expect(keyboard.keys[0].height2).toBe(2)
    })

    test('carries the ISO enter secondary rect', () => {
        const keyboard = parseKle([[{ x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, 'Enter']])
        const key = keyboard.keys[0]
        expect(key.width).toBe(1.25)
        expect(key.height).toBe(2)
        expect(key.width2).toBe(1.5)
        expect(key.height2).toBe(1)
        expect(key.x2).toBe(-0.25)
        expect(key.y2).toBe(0)
    })

    test('normal keys mirror the primary rect into the secondary rect', () => {
        const keyboard = parseKle([[{ w: 1.5 }, 'A']])
        const key = keyboard.keys[0]
        expect(key.width2).toBe(1.5)
        expect(key.height2).toBe(1)
        expect(key.x2).toBe(0)
        expect(key.y2).toBe(0)
    })
})

describe('parseKle rotation clusters', () => {
    test('r with rx/ry resets origin and current position', () => {
        const keyboard = parseKle([[{ r: 15, rx: 2, ry: 1 }, 'A'], ['B']])
        const [first, second] = keyboard.keys
        expect(first.rotationAngle).toBe(15)
        expect(first.rotationX).toBe(2)
        expect(first.rotationY).toBe(1)
        expect(first.x).toBe(2)
        expect(first.y).toBe(1)
        expect(second.rotationAngle).toBe(15)
        expect(second.rotationX).toBe(2)
        expect(second.x).toBe(2)
        expect(second.y).toBe(2)
    })

    test('rotation on a non-first key throws', () => {
        expect(() => parseKle([['A', { r: 15 }, 'B']])).toThrow()
    })
})

describe('parseKle label alignment remapping', () => {
    test('default alignment 4 spreads labels to corner positions', () => {
        const keyboard = parseKle([[{ a: 4 }, 'A\nB\nC']])
        const labels = keyboard.keys[0].labels
        expect(labels[0]).toBe('A')
        expect(labels[6]).toBe('B')
        expect(labels[2]).toBe('C')
        expect(labels.length).toBe(12)
    })

    test('alignment 7 centers a single label', () => {
        const keyboard = parseKle([[{ a: 7 }, 'A']])
        const labels = keyboard.keys[0].labels
        expect(labels[4]).toBe('A')
        expect(labels[0]).toBe(null)
    })

    test('alignment 5 centers front and x', () => {
        const keyboard = parseKle([[{ a: 5 }, 'A\nB']])
        const labels = keyboard.keys[0].labels
        expect(labels[1]).toBe('A')
        expect(labels[7]).toBe('B')
    })
})

describe('parseKle font sizes', () => {
    test('f sets the default text size', () => {
        const keyboard = parseKle([[{ f: 5 }, 'A']])
        expect(keyboard.keys[0].defaults.textSize).toBe(5)
    })

    test('fa applies per-label sizes remapped by alignment', () => {
        const keyboard = parseKle([[{ fa: [5, 6, 7] }, 'A\nB\nC']])
        const textSize = keyboard.keys[0].textSize
        expect(textSize[0]).toBe(5)
        expect(textSize[6]).toBe(6)
        expect(textSize[2]).toBe(7)
    })

    test('f2 sizes the secondary labels while position zero keeps the default', () => {
        const keyboard = parseKle([[{ f: 2, f2: 4 }, 'A\nB']])
        const key = keyboard.keys[0]
        expect(key.defaults.textSize).toBe(2)
        expect(key.textSize[0]).toBe(null)
        expect(key.textSize[6]).toBe(4)
    })
})

describe('parseKle text colors', () => {
    test('t sets the default color and per-label overrides', () => {
        const keyboard = parseKle([[{ t: '#ff0000\n#00ff00' }, 'A\nB']])
        const key = keyboard.keys[0]
        expect(key.defaults.textColor).toBe('#ff0000')
        expect(key.textColor[0]).toBe(null)
        expect(key.textColor[6]).toBe('#00ff00')
    })
})

describe('parseKle flags', () => {
    test('ghost flag', () => {
        expect(parseKle([[{ g: true }, 'A']]).keys[0].ghost).toBe(true)
    })
    test('decal flag', () => {
        expect(parseKle([[{ d: true }, 'A']]).keys[0].decal).toBe(true)
    })
    test('stepped flag', () => {
        expect(parseKle([[{ l: true }, 'A']]).keys[0].stepped).toBe(true)
    })
    test('nub flag', () => {
        expect(parseKle([[{ n: true }, 'A']]).keys[0].nub).toBe(true)
    })
    test('profile', () => {
        expect(parseKle([[{ p: 'SA R1' }, 'A']]).keys[0].profile).toBe('SA R1')
    })
    test('cap color', () => {
        expect(parseKle([[{ c: '#ff8800' }, 'A']]).keys[0].color).toBe('#ff8800')
    })
    test('switch descriptors', () => {
        const key = parseKle([[{ sm: 'cherry', sb: 'gateron', st: 'brown' }, 'A']]).keys[0]
        expect(key.sm).toBe('cherry')
        expect(key.sb).toBe('gateron')
        expect(key.st).toBe('brown')
    })
    test('decal resets after the key it applies to', () => {
        const keyboard = parseKle([[{ d: true }, 'A', 'B']])
        expect(keyboard.keys[0].decal).toBe(true)
        expect(keyboard.keys[1].decal).toBe(false)
    })
})

describe('parseKle metadata', () => {
    test('reads the leading metadata object', () => {
        const keyboard = parseKle([{ name: 'My Board', author: 'me', backcolor: '#ffffff' }, ['A']])
        expect(keyboard.meta.name).toBe('My Board')
        expect(keyboard.meta.author).toBe('me')
        expect(keyboard.meta.backcolor).toBe('#ffffff')
        expect(keyboard.keys.length).toBe(1)
    })

    test('metadata after the first element throws', () => {
        expect(() => parseKle([['A'], { name: 'late' }])).toThrow()
    })
})

describe('parseKleText tolerant parsing', () => {
    test('parses a well-formed array of rows', () => {
        const result = parseKleText('[["A"],["B"]]')
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.keyboard.keys.length).toBe(2)
    })

    test('wraps bare comma-separated rows in brackets', () => {
        const result = parseKleText('["A","B"],["C"]')
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.keyboard.keys.length).toBe(3)
    })

    test('returns an error string for invalid input', () => {
        const result = parseKleText('{{ not json')
        expect(result.ok).toBe(false)
        if (!result.ok) expect(typeof result.error).toBe('string')
    })
})

describe('KLE presets', () => {
    const expectedCounts: Record<string, number> = {
        'ansi-60': 61,
        'iso-60': 62,
        'ansi-tkl': 87,
        'ansi-104': 104,
        'ortho-40': 48,
        'alice': 61,
    }

    for (const preset of KLE_PRESETS) {
        test(`${preset.id} round-trips to the expected key count`, () => {
            const keyboard = parseKle(preset.raw)
            expect(keyboard.keys.length).toBe(expectedCounts[preset.id])
        })
    }

    test('alice preset rotates both halves', () => {
        const preset = KLE_PRESETS.find((entry) => entry.id === 'alice')
        expect(preset).toBeDefined()
        if (!preset) return
        const angles = new Set(parseKle(preset.raw).keys.map((key) => key.rotationAngle))
        expect(angles.has(-12)).toBe(true)
        expect(angles.has(12)).toBe(true)
    })
})

describe('switch mount propagation', () => {
    test('empty-string sm resets the running value for later keys', () => {
        const keyboard = parseKle([[{ sm: 'rot_ec11' }, 'A', { sm: '' }, 'B', 'C']])
        expect(keyboard.keys.map((key) => key.sm)).toEqual(['rot_ec11', '', ''])
    })
})

describe('parseKle manufacturing rotation', () => {
    test('reads switch and stabilizer rotation from _r and _rs', () => {
        const key = parseKle([[{ _r: 90, _rs: 180 }, 'A']]).keys[0]
        expect(key.switchRotation).toBe(90)
        expect(key.stabRotation).toBe(180)
    })

    test('defaults to zero when absent', () => {
        const key = parseKle([['A']]).keys[0]
        expect(key.switchRotation).toBe(0)
        expect(key.stabRotation).toBe(0)
    })

    test('propagates the running switch rotation to later keys', () => {
        const keys = parseKle([[{ _r: 270 }, 'A', 'B']]).keys
        expect(keys.map((key) => key.switchRotation)).toEqual([270, 270])
    })

    test('explicit zero _r resets the running switch rotation', () => {
        const keys = parseKle([[{ _r: 90 }, 'A', { _r: 0 }, 'B', 'C']]).keys
        expect(keys.map((key) => key.switchRotation)).toEqual([90, 0, 0])
    })

    test('explicit zero _rs resets the running stabilizer rotation', () => {
        const keys = parseKle([[{ _rs: 180 }, 'A', { _rs: 0 }, 'B']]).keys
        expect(keys.map((key) => key.stabRotation)).toEqual([180, 0])
    })
})

describe('parseKle structural errors', () => {
    test('throws when the top-level value is not an array', () => {
        expect(() => parseKle('nope')).toThrow('KLE data must be an array of rows')
    })

    test('throws when a row item is neither a string nor a property object', () => {
        expect(() => parseKle([[5]])).toThrow('KLE row items must be strings or property objects')
    })

    test('throws when a row is neither an array nor a leading metadata object', () => {
        expect(() => parseKle([5])).toThrow('KLE rows must be arrays or a leading metadata object')
    })
})
