import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { generateKicadPcb } from '@entities/pcb/generate-kicad'
import { generateKicadPro, generateKicadSch } from '@entities/sch/generate-kicad-sch'
import { DEFAULT_PCB_OPTIONS } from '@entities/pcb/types'

const outputDir = join(tmpdir(), 'keebforge-render')

describe('kicad render e2e payloads', () => {
    test('writes pcb, sch and pro payload strings for a 3x3 matrix', () => {
        const keyboard = parseKle([
            ['0,0', '0,1', '0,2'],
            ['1,0', '1,1', '1,2'],
            ['2,0', '2,1', '2,2'],
        ])
        const pcb = generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS)
        const sch = generateKicadSch(keyboard)
        const pro = generateKicadPro('keyboard')

        expect(pcb.length).toBeGreaterThan(0)
        expect(sch.length).toBeGreaterThan(0)
        expect(pro.length).toBeGreaterThan(0)
        expect(pcb).toContain('${KIPRJMOD}/3dmodels/mx_switch.step')

        mkdirSync(outputDir, { recursive: true })
        writeFileSync(join(outputDir, 'render-payload.json'), JSON.stringify({ pcb, sch, pro }))
    })
})
