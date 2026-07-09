import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getKeyCenterMm, rotatePoint } from '@entities/kle/geometry'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { DIODE_DO35_HALF_SPAN_MM } from '@entities/pcb/constants'
import { generateKicadPcb } from '@entities/pcb/generate-kicad'
import { computePcbLayout } from '@entities/pcb/layout'
import { DEFAULT_PCB_OPTIONS, PcbOptions, SwitchMount } from '@entities/pcb/types'

const KICAD_CLI_PATH = process.env.KICAD_CLI ?? '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
const kicadCliAvailable = existsSync(KICAD_CLI_PATH)
const ansi60 = () => parseKle(KLE_PRESETS.find((entry) => entry.id === 'ansi-60')!.raw)

const withOptions = (overrides: Partial<PcbOptions>): PcbOptions => ({ ...DEFAULT_PCB_OPTIONS, ...overrides })

const formatNumber = (value: number) => {
    const rounded = Number(value.toFixed(6))
    return Object.is(rounded, -0) ? '0' : String(rounded)
}

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

const findMatchingParen = (source: string, openIndex: number) => {
    let depth = 0
    let insideString = false
    for (let index = openIndex; index < source.length; index++) {
        const character = source[index]
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
            if (depth === 0) return index
        }
    }
    return -1
}

const footprintBlock = (document: string, header: string) => {
    const start = document.indexOf(`(footprint "${header}`)
    if (start === -1) return ''
    return document.slice(start, findMatchingParen(document, start) + 1)
}

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

const gridKeyboard = parseKle([
    ['0,0', '0,1'],
    ['1,0', '1,1'],
])

describe('generateKicadPcb document shape', () => {
    test('parentheses are balanced across every preset with every diode and mount mode', () => {
        for (const preset of KLE_PRESETS) {
            const keyboard = parseKle(preset.raw)
            expect(parensAreBalanced(generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS))).toBe(true)
            expect(parensAreBalanced(generateKicadPcb(keyboard, withOptions({ switchMount: 'hotswap' })))).toBe(true)
            expect(parensAreBalanced(generateKicadPcb(keyboard, withOptions({ diode: 'sod-123' })))).toBe(true)
            expect(parensAreBalanced(generateKicadPcb(keyboard, withOptions({ switchMount: 'hotswap', diode: 'sod-123' })))).toBe(true)
        }
    })

    test('never emits wire-pad footprints for any preset', () => {
        for (const preset of KLE_PRESETS) {
            const keyboard = parseKle(preset.raw)
            expect(generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS)).not.toContain('WirePads_1x')
            expect(generateKicadPcb(keyboard, withOptions({ switchRotation: 90 }))).not.toContain('WirePads_1x')
        }
    })

    test('declares the KiCad 8 file version and A4 paper', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        expect(document).toContain('(version 20240108)')
        expect(document).toContain('(paper "A4")')
        expect(document.startsWith('(kicad_pcb')).toBe(true)
    })

    test('emits one real switch footprint and one DO-35 diode per non-decal key', () => {
        const keyboard = parseKle(KLE_PRESETS[0].raw)
        const physicalCount = keyboard.keys.filter((key) => !key.decal && !key.ghost).length
        const document = generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS)
        expect(countOccurrences(document, '(footprint "SW_Cherry_MX_')).toBe(physicalCount)
        expect(countOccurrences(document, '(footprint "D_DO-35_SOD27_P7.62mm_Horizontal"')).toBe(physicalCount)
    })

    test('never emits an Edge.Cuts outline', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        expect(document).not.toContain('(gr_rect')
        expect(document).not.toContain('(layer "Edge.Cuts")')
    })

    test('hotswap switch footprints carry the KIPRJMOD switch 3D model with preserved transform', () => {
        const document = generateKicadPcb(gridKeyboard, withOptions({ switchMount: 'hotswap' }))
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_PCB_1.00u')
        expect(switchFp).toContain('(model "${KIPRJMOD}/3dmodels/mx_switch.step"')
        expect(switchFp).toContain('(offset')
        expect(switchFp).toContain('(scale')
        expect(switchFp).toContain('(rotate')
    })

    test('solder switch footprints carry the KIPRJMOD switch 3D model', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_1.00u_PCB')
        expect(switchFp).toContain('(model "${KIPRJMOD}/3dmodels/mx_switch.step"')
    })

    test('the DO-35 diode carries the KICAD9_3DMODEL_DIR step model', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        const diodeFp = footprintBlock(document, 'D_DO-35_SOD27_P7.62mm_Horizontal')
        expect(diodeFp).toContain('(model "${KICAD9_3DMODEL_DIR}/Diode_THT.3dshapes/D_DO-35_SOD27_P7.62mm_Horizontal.step"')
    })
})

