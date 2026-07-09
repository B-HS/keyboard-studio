import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const footprintRoot = path.join(projectRoot, 'vendor', 'footprints')
const switchDir = path.join(footprintRoot, 'Switch_Keyboard_Cherry_MX.pretty')
const solderSwitchDir = path.join(footprintRoot, 'Button_Switch_Keyboard.pretty')
const kicadSolderSourceDir = '/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints/Button_Switch_Keyboard.pretty'
const outputFile = path.join(projectRoot, 'entities', 'pcb', 'footprint-data.ts')

const findMatchingParen = (source, openIndex) => {
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

const stripModelBlocks = (source) => {
    let result = source
    while (true) {
        const modelIndex = result.indexOf('(model')
        if (modelIndex === -1) break
        const closeIndex = findMatchingParen(result, modelIndex)
        if (closeIndex === -1) break
        let lineStart = modelIndex
        while (lineStart > 0 && result[lineStart - 1] !== '\n') lineStart--
        result = result.slice(0, lineStart) + result.slice(closeIndex + 1).replace(/^[^\S\n]*\n/, '')
    }
    return result
}

const SWITCH_MODEL_PATH = '"' + '$' + '{KIPRJMOD}' + '/3dmodels/mx_switch.step' + '"'
const DIODE_MODEL_PATH = '"' + '$' + '{KICAD9_3DMODEL_DIR}' + '/Diode_THT.3dshapes/D_DO-35_SOD27_P7.62mm_Horizontal.step' + '"'
const DEFAULT_MODEL_TRANSFORM = { offset: ['0', '0', '0'], scale: ['1', '1', '1'], rotate: ['0', '0', '0'] }

const readModelTransform = (source) => {
    const modelIndex = source.indexOf('(model')
    if (modelIndex === -1) return null
    const closeIndex = findMatchingParen(source, modelIndex)
    if (closeIndex === -1) return null
    const block = source.slice(modelIndex, closeIndex + 1)
    const readXyz = (keywords, fallback) => {
        for (const keyword of keywords) {
            const keywordIndex = block.indexOf('(' + keyword)
            if (keywordIndex === -1) continue
            const match = /\(xyz\s+([^\s)]+)\s+([^\s)]+)\s+([^\s)]+)\s*\)/.exec(block.slice(keywordIndex))
            if (match) return [match[1], match[2], match[3]]
        }
        return fallback
    }
    return {
        offset: readXyz(['offset', 'at'], DEFAULT_MODEL_TRANSFORM.offset),
        scale: readXyz(['scale'], DEFAULT_MODEL_TRANSFORM.scale),
        rotate: readXyz(['rotate'], DEFAULT_MODEL_TRANSFORM.rotate),
    }
}

const emitModelBlock = (pathLiteral, transform) => {
    const xyzLine = (values) => `\t\t\t(xyz ${values[0]} ${values[1]} ${values[2]})`
    return [
        `\t(model ${pathLiteral}`,
        '\t\t(offset',
        xyzLine(transform.offset),
        '\t\t)',
        '\t\t(scale',
        xyzLine(transform.scale),
        '\t\t)',
        '\t\t(rotate',
        xyzLine(transform.rotate),
        '\t\t)',
        '\t)',
    ].join('\n')
}

const appendModelBlock = (footprint, modelBlock) => {
    const trimmed = footprint.trimEnd()
    const body = trimmed.slice(0, -1).trimEnd()
    return `${body}\n${modelBlock}\n)\n`
}

