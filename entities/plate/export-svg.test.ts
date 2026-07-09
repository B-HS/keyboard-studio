import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { buildPlate } from './generate'
import { plateToSvg } from './export-svg'
import { DEFAULT_PLATE_OPTIONS } from './types'

const SELF_CLOSING_TAG = /<([a-z]+)(?:\s[^>]*?)?\/>/gi
const PAIRED_TAG = /<(\/?)([a-z]+)(?:\s[^>]*?)?>/gi

const hasBalancedTags = (svg: string) => {
    const withoutDeclaration = svg.replace(/<\?xml[^>]*\?>/g, '')
    const withoutSelfClosing = withoutDeclaration.replace(SELF_CLOSING_TAG, '')
    const stack: string[] = []
    for (const match of withoutSelfClosing.matchAll(PAIRED_TAG)) {
        const [, closing, name] = match
        if (closing) {
            if (stack.pop() !== name) return false
        } else {
            stack.push(name)
        }
    }
    return stack.length === 0
}

const attributeValue = (svg: string, name: string) => svg.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? ''

describe('plateToSvg', () => {
    test('produces a standalone svg document with balanced tags and a single path', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const svg = plateToSvg(plate)

        expect(svg).toContain('<?xml')
        expect(svg).toContain('<svg')
        expect(hasBalancedTags(svg)).toBe(true)
        expect((svg.match(/<path\b/g) ?? []).length).toBe(1)
    })

    test('sets millimeter dimensions matching the plate size and viewBox', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const svg = plateToSvg(plate)

        expect(parseFloat(attributeValue(svg, 'width'))).toBeCloseTo(plate.widthMm, 3)
        expect(parseFloat(attributeValue(svg, 'height'))).toBeCloseTo(plate.heightMm, 3)
        expect(attributeValue(svg, 'width').endsWith('mm')).toBe(true)
        expect(attributeValue(svg, 'height').endsWith('mm')).toBe(true)

        const viewBox = attributeValue(svg, 'viewBox').split(' ').map(Number)
        expect(viewBox[2]).toBeCloseTo(plate.widthMm, 3)
        expect(viewBox[3]).toBeCloseTo(plate.heightMm, 3)
    })
})