describe('generateKicadPcb per-size footprint selection', () => {
    const verticalKeyboard = () =>
        parseKle([
            [{ h: 2 }, '0,0'],
            [{ y: -1, x: 1 }, '0,1'],
        ])

    test('hotswap ansi-60 chooses a size-matched footprint for the 2.25u shift', () => {
        const document = generateKicadPcb(parseKle(KLE_PRESETS[0].raw), withOptions({ switchMount: 'hotswap' }))
        expect(document).toContain('(footprint "SW_Cherry_MX_PCB_2.25u"')
        expect(document).toContain('(footprint "SW_Cherry_MX_PCB_1.00u"')
    })

    test('solder ansi-60 chooses a size-matched official footprint for the 2.25u shift', () => {
        const document = generateKicadPcb(parseKle(KLE_PRESETS[0].raw), DEFAULT_PCB_OPTIONS)
        expect(document).toContain('(footprint "SW_Cherry_MX_2.25u_PCB"')
        expect(document).toContain('(footprint "SW_Cherry_MX_1.00u_PCB"')
    })

    test('solder falls back to the nearest-smaller official size for a 2.5u key', () => {
        const document = generateKicadPcb(parseKle([[{ w: 2.5 }, '0,0']]), DEFAULT_PCB_OPTIONS)
        expect(document).toContain('(footprint "SW_Cherry_MX_2.25u_PCB"')
    })

    test('ansi-60 places a size-adapted 6.25u stabilizer with +-50.0 slot offsets', () => {
        const document = generateKicadPcb(parseKle(KLE_PRESETS[0].raw), DEFAULT_PCB_OPTIONS)
        const stab = footprintBlock(document, 'Stabilizer_Cherry_MX_6.25u')
        expect(stab.length).toBeGreaterThan(0)
        expect(stab).toContain('(at -50 -6.985)')
        expect(stab).toContain('(at 50 -6.985)')
        expect(stab).not.toContain('11.938')
    })

    test('a vertical 2u key selects the _90deg hotswap switch footprint', () => {
        const document = generateKicadPcb(verticalKeyboard(), withOptions({ switchMount: 'hotswap' }))
        expect(document).toContain('(footprint "SW_Cherry_MX_PCB_2.00u_90deg"')
    })

    test('a vertical 2u key selects the official Vertical solder switch footprint', () => {
        const document = generateKicadPcb(verticalKeyboard(), DEFAULT_PCB_OPTIONS)
        expect(document).toContain('(footprint "SW_Cherry_MX_2.00u_Vertical_PCB"')
    })
})

