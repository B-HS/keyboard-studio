import { describe, expect, test } from 'vitest'
import { DIODE_SYMBOL, SW_PUSH_SYMBOL } from './symbol-data'

const parensAreBalanced = (document: string) => {
    let depth = 0
    let insideString = false
    for (let index = 0; index < document.length; index++) {
        const character = document[index]
        if (insideString) {
            if (character === '\\') {
                index++
                continue
            }
            if (character === '"') insideString = false
            continue
        }
        if (character === '"') {
            insideString = true
            continue
        }
        if (character === '(') depth++
        else if (character === ')') {
            depth--
            if (depth < 0) return false
        }
    }
    return depth === 0 && !insideString
}

describe('SW_PUSH_SYMBOL', () => {
    test('is a balanced SW_Push symbol node with two numbered pins', () => {
        expect(SW_PUSH_SYMBOL.startsWith('(symbol "SW_Push"')).toBe(true)
        expect(parensAreBalanced(SW_PUSH_SYMBOL)).toBe(true)
        expect(SW_PUSH_SYMBOL).toContain('(number "1"')
        expect(SW_PUSH_SYMBOL).toContain('(number "2"')
    })
})

describe('DIODE_SYMBOL', () => {
    test('is a balanced diode symbol node with cathode and anode pins', () => {
        expect(DIODE_SYMBOL.startsWith('(symbol "D"')).toBe(true)
        expect(parensAreBalanced(DIODE_SYMBOL)).toBe(true)
        expect(DIODE_SYMBOL).toContain('(name "K"')
        expect(DIODE_SYMBOL).toContain('(name "A"')
    })
})