const normalizeHeader = (source) => {
    const trimmed = source.replace(/^\s+/, '')
    return trimmed.replace(/^\((?:module|footprint)\s+(\S+)\s+\(layer\s+(\S+)\)\s+\(tedit\s+\S+\)/, (full, name, layer) => {
        const quotedName = name.startsWith('"') ? name : `"${name}"`
        const quotedLayer = layer.startsWith('"') ? layer : `"${layer}"`
        return `(footprint ${quotedName} (layer ${quotedLayer})`
    })
}

const prepareFootprint = (filePath, model) => {
    const raw = fs.readFileSync(filePath, 'utf8')
    const base = normalizeHeader(stripModelBlocks(raw)).trimEnd() + '\n'
    if (!model) return base
    const transform = model.inheritTransform ? (readModelTransform(raw) ?? DEFAULT_MODEL_TRANSFORM) : DEFAULT_MODEL_TRANSFORM
    return appendModelBlock(base, emitModelBlock(model.path, transform))
}

const readSwitchFootprints = () => {
    const entries = {}
    for (const fileName of fs.readdirSync(switchDir)) {
        if (!fileName.startsWith('SW_Cherry_MX_PCB')) continue
        if (!fileName.endsWith('.kicad_mod')) continue
        const baseName = fileName.replace(/\.kicad_mod$/, '')
        const key = baseName.replace(/^SW_Cherry_MX_PCB_?/, '') || 'SW_Cherry_MX_PCB'
        entries[key] = prepareFootprint(path.join(switchDir, fileName), { path: SWITCH_MODEL_PATH, inheritTransform: true })
    }
    return entries
}

const formatCoordinate = (value) => {
    const rounded = Number(value.toFixed(6))
    return Object.is(rounded, -0) ? '0' : String(rounded)
}

const parsePads = (source) => {
    const pads = []
    let cursor = 0
    while (true) {
        const padIndex = source.indexOf('(pad', cursor)
        if (padIndex === -1) break
        const boundary = source[padIndex + '(pad'.length]
        if (boundary !== ' ' && boundary !== '\t' && boundary !== '\n') {
            cursor = padIndex + '(pad'.length
            continue
        }
        const closeIndex = findMatchingParen(source, padIndex)
        const block = source.slice(padIndex, closeIndex + 1)
        const nameMatch = /^\(pad\s+("(?:[^"\\]|\\.)*"|\S+)/.exec(block)
        const atMatch = /\(at\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(block)
        const sizeMatch = /\(size\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(block)
        const rawName = nameMatch ? nameMatch[1] : ''
        pads.push({
            name: rawName.startsWith('"') ? rawName.slice(1, -1) : rawName,
            x: atMatch ? Number(atMatch[1]) : 0,
            y: atMatch ? Number(atMatch[2]) : 0,
            width: sizeMatch ? Number(sizeMatch[1]) : 0,
            height: sizeMatch ? Number(sizeMatch[2]) : 0,
        })
        cursor = closeIndex + 1
    }
    return pads
}

const COORDINATE_KEYWORDS = ['at', 'start', 'end', 'center', 'mid', 'xy']

const translateCoordinates = (source, dx, dy) =>
    source
        .split('\n')
        .map((line) => {
            const trimmed = line.trimStart()
            const indent = line.slice(0, line.length - trimmed.length)
            for (const keyword of COORDINATE_KEYWORDS) {
                if (!trimmed.startsWith(`(${keyword} `)) continue
                const match = new RegExp(`^\\(${keyword} (-?[\\d.]+) (-?[\\d.]+)(.*)\\)$`).exec(trimmed)
                if (!match) return line
                const x = Number(match[1]) + dx
                const y = Number(match[2]) + dy
                return `${indent}(${keyword} ${formatCoordinate(x)} ${formatCoordinate(y)}${match[3]})`
            }
            return line
        })
        .join('\n')

const sizeMatches = (pad, diameter) => Math.abs(pad.width - diameter) < 0.001 && Math.abs(pad.height - diameter) < 0.001

const SWITCH_FIXATION_PIN_DIAMETER = 1.7
const SWITCH_CENTER_HOLE_DIAMETER = 4
const SOLDER_PAD_ONE_POSITION = { x: 2.54, y: -5.08 }
const SOLDER_PAD_TWO_POSITION = { x: -3.81, y: -2.54 }

const centerNormalizationShift = (source) => {
    const pads = parsePads(source)
    const fixationPins = pads.filter((pad) => sizeMatches(pad, SWITCH_FIXATION_PIN_DIAMETER))
    if (fixationPins.length !== 2) throw new Error(`expected 2 fixation pins, found ${fixationPins.length}`)
    const centerX = (fixationPins[0].x + fixationPins[1].x) / 2
    const centerY = (fixationPins[0].y + fixationPins[1].y) / 2
    return { dx: -centerX, dy: -centerY }
}

const assertNormalizedSolder = (source, footprintName) => {
    const pads = parsePads(source)
    const centerHole = pads.find((pad) => sizeMatches(pad, SWITCH_CENTER_HOLE_DIAMETER) && Math.abs(pad.x) < 1e-6 && Math.abs(pad.y) < 1e-6)
    if (!centerHole) throw new Error(`${footprintName}: 4mm center hole is not at (0 0) after normalization`)
    const padOne = pads.find((pad) => pad.name === '1')
    const padTwo = pads.find((pad) => pad.name === '2')
    if (!padOne || Math.abs(padOne.x - SOLDER_PAD_ONE_POSITION.x) > 1e-6 || Math.abs(padOne.y - SOLDER_PAD_ONE_POSITION.y) > 1e-6) {
        throw new Error(`${footprintName}: solder pad "1" did not normalize to the shared pin-one position`)
    }
    if (!padTwo || Math.abs(padTwo.x - SOLDER_PAD_TWO_POSITION.x) > 1e-6 || Math.abs(padTwo.y - SOLDER_PAD_TWO_POSITION.y) > 1e-6) {
        throw new Error(`${footprintName}: solder pad "2" did not normalize to the shared pin-two position`)
    }
}

const prepareSolderFootprint = (filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8')
    const { dx, dy } = centerNormalizationShift(raw)
    const translated = translateCoordinates(normalizeHeader(stripModelBlocks(raw)), dx, dy).trimEnd() + '\n'
    const out = appendModelBlock(translated, emitModelBlock(SWITCH_MODEL_PATH, DEFAULT_MODEL_TRANSFORM))
    assertNormalizedSolder(out, path.basename(filePath))
    return out
}

const copySolderSources = () => {
    if (!fs.existsSync(kicadSolderSourceDir)) return
    fs.mkdirSync(solderSwitchDir, { recursive: true })
    for (const fileName of fs.readdirSync(kicadSolderSourceDir)) {
        if (!/^SW_Cherry_MX_.+_PCB\.kicad_mod$/.test(fileName)) continue
        fs.copyFileSync(path.join(kicadSolderSourceDir, fileName), path.join(solderSwitchDir, fileName))
    }
}

const solderKeyFromBaseName = (baseName) => {
    const middle = baseName.replace(/^SW_Cherry_MX_/, '').replace(/_PCB$/, '')
    if (middle.endsWith('_Vertical')) return `${middle.replace(/_Vertical$/, '')}_90deg`
    return middle
}

const sizeKey = (size) => `${size.toFixed(2)}u`

const nearestSmaller = (size, sizes) => {
    const notLarger = sizes.filter((candidate) => candidate <= size + 0.001)
    if (notLarger.length > 0) return Math.max(...notLarger)
    return Math.min(...sizes)
}

const readSolderFootprints = () => {
    if (!fs.existsSync(solderSwitchDir)) return {}
    const official = {}
    for (const fileName of fs.readdirSync(solderSwitchDir)) {
        if (!/^SW_Cherry_MX_.+_PCB\.kicad_mod$/.test(fileName)) continue
        const baseName = fileName.replace(/\.kicad_mod$/, '')
        official[solderKeyFromBaseName(baseName)] = prepareSolderFootprint(path.join(solderSwitchDir, fileName))
    }
    return official
}

const resolveSolder = (key, official) => {
    if (official[key]) return official[key]
    if (key === 'SW_Cherry_MX_PCB') return official['1.00u']
    if (key.startsWith('ISOEnter')) return official['ISOEnter'] ?? official['1.00u']
    const match = /^(\d+(?:\.\d+)?)u(_90deg)?/.exec(key)
    if (!match) return official['1.00u']
    const size = Number(match[1])
    const vertical = Boolean(match[2])
    const horizontalSizes = Object.keys(official)
        .filter((candidate) => /^\d+(?:\.\d+)?u$/.test(candidate))
        .map((candidate) => Number.parseFloat(candidate))
    const verticalSizes = Object.keys(official)
        .filter((candidate) => /^\d+(?:\.\d+)?u_90deg$/.test(candidate))
        .map((candidate) => Number.parseFloat(candidate))
    if (vertical && verticalSizes.some((candidate) => candidate <= size + 0.001)) {
        return official[`${sizeKey(nearestSmaller(size, verticalSizes))}_90deg`]
    }
    return official[sizeKey(nearestSmaller(size, horizontalSizes))]
}

const buildSolderFootprints = (hotswapKeys, official) => {
    const entries = {}
    for (const key of hotswapKeys) {
        const resolved = resolveSolder(key, official)
        if (!resolved) throw new Error(`no solder footprint resolved for key ${key}`)
        entries[key] = resolved
    }
    return entries
}

const emitStringConstant = (name, value) => `export const ${name} = ${JSON.stringify(value)}\n`

const emitRecord = (name, record) => {
    const keys = Object.keys(record).sort()
    const body = keys.map((key) => `    ${JSON.stringify(key)}: ${JSON.stringify(record[key])},`).join('\n')
    return `export const ${name}: Record<string, string> = {\n${body}\n}\n`
}

copySolderSources()

const switchFootprints = readSwitchFootprints()
const solderFootprints = buildSolderFootprints(Object.keys(switchFootprints), readSolderFootprints())
const diodeFootprint = prepareFootprint(path.join(footprintRoot, 'Diode_THT.pretty', 'D_DO-35_SOD27_P7.62mm_Horizontal.kicad_mod'), {
    path: DIODE_MODEL_PATH,
    inheritTransform: false,
})
const encoderFootprint = prepareFootprint(
    path.join(footprintRoot, 'Rotary_Encoder.pretty', 'RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm.kicad_mod'),
)
const mountingHoleFootprint = prepareFootprint(path.join(footprintRoot, 'MountingHole.pretty', 'MountingHole_5.4mm_NPTH.kicad_mod'))
const stabilizerFootprint = prepareFootprint(path.join(footprintRoot, 'Mounting_Keyboard_Stabilizer.pretty', 'Stabilizer_Cherry_MX_2.00u.kicad_mod'))
const wirePadsFootprint = prepareFootprint(path.join(footprintRoot, 'Wire_Pads.pretty', 'WirePads_1x12_P2.54.kicad_mod'))

const output = [
    emitRecord('SWITCH_FOOTPRINTS', switchFootprints),
    emitRecord('SOLDER_SWITCH_FOOTPRINTS', solderFootprints),
    emitStringConstant('DIODE_DO35_FOOTPRINT', diodeFootprint),
    emitStringConstant('ENCODER_EC11_FOOTPRINT', encoderFootprint),
    emitStringConstant('MOUNTING_HOLE_FOOTPRINT', mountingHoleFootprint),
    emitStringConstant('STABILIZER_2U_FOOTPRINT', stabilizerFootprint),
    emitStringConstant('WIRE_PADS_1X12_FOOTPRINT', wirePadsFootprint),
].join('\n')

fs.writeFileSync(outputFile, output)
process.stdout.write(
    `generated ${path.relative(projectRoot, outputFile)} with ${Object.keys(switchFootprints).length} hotswap and ${Object.keys(solderFootprints).length} solder switch footprints\n`,
)
