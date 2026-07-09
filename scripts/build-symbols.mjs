import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const kicadSymbolRoot = '/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols'
const vendorDir = path.join(projectRoot, 'vendor', 'symbols')
const outputFile = path.join(projectRoot, 'entities', 'sch', 'symbol-data.ts')

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

const extractSymbolBlock = (source, symbolName) => {
    const needle = `(symbol "${symbolName}"`
    const openIndex = source.indexOf(needle)
    if (openIndex === -1) throw new Error(`symbol "${symbolName}" not found`)
    const closeIndex = findMatchingParen(source, openIndex)
    if (closeIndex === -1) throw new Error(`unbalanced parens while reading "${symbolName}"`)
    return source.slice(openIndex, closeIndex + 1)
}

const readLibraryVersion = (source) => {
    const match = source.match(/\(version\s+(\d+)\)/)
    return match ? match[1] : '20250114'
}

const wrapAsLibrary = (block, version) =>
    [
        '(kicad_symbol_lib',
        `\t(version ${version})`,
        '\t(generator "keebforge-build-symbols")',
        '\t(generator_version "10.0")',
        ...block.split('\n').map((line) => `\t${line}`),
        ')',
        '',
    ].join('\n')

const emitStringConstant = (name, value) => `export const ${name} = ${JSON.stringify(value)}\n`

const switchSource = fs.readFileSync(path.join(kicadSymbolRoot, 'Switch.kicad_sym'), 'utf8')
const deviceSource = fs.readFileSync(path.join(kicadSymbolRoot, 'Device.kicad_sym'), 'utf8')

const swPushBlock = extractSymbolBlock(switchSource, 'SW_Push')
const diodeBlock = extractSymbolBlock(deviceSource, 'D')

fs.mkdirSync(vendorDir, { recursive: true })
fs.writeFileSync(path.join(vendorDir, 'SW_Push.kicad_sym'), wrapAsLibrary(swPushBlock, readLibraryVersion(switchSource)))
fs.writeFileSync(path.join(vendorDir, 'D.kicad_sym'), wrapAsLibrary(diodeBlock, readLibraryVersion(deviceSource)))

const output = [emitStringConstant('SW_PUSH_SYMBOL', swPushBlock), emitStringConstant('DIODE_SYMBOL', diodeBlock)].join('\n')

fs.mkdirSync(path.dirname(outputFile), { recursive: true })
fs.writeFileSync(outputFile, output)
process.stdout.write(`generated ${path.relative(projectRoot, outputFile)} (SW_Push ${swPushBlock.length} chars, D ${diodeBlock.length} chars)\n`)
process.stdout.write(`wrote provenance to ${path.relative(projectRoot, vendorDir)}/{SW_Push,D}.kicad_sym\n`)
