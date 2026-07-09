import { describe, expect, test } from 'vitest'
import * as modeling from '@jscad/modeling'
import { parseKle } from '@entities/kle/parse'
import { buildPlate } from './generate'
import { plateToJscadScript } from './export-jscad'
import { DEFAULT_PLATE_OPTIONS } from './types'

const runJscadScript = (script: string) => {
    const scriptModule: { exports: { main?: () => ReturnType<typeof modeling.extrusions.extrudeLinear> } } = { exports: {} }
    const requireShim = (name: string) => {
        if (name === '@jscad/modeling') return modeling
        throw new Error(`unexpected require: ${name}`)
    }
    new Function('require', 'module', script)(requireShim, scriptModule)
    return scriptModule.exports
}

describe('plateToJscadScript', () => {
    test('emits a standalone OpenJSCAD script with embedded geometry', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const script = plateToJscadScript(plate, DEFAULT_PLATE_OPTIONS.thickness)

        expect(script).toContain("require('@jscad/modeling')")
        expect(script).toContain('const main = () =>')
        expect(script).toContain('module.exports = { main }')
        expect(script).toContain(`const thickness = ${DEFAULT_PLATE_OPTIONS.thickness}`)
    })

    test('produces a runnable script whose main returns an extruded solid', () => {
        const keyboard = parseKle([['A', 'B']])
        const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
        const script = plateToJscadScript(plate, DEFAULT_PLATE_OPTIONS.thickness)
        const scriptExports = runJscadScript(script)

        expect(typeof scriptExports.main).toBe('function')
        const solid = scriptExports.main?.()
        expect(modeling.geometries.geom3.isA(solid)).toBe(true)
        expect(solid?.polygons.length).toBeGreaterThan(0)
    })
})
