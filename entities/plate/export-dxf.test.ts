import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { buildPlate } from './generate'
import { plateToDxf } from './export-dxf'
import { DEFAULT_PLATE_OPTIONS } from './types'

const countLines = (dxf: string, value: string) => dxf.split('\n').filter((line) => line === value).length

describe('plateToDxf', () => {
    test('writes a header, entities section and terminator with millimeter units', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const dxf = plateToDxf(plate)

        expect(dxf).toContain('SECTION')
        expect(dxf).toContain('HEADER')
        expect(dxf).toContain('$INSUNITS')
        expect(dxf).toContain('ENTITIES')
        expect(dxf).toContain('EOF')
    })

    test('emits one closed polyline per polygon', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const dxf = plateToDxf(plate)
        const polygonCount = 1 + plate.holes.length

        expect(countLines(dxf, 'POLYLINE')).toBe(polygonCount)
        expect(countLines(dxf, 'SEQEND')).toBe(polygonCount)
    })
})
