import { describe, expect, test } from 'vitest'
import { formatKleJson, tryParseKleRows } from './format'

describe('formatKleJson', () => {
    test('prints one indented row per line and stays JSON-parseable', () => {
        const rows = [{ name: 'Board' }, ['A', 'B'], [{ w: 2 }, 'Space']]
        const text = formatKleJson(rows)
        const lines = text.split('\n')
        expect(lines[0]).toBe('[')
        expect(lines[1]).toBe(`    ${JSON.stringify(rows[0])},`)
        expect(lines[2]).toBe(`    ${JSON.stringify(rows[1])},`)
        expect(lines[3]).toBe(`    ${JSON.stringify(rows[2])}`)
        expect(lines[lines.length - 1]).toBe(']')
        expect(JSON.parse(text)).toEqual(rows)
    })

    test('joins rows with a comma between them', () => {
        expect(formatKleJson([['A'], ['B']])).toBe('[\n    ["A"],\n    ["B"]\n]')
    })

    test('round-trips an empty row list', () => {
        expect(JSON.parse(formatKleJson([]))).toEqual([])
    })
})

describe('tryParseKleRows', () => {
    test('parses a well-formed array of rows', () => {
        expect(tryParseKleRows('[["A"],["B"]]')).toEqual([['A'], ['B']])
    })

    test('wraps bare comma-separated rows in brackets', () => {
        expect(tryParseKleRows('["A","B"],["C"]')).toEqual([['A', 'B'], ['C']])
    })

    test('returns null when the payload parses to a non-array', () => {
        expect(tryParseKleRows('{"name":"Board"}')).toBeNull()
    })

    test('returns null for input that is not valid JSON even when bracket-wrapped', () => {
        expect(tryParseKleRows('{{ not json')).toBeNull()
    })
})