describe('generateKicadPcb net assignment', () => {
    test('hotswap switch pads and diode pads carry matrix nets', () => {
        const document = generateKicadPcb(gridKeyboard, withOptions({ switchMount: 'hotswap' }))
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_PCB_1.00u')
        expect(switchFp).toMatch(/\(pad "1"[^]*?\(net \d+ "COL0"\)/)
        expect(switchFp).toMatch(/\(pad "2"[^]*?\(net \d+ "N_R0_C0"\)/)
        const diodeFp = footprintBlock(document, 'D_DO-35_SOD27_P7.62mm_Horizontal')
        expect(diodeFp).toMatch(/\(pad "1"[^]*?\(net \d+ "ROW0"\)/)
        expect(diodeFp).toMatch(/\(pad "2"[^]*?\(net \d+ "N_R0_C0"\)/)
    })

    test('solder thru-hole switch pads carry matrix nets on drill-1.5 pads', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_1.00u_PCB')
        expect(switchFp).toMatch(/\(pad "1" thru_hole circle[^]*?\(drill 1\.5\)/)
        expect(switchFp).toMatch(/\(pad "2" thru_hole circle[^]*?\(drill 1\.5\)/)
        expect(switchFp).toMatch(/\(pad "1"[^]*?\(net \d+ "COL0"\)/)
        expect(switchFp).toMatch(/\(pad "2"[^]*?\(net \d+ "N_R0_C0"\)/)
    })

    test('solder switch places its 4mm center hole at the key center coordinate', () => {
        const key = parseKle([['0,0']]).keys[0]
        const center = getKeyCenterMm(key)
        const document = generateKicadPcb(parseKle([['0,0']]), DEFAULT_PCB_OPTIONS)
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_1.00u_PCB')
        expect(switchFp).toContain(`(at ${formatNumber(center.x)} ${formatNumber(center.y)})`)
        expect(switchFp).toMatch(/\(pad "" np_thru_hole circle\s*\(at 0 0\)\s*\(size 4 4\)/)
    })

    test('mechanical np_thru_hole pads never carry a net', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        const holeLines = document.split('\n').filter((line) => line.includes('np_thru_hole'))
        expect(holeLines.length).toBeGreaterThan(0)
        for (const line of holeLines) expect(line).not.toContain('(net ')
    })

    test('rotation angle is negated for KiCad orientation and baked into hotswap pads', () => {
        const document = generateKicadPcb(parseKle([[{ r: 15 }, '0,0']]), withOptions({ switchMount: 'hotswap' }))
        expect(document).toMatch(/\(at [-0-9.]+ [-0-9.]+ -15\)/)
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_PCB_1.00u')
        expect(switchFp).toMatch(/\(pad "1"[^]*?\(at [-0-9.]+ [-0-9.]+ -15\)/)
    })

    test('rotation angle is negated for KiCad orientation and baked into solder pads', () => {
        const document = generateKicadPcb(parseKle([[{ r: 15 }, '0,0']]), DEFAULT_PCB_OPTIONS)
        expect(document).toMatch(/\(at [-0-9.]+ [-0-9.]+ -15\)/)
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_1.00u_PCB')
        expect(switchFp).toMatch(/\(pad "1"[^]*?\(at [-0-9.]+ [-0-9.]+ -15\)/)
    })
})

describe('generateKicadPcb diode option', () => {
    test('do-35 emits a THT diode footprint on the back copper layer', () => {
        const document = generateKicadPcb(gridKeyboard, DEFAULT_PCB_OPTIONS)
        expect(document).not.toContain('keebforge:D_SOD-123')
        const diode = footprintBlock(document, 'D_DO-35_SOD27_P7.62mm_Horizontal')
        expect(diode).toContain('(layer "B.Cu")')
    })

    test('sod-123 keeps the legacy smd emitter and honors diodesOnBack', () => {
        const onBack = generateKicadPcb(gridKeyboard, withOptions({ diode: 'sod-123', diodesOnBack: true }))
        const onFront = generateKicadPcb(gridKeyboard, withOptions({ diode: 'sod-123', diodesOnBack: false }))
        expect(onBack).toContain('keebforge:D_SOD-123')
        expect(onBack).toMatch(/\(pad "1" smd rect[^\n]*"B\.Cu"/)
        expect(onFront).toMatch(/\(pad "1" smd rect[^\n]*"F\.Cu"/)
        expect(onBack).not.toContain('D_DO-35')
    })
})

describe('generateKicadPcb diode offset', () => {
    test('the default DO-35 origin keeps the historical offset for a plain key', () => {
        const document = generateKicadPcb(parseKle([['0,0']]), DEFAULT_PCB_OPTIONS)
        expect(document).toContain('(at 5.715 14.605)')
    })

    test('a custom offset moves the DO-35 diode in the rotated key frame', () => {
        const keyboard = parseKle([[{ r: 30 }, '0,0']])
        const key = keyboard.keys[0]
        const document = generateKicadPcb(keyboard, withOptions({ diode: 'do-35', diodeOffsetXMm: 2, diodeOffsetYMm: 6 }))
        const center = getKeyCenterMm(key)
        const rotated = rotatePoint({ x: 2 - DIODE_DO35_HALF_SPAN_MM, y: 6 }, { x: 0, y: 0 }, key.rotationAngle)
        const origin = { x: center.x + rotated.x, y: center.y + rotated.y }
        expect(document).toContain(`(at ${formatNumber(origin.x)} ${formatNumber(origin.y)} ${formatNumber(-key.rotationAngle)})`)
    })

    test('the SOD-123 diode center equals switch center plus the rotated offset', () => {
        const keyboard = parseKle([[{ r: 30 }, '0,0']])
        const key = keyboard.keys[0]
        const document = generateKicadPcb(keyboard, withOptions({ diode: 'sod-123', diodeOffsetXMm: 2, diodeOffsetYMm: 6 }))
        const center = getKeyCenterMm(key)
        const rotatedOffset = rotatePoint({ x: 2, y: 6 }, { x: 0, y: 0 }, key.rotationAngle)
        const diodeCenter = { x: center.x + rotatedOffset.x, y: center.y + rotatedOffset.y }
        expect(document).toContain(`(at ${formatNumber(diodeCenter.x)} ${formatNumber(diodeCenter.y)} ${formatNumber(-key.rotationAngle)})`)
    })
})

describe('generateKicadPcb stabilizers', () => {
    test('stabilizers appear only when enabled', () => {
        const withStabs = generateKicadPcb(parseKle(KLE_PRESETS[0].raw), DEFAULT_PCB_OPTIONS)
        const withoutStabs = generateKicadPcb(parseKle(KLE_PRESETS[0].raw), withOptions({ stabFootprints: false }))
        expect(withStabs).toContain('Stabilizer_Cherry_MX')
        expect(withoutStabs).not.toContain('Stabilizer_Cherry_MX')
    })
})

describe('generateKicadPcb rotary encoder', () => {
    const encoderKeyboard = parseKle([['0,0', '0,1', { sm: 'rot_ec11' }, '0,2']])

    test('places one EC11 footprint instead of a switch and keeps a diode for every key', () => {
        const document = generateKicadPcb(encoderKeyboard, DEFAULT_PCB_OPTIONS)
        expect(countOccurrences(document, '(footprint "RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm"')).toBe(1)
        expect(countOccurrences(document, '(footprint "SW_Cherry_MX_')).toBe(2)
        expect(countOccurrences(document, '(footprint "D_DO-35_SOD27_P7.62mm_Horizontal"')).toBe(3)
        expect(parensAreBalanced(document)).toBe(true)
    })

    test('declares ENC0_A, ENC0_B and a single shared GND net', () => {
        const document = generateKicadPcb(encoderKeyboard, DEFAULT_PCB_OPTIONS)
        expect(document).toContain('"ENC0_A"')
        expect(document).toContain('"ENC0_B"')
        expect(countOccurrences(document, '(net') > 0).toBe(true)
        const gndNetDeclarations = document.split('\n').filter((line) => /^\t\(net \d+ "GND"\)$/.test(line))
        expect(gndNetDeclarations.length).toBe(1)
    })

    test('EC11 pads carry encoder, ground and matrix nets on the right pins', () => {
        const document = generateKicadPcb(encoderKeyboard, DEFAULT_PCB_OPTIONS)
        const encoder = footprintBlock(document, 'RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm')
        expect(encoder.length).toBeGreaterThan(0)
        expect(encoder).toMatch(/\(pad "A"[^]*?\(net \d+ "ENC0_A"\)/)
        expect(encoder).toMatch(/\(pad "B"[^]*?\(net \d+ "ENC0_B"\)/)
        expect(encoder).toMatch(/\(pad "C"[^]*?\(net \d+ "GND"\)/)
        expect(encoder).toMatch(/\(pad "S1"[^]*?\(net \d+ "COL2"\)/)
        expect(encoder).toMatch(/\(pad "S2"[^]*?\(net \d+ "N_R0_C2"\)/)
        const mpLines = encoder.split('\n').filter((line) => line.includes('(pad "MP"'))
        expect(mpLines.length).toBe(2)
        for (const line of mpLines) expect(line).not.toContain('(net ')
    })

    test('keeps encoder nets on the footprint without any wire-pad strip', () => {
        const document = generateKicadPcb(encoderKeyboard, DEFAULT_PCB_OPTIONS)
        expect(document).not.toContain('WirePads_1x')
        expect(document).not.toContain('(fp_text user "ENC"')
        const encoder = footprintBlock(document, 'RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm')
        expect(encoder).toMatch(/\(pad "A"[^]*?\(net \d+ "ENC0_A"\)/)
        expect(encoder).toMatch(/\(pad "B"[^]*?\(net \d+ "ENC0_B"\)/)
        expect(encoder).toMatch(/\(pad "C"[^]*?\(net \d+ "GND"\)/)
    })
})

describe('generateKicadPcb switch rotation', () => {
    test('a global 90 rotation negates onto the switch footprint and its baked pad angle', () => {
        const document = generateKicadPcb(parseKle([['0,0']]), withOptions({ switchRotation: 90, switchMount: 'hotswap' }))
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_PCB_1.00u')
        expect(switchFp).toMatch(/\(at [-0-9.]+ [-0-9.]+ -90\)/)
        expect(switchFp).toMatch(/\(pad "1"[^]*?\(at [-0-9.]+ [-0-9.]+ -90\)/)
    })

    test('a global 90 rotation carries the diode into the switch frame at a specific pad position', () => {
        const key = parseKle([['0,0']]).keys[0]
        const center = getKeyCenterMm(key)
        const rotated = rotatePoint({ x: -DIODE_DO35_HALF_SPAN_MM, y: DEFAULT_PCB_OPTIONS.diodeOffsetYMm }, { x: 0, y: 0 }, 90)
        const origin = { x: center.x + rotated.x, y: center.y + rotated.y }
        const document = generateKicadPcb(parseKle([['0,0']]), withOptions({ switchRotation: 90 }))
        expect(document).toContain('(at 4.445 5.715 -90)')
        expect(document).toContain(`(at ${formatNumber(origin.x)} ${formatNumber(origin.y)} -90)`)
    })

    test('layout, global and per-key switch rotation compose additively before negation on a rotated key', () => {
        const document = generateKicadPcb(parseKle([[{ r: 12, _r: 90 }, '0,0']]), withOptions({ switchRotation: 90, switchMount: 'hotswap' }))
        const switchFp = footprintBlock(document, 'SW_Cherry_MX_PCB_1.00u')
        expect(switchFp).toMatch(/\(at [-0-9.]+ [-0-9.]+ -192\)/)
        expect(switchFp).toMatch(/\(pad "1"[^]*?\(at [-0-9.]+ [-0-9.]+ -192\)/)
        const diode = footprintBlock(document, 'D_DO-35_SOD27_P7.62mm_Horizontal')
        expect(diode).toMatch(/\(at [-0-9.]+ [-0-9.]+ -192\)/)
    })

    test('global switch rotation also drives the EC11 encoder footprint angle', () => {
        const encoderKeyboard = parseKle([['0,0', '0,1', { sm: 'rot_ec11' }, '0,2']])
        const document = generateKicadPcb(encoderKeyboard, withOptions({ switchRotation: 90 }))
        const encoder = footprintBlock(document, 'RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm')
        expect(encoder).toMatch(/\(at [-0-9.]+ [-0-9.]+ -90\)/)
    })
})

describe('generateKicadPcb stabilizer rotation', () => {
    test('per-key stab rotation negates and composes with the layout angle on the stabilizer footprint', () => {
        const keyboard = parseKle([[{ w: 6.25, _rs: 90 }, '0,0']])
        const document = generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS)
        const stab = footprintBlock(document, 'Stabilizer_Cherry_MX_6.25u')
        expect(stab.length).toBeGreaterThan(0)
        expect(stab).toContain('(at 59.53125 9.525 -90)')
    })

    test('stab rotation is independent of the global switch rotation', () => {
        const keyboard = parseKle([[{ w: 6.25 }, '0,0']])
        const document = generateKicadPcb(keyboard, withOptions({ switchRotation: 90 }))
        const stab = footprintBlock(document, 'Stabilizer_Cherry_MX_6.25u')
        expect(stab).toContain('(at 59.53125 9.525)')
    })
})

const switchPlacements = (document: string) => {
    const placements: { x: number; y: number }[] = []
    let searchFrom = 0
    while (true) {
        const start = document.indexOf('(footprint "SW_Cherry_MX_', searchFrom)
        if (start === -1) return placements
        const end = findMatchingParen(document, start)
        const block = document.slice(start, end + 1)
        const layerIndex = block.indexOf('(layer "F.Cu")')
        const match = /\(at (-?[\d.]+) (-?[\d.]+)/.exec(block.slice(layerIndex))
        if (match) placements.push({ x: Number(match[1]), y: Number(match[2]) })
        searchFrom = end + 1
    }
}

describe('generateKicadPcb switch mount parity', () => {
    test('SW1 lands on the same key center in solder and hotswap mode', () => {
        const keyboard = ansi60()
        const solder = switchPlacements(generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS))
        const hotswap = switchPlacements(generateKicadPcb(keyboard, withOptions({ switchMount: 'hotswap' })))
        const firstKeyCenter = getKeyCenterMm(computePcbLayout(keyboard, DEFAULT_PCB_OPTIONS).physicalKeys[0])
        expect(solder[0]).toEqual({ x: firstKeyCenter.x, y: firstKeyCenter.y })
        expect(solder[0]).toEqual(hotswap[0])
    })

    test('every switch shares the same placement across mounts on ansi-60', () => {
        const keyboard = ansi60()
        const solder = switchPlacements(generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS))
        const hotswap = switchPlacements(generateKicadPcb(keyboard, withOptions({ switchMount: 'hotswap' })))
        expect(solder.length).toBeGreaterThan(0)
        expect(solder).toEqual(hotswap)
    })
})

describe('generateKicadPcb switch-mount x diode matrix', () => {
    const cases: { mount: 'solder' | 'hotswap'; diode: 'do-35' | 'sod-123'; switchHeader: string; diodeMarker: string; absentMarker: string }[] = [
        {
            mount: 'solder',
            diode: 'do-35',
            switchHeader: '(footprint "SW_Cherry_MX_1.00u_PCB"',
            diodeMarker: 'D_DO-35_SOD27_P7.62mm_Horizontal',
            absentMarker: 'keebforge:D_SOD-123',
        },
        {
            mount: 'solder',
            diode: 'sod-123',
            switchHeader: '(footprint "SW_Cherry_MX_1.00u_PCB"',
            diodeMarker: 'keebforge:D_SOD-123',
            absentMarker: 'D_DO-35',
        },
        {
            mount: 'hotswap',
            diode: 'do-35',
            switchHeader: '(footprint "SW_Cherry_MX_PCB_1.00u"',
            diodeMarker: 'D_DO-35_SOD27_P7.62mm_Horizontal',
            absentMarker: 'keebforge:D_SOD-123',
        },
        {
            mount: 'hotswap',
            diode: 'sod-123',
            switchHeader: '(footprint "SW_Cherry_MX_PCB_1.00u"',
            diodeMarker: 'keebforge:D_SOD-123',
            absentMarker: 'D_DO-35',
        },
    ]

    for (const testCase of cases) {
        test(`${testCase.mount} + ${testCase.diode} pairs the right switch family with the right diode emitter`, () => {
            const document = generateKicadPcb(gridKeyboard, withOptions({ switchMount: testCase.mount, diode: testCase.diode }))
            expect(document).toContain(testCase.switchHeader)
            expect(document).toContain(testCase.diodeMarker)
            expect(document).not.toContain(testCase.absentMarker)
            expect(parensAreBalanced(document)).toBe(true)
        })
    }
})

describe.skipIf(!kicadCliAvailable)('generateKicadPcb kicad-cli smoke', () => {
    const mounts: SwitchMount[] = ['solder', 'hotswap']
    for (const mount of mounts) {
        test(`ansi-60 ${mount} board exports svg and glb and passes drc parsing`, () => {
            const dir = mkdtempSync(join(tmpdir(), `keebforge-${mount}-`))
            const pcbPath = join(dir, 'keyboard.kicad_pcb')
            writeFileSync(pcbPath, generateKicadPcb(ansi60(), withOptions({ switchMount: mount })))

            const svgPath = join(dir, 'board.svg')
            execFileSync(
                KICAD_CLI_PATH,
                [
                    'pcb',
                    'export',
                    'svg',
                    '--layers',
                    'F.Cu,B.Cu,F.Mask',
                    '--exclude-drawing-sheet',
                    '--page-size-mode',
                    '2',
                    '--mode-single',
                    '-o',
                    svgPath,
                    pcbPath,
                ],
                { timeout: 120_000 },
            )
            expect(existsSync(svgPath)).toBe(true)

            const glbPath = join(dir, 'board.glb')
            execFileSync(KICAD_CLI_PATH, ['pcb', 'export', 'glb', '--force', '-o', glbPath, pcbPath], { timeout: 120_000 })
            expect(existsSync(glbPath)).toBe(true)

            const drcPath = join(dir, 'drc.json')
            execFileSync(KICAD_CLI_PATH, ['pcb', 'drc', '--format', 'json', '-o', drcPath, pcbPath], { timeout: 120_000 })
            const drc = JSON.parse(readFileSync(drcPath, 'utf8'))
            expect(Array.isArray(drc.violations)).toBe(true)
            expect(drc.schematic_parity ?? []).toEqual([])
        }, 180_000)
    }
})
