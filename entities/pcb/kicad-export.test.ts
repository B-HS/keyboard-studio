import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { generateKicadPcb } from '@entities/pcb/generate-kicad'
import { DEFAULT_PCB_OPTIONS, PcbOptions } from '@entities/pcb/types'

const outputDir = process.env.PCB_SCRATCH_DIR ?? join(tmpdir(), 'keebforge-pcb')
const preset = (id: string) => parseKle(KLE_PRESETS.find((entry) => entry.id === id)!.raw)

const dump = (name: string, options: PcbOptions, keyboard = preset('ansi-60')) => {
    const document = generateKicadPcb(keyboard, options)
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(join(outputDir, name), document)
    return document
}

describe('kicad export fixtures', () => {
    test('writes an ansi-60 default board', () => {
        const document = dump('ansi-60.kicad_pcb', DEFAULT_PCB_OPTIONS)
        expect(document).toContain('(kicad_pcb')
        expect(document).toContain('(footprint "SW_Cherry_MX_1.00u_PCB"')
    })

    test('writes a rotated alice board', () => {
        const document = dump('alice.kicad_pcb', DEFAULT_PCB_OPTIONS, preset('alice'))
        expect(document).toContain('(kicad_pcb')
        expect(document).toMatch(/\(at [-0-9.]+ [-0-9.]+ (-?12)\)/)
    })

    test('writes a globally switch-rotated ansi-60 board', () => {
        const document = dump('ansi-60-rotated.kicad_pcb', { ...DEFAULT_PCB_OPTIONS, switchRotation: 90 })
        expect(document).toContain('(footprint "SW_Cherry_MX_1.00u_PCB"')
        expect(document).toMatch(/\(at [-0-9.]+ [-0-9.]+ -90\)/)
    })

    test('writes a sod-123 variant board', () => {
        const document = dump('ansi-60-sod123.kicad_pcb', { ...DEFAULT_PCB_OPTIONS, diode: 'sod-123' })
        expect(document).toContain('keebforge:D_SOD-123')
    })
})
