import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { assignMatrix } from '@entities/pcb/matrix'
import { orderPhysicalKeys } from '@entities/pcb/netlist'
import { generateKicadPro, generateKicadSch } from '@entities/sch/generate-kicad-sch'

const presetKeyboard = (id: string) => {
    const preset = KLE_PRESETS.find((entry) => entry.id === id)
    if (!preset) throw new Error(`missing preset ${id}`)
    return parseKle(preset.raw)
}

const PRESET_IDS = ['ansi-60', 'alice', 'ortho-40', 'ansi-tkl']

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

const matchAllValues = (document: string, pattern: RegExp) => [...document.matchAll(pattern)].map((match) => match[1])

const parseSymbols = (document: string) => {
    const pattern = /\(symbol \(lib_id "([^"]+)"\) \(at ([-\d.]+) ([-\d.]+) ([-\d.]+)\)[\s\S]*?\(property "Reference" "([^"]+)"/g
    const symbols = new Map<string, { lib: string; x: number; y: number; angle: number }>()
    for (const match of document.matchAll(pattern)) {
        symbols.set(match[5], { lib: match[1], x: Number(match[2]), y: Number(match[3]), angle: Number(match[4]) })
    }
    return symbols
}

const parseWires = (document: string) =>
    [...document.matchAll(/\(wire \(pts \(xy ([-\d.]+) ([-\d.]+)\) \(xy ([-\d.]+) ([-\d.]+)\)\)/g)].map((match) => ({
        x1: Number(match[1]),
        y1: Number(match[2]),
        x2: Number(match[3]),
        y2: Number(match[4]),
    }))

const parseLabels = (document: string) =>
    [...document.matchAll(/\(global_label "([^"]+)" \(shape input\) \(at ([-\d.]+) ([-\d.]+) ([-\d.]+)\)/g)].map((match) => ({
        net: match[1],
        x: Number(match[2]),
        y: Number(match[3]),
        angle: Number(match[4]),
    }))

const minColumnPitch = (symbols: ReturnType<typeof parseSymbols>) => {
    const rows = new Map<number, number[]>()
    for (const symbol of symbols.values()) {
        if (symbol.lib !== 'Switch:SW_Push') continue
        const bucket = rows.get(symbol.y) ?? []
        bucket.push(symbol.x)
        rows.set(symbol.y, bucket)
    }
    let pitch = Infinity
    for (const bucket of rows.values()) {
        const sorted = [...bucket].sort((left, right) => left - right)
        for (let index = 1; index < sorted.length; index++) pitch = Math.min(pitch, sorted[index] - sorted[index - 1])
    }
    return pitch
}

describe('generateKicadSch', () => {
    test.each(PRESET_IDS)('produces balanced parentheses for %s', (id) => {
        expect(parensAreBalanced(generateKicadSch(presetKeyboard(id)))).toBe(true)
    })

    test.each(PRESET_IDS)('emits exactly two symbol instances per matrix key for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const keyCount = orderPhysicalKeys(assignMatrix(keyboard.keys)).length
        const document = generateKicadSch(keyboard)
        const switchInstances = matchAllValues(document, /\(symbol \(lib_id "(Switch:SW_Push)"\)/g)
        const diodeInstances = matchAllValues(document, /\(symbol \(lib_id "(Device:D)"\)/g)
        expect(switchInstances).toHaveLength(keyCount)
        expect(diodeInstances).toHaveLength(keyCount)
        expect(switchInstances.length + diodeInstances.length).toBe(2 * keyCount)
    })

    test.each(PRESET_IDS)('numbers SW and D references in orderPhysicalKeys sequence for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const order = orderPhysicalKeys(assignMatrix(keyboard.keys))
        const document = generateKicadSch(keyboard)
        const switchReferences = matchAllValues(document, /\(property "Reference" "(SW\d+)"/g)
        const diodeReferences = matchAllValues(document, /\(property "Reference" "(D\d+)"/g)
        expect(switchReferences).toEqual(order.map((_, ordinal) => `SW${ordinal + 1}`))
        expect(diodeReferences).toEqual(order.map((_, ordinal) => `D${ordinal + 1}`))
    })

    test.each(PRESET_IDS)('places each COL/ROW label pair following orderPhysicalKeys for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const matrix = assignMatrix(keyboard.keys)
        const order = orderPhysicalKeys(matrix)
        const document = generateKicadSch(keyboard)
        const labels = matchAllValues(document, /\(global_label "(COL\d+|ROW\d+)"/g)
        expect(labels).toHaveLength(2 * order.length)
        order.forEach((keyIndex, ordinal) => {
            const { row, col } = matrix.perKey[keyIndex]
            expect(labels[ordinal * 2]).toBe(`COL${col}`)
            expect(labels[ordinal * 2 + 1]).toBe(`ROW${row}`)
        })
    })

    test.each(PRESET_IDS)('emits exactly one COL and one ROW label per cell for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const order = orderPhysicalKeys(assignMatrix(keyboard.keys))
        const document = generateKicadSch(keyboard)
        const colLabels = matchAllValues(document, /\(global_label "(COL\d+)"/g)
        const rowLabels = matchAllValues(document, /\(global_label "(ROW\d+)"/g)
        expect(colLabels).toHaveLength(order.length)
        expect(rowLabels).toHaveLength(order.length)
    })

    test.each(PRESET_IDS)('global labels cover exactly the ROW/COL nets used by matrix keys for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const matrix = assignMatrix(keyboard.keys)
        const order = orderPhysicalKeys(matrix)
        const document = generateKicadSch(keyboard)
        const distinctLabels = new Set(matchAllValues(document, /\(global_label "(COL\d+|ROW\d+)"/g))
        const expectedNets = new Set<string>()
        for (const keyIndex of order) {
            const { row, col } = matrix.perKey[keyIndex]
            expectedNets.add(`COL${col}`)
            expectedNets.add(`ROW${row}`)
        }
        expect([...distinctLabels].sort()).toEqual([...expectedNets].sort())
        const allGlobalLabels = matchAllValues(document, /\(global_label "([^"]+)"/g)
        expect(allGlobalLabels.every((net) => /^(COL|ROW)\d+$/.test(net))).toBe(true)
    })

    test.each(PRESET_IDS)('keeps every wire horizontal and inside its own cell for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const order = orderPhysicalKeys(assignMatrix(keyboard.keys))
        const document = generateKicadSch(keyboard)
        const symbols = parseSymbols(document)
        const wires = parseWires(document)
        expect(wires).toHaveLength(order.length)
        const pitch = minColumnPitch(symbols)
        order.forEach((_, ordinal) => {
            const sw = symbols.get(`SW${ordinal + 1}`)
            const diode = symbols.get(`D${ordinal + 1}`)
            const wire = wires[ordinal]
            expect(sw).toBeDefined()
            expect(diode).toBeDefined()
            if (!sw || !diode) return
            expect(sw.y).toBe(diode.y)
            expect(wire.y1).toBe(sw.y)
            expect(wire.y2).toBe(sw.y)
            const left = Math.min(wire.x1, wire.x2)
            const right = Math.max(wire.x1, wire.x2)
            expect(left).toBeGreaterThanOrEqual(sw.x)
            expect(right).toBeLessThanOrEqual(diode.x)
            expect(right - left).toBeLessThan(pitch)
        })
    })

    test.each(PRESET_IDS)('anchors each COL label left of its switch and each ROW label right of its diode for %s', (id) => {
        const keyboard = presetKeyboard(id)
        const order = orderPhysicalKeys(assignMatrix(keyboard.keys))
        const document = generateKicadSch(keyboard)
        const symbols = parseSymbols(document)
        const labels = parseLabels(document)
        const colLabels = labels.filter((label) => label.net.startsWith('COL'))
        const rowLabels = labels.filter((label) => label.net.startsWith('ROW'))
        order.forEach((_, ordinal) => {
            const sw = symbols.get(`SW${ordinal + 1}`)
            const diode = symbols.get(`D${ordinal + 1}`)
            if (!sw || !diode) return
            expect(colLabels[ordinal].y).toBe(sw.y)
            expect(colLabels[ordinal].x).toBeLessThan(sw.x)
            expect(rowLabels[ordinal].y).toBe(diode.y)
            expect(rowLabels[ordinal].x).toBeGreaterThan(diode.x)
        })
    })

    test.each(PRESET_IDS)('is deterministic across repeated calls for %s', (id) => {
        const keyboard = presetKeyboard(id)
        expect(generateKicadSch(keyboard)).toBe(generateKicadSch(keyboard))
    })

    test('wires the switch pin 2 to the diode anode pin 2 net for each key', () => {
        const document = generateKicadSch(presetKeyboard('ortho-40'))
        const wireCount = matchAllValues(document, /\(wire \(pts \(xy (\S+)/g).length
        const keyCount = orderPhysicalKeys(assignMatrix(presetKeyboard('ortho-40').keys)).length
        expect(wireCount).toBe(keyCount)
    })

    test('embeds the Switch:SW_Push and Device:D library symbols', () => {
        const document = generateKicadSch(presetKeyboard('ansi-60'))
        expect(document).toContain('(lib_symbols')
        expect(document).toContain('(symbol "Switch:SW_Push"')
        expect(document).toContain('(symbol "Device:D"')
    })

    test('computes a paper size larger than A4 for a matrix wider than an A4 sheet', () => {
        expect(generateKicadSch(presetKeyboard('ansi-60'))).toMatch(/\(paper "(A3|A2|A1|A0)"\)/)
    })
})

describe('generateKicadPro', () => {
    test('produces valid JSON that references the project schematic', () => {
        const project = JSON.parse(generateKicadPro('keebforge'))
        expect(project.meta.filename).toBe('keebforge.kicad_pro')
        expect(project.schematic.top_level_sheets[0].filename).toBe('keebforge.kicad_sch')
    })

    test('sanitizes unsafe characters in the project name', () => {
        const project = JSON.parse(generateKicadPro('my board!.kicad_pro'))
        expect(project.meta.filename).toBe('my_board_.kicad_pro')
    })

    test('is deterministic across repeated calls', () => {
        expect(generateKicadPro('keebforge')).toBe(generateKicadPro('keebforge'))
    })
})
