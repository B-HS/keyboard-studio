import { KleKeyboard } from '@entities/kle/types'
import { DIODE_PAD_HEIGHT_MM, DIODE_PAD_OFFSET_MM, DIODE_PAD_WIDTH_MM, STAB_BASE_OFFSET_MM } from '@entities/pcb/constants'
import {
    DIODE_DO35_FOOTPRINT,
    ENCODER_EC11_FOOTPRINT,
    MOUNTING_HOLE_FOOTPRINT,
    SOLDER_SWITCH_FOOTPRINTS,
    STABILIZER_2U_FOOTPRINT,
    SWITCH_FOOTPRINTS,
} from '@entities/pcb/footprint-data'
import { computePcbLayout } from '@entities/pcb/layout'
import { PcbOptions, SwitchNetAssignment } from '@entities/pcb/types'

const KICAD_FILE_VERSION = 20240108
const KICAD_GENERATOR_VERSION = '8.0'
const BOARD_THICKNESS_MM = 1.6
const EDGE_CUTS_STROKE_WIDTH_MM = 0.1
const SILK_LINE_WIDTH_MM = 0.12
const SILK_TEXT_SIZE_MM = 1
const SILK_TEXT_THICKNESS_MM = 0.15

const DIODE_VALUE = '1N4148'

const createUuidFactory = () => {
    let counter = 0
    return () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`
}

const escapeString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const formatNumber = (value: number) => {
    const rounded = Number(value.toFixed(6))
    return Object.is(rounded, -0) ? '0' : String(rounded)
}

const formatAngleSuffix = (angle: number) => (angle !== 0 ? ` ${formatNumber(angle)}` : '')

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

const readPadName = (padNode: string) => {
    let index = '(pad'.length
    while (index < padNode.length && /\s/.test(padNode[index])) index++
    if (padNode[index] === '"') {
        let cursor = index + 1
        let name = ''
        while (cursor < padNode.length) {
            const character = padNode[cursor]
            if (character === '\\') {
                name += padNode[cursor + 1]
                cursor += 2
                continue
            }
            if (character === '"') break
            name += character
            cursor++
        }
        return name
    }
    let cursor = index
    let name = ''
    while (cursor < padNode.length && !/[\s()]/.test(padNode[cursor])) {
        name += padNode[cursor]
        cursor++
    }
    return name
}

const bakePadAngle = (padNode: string, angle: number) => {
    const atIndex = padNode.indexOf('(at ')
    if (atIndex === -1) return padNode
    const atClose = findMatchingParen(padNode, atIndex)
    const inner = padNode.slice(atIndex + '(at '.length, atClose).trim()
    return `${padNode.slice(0, atIndex)}(at ${inner} ${formatNumber(angle)})${padNode.slice(atClose + 1)}`
}

const injectPadNet = (padNode: string, netIndex: number, netName: string) => {
    const netClause = ` (net ${netIndex} "${escapeString(netName)}")`
    const layersIndex = padNode.indexOf('(layers')
    if (layersIndex === -1) {
        const closeIndex = padNode.lastIndexOf(')')
        return `${padNode.slice(0, closeIndex)}${netClause}${padNode.slice(closeIndex)}`
    }
    const layersClose = findMatchingParen(padNode, layersIndex)
    return `${padNode.slice(0, layersClose + 1)}${netClause}${padNode.slice(layersClose + 1)}`
}

const transformPads = (source: string, angle: number, padNets: Record<string, { net: number; name: string }>) => {
    let result = ''
    let cursor = 0
    while (true) {
        const padIndex = source.indexOf('(pad', cursor)
        if (padIndex === -1) {
            result += source.slice(cursor)
            break
        }
        const boundary = source[padIndex + '(pad'.length]
        if (boundary !== ' ' && boundary !== '\t' && boundary !== '\n') {
            result += source.slice(cursor, padIndex + '(pad'.length)
            cursor = padIndex + '(pad'.length
            continue
        }
        const closeIndex = findMatchingParen(source, padIndex)
        let padNode = source.slice(padIndex, closeIndex + 1)
        if (angle !== 0) padNode = bakePadAngle(padNode, angle)
        const net = padNets[readPadName(padNode)]
        if (net) padNode = injectPadNet(padNode, net.net, net.name)
        result += source.slice(cursor, padIndex) + padNode
        cursor = closeIndex + 1
    }
    return result
}

const applyBackLayer = (source: string) => source.replace('(layer "F.Cu")', '(layer "B.Cu")')

type InstantiateOptions = {
    at: { x: number; y: number; angle: number }
    reference?: string
    value?: string
    backLayer?: boolean
    padNets?: Record<string, { net: number; name: string }>
    nextUuid: () => string
}

const instantiateFootprint = (source: string, options: InstantiateOptions) => {
    let out = source
    if (options.reference !== undefined) {
        const reference = escapeString(options.reference)
        out = out.replace(/\(property "Reference" "[^"]*"/, () => `(property "Reference" "${reference}"`)
        out = out.replace(/\(fp_text reference \S+/, () => `(fp_text reference "${reference}"`)
    }
    if (options.value !== undefined) {
        const value = escapeString(options.value)
        out = out.replace(/\(property "Value" "[^"]*"/, () => `(property "Value" "${value}"`)
        out = out.replace(/\(fp_text value \S+/, () => `(fp_text value "${value}"`)
    }
    out = out.replaceAll(/\(uuid "[^"]*"\)/g, () => `(uuid "${options.nextUuid()}")`)
    if (options.backLayer) out = applyBackLayer(out)
    const layerToken = options.backLayer ? '(layer "B.Cu")' : '(layer "F.Cu")'
    const placement = `\n\t\t(at ${formatNumber(options.at.x)} ${formatNumber(options.at.y)}${formatAngleSuffix(options.at.angle)})\n\t\t(uuid "${options.nextUuid()}")`
    out = out.replace(layerToken, `${layerToken}${placement}`)
    out = transformPads(out, options.at.angle, options.padNets ?? {})
    return out
        .split('\n')
        .map((line) => `\t${line}`)
        .join('\n')
        .trimEnd()
}

const resolveSwitchSource = (record: Record<string, string>, footprintKey: string) =>
    record[footprintKey] ?? record[footprintKey.replace('_90deg', '')] ?? record['SW_Cherry_MX_PCB']

const remapStabOffset = (source: string, offset: number) => {
    let result = ''
    let cursor = 0
    while (true) {
        const padIndex = source.indexOf('(pad', cursor)
        if (padIndex === -1) {
            result += source.slice(cursor)
            break
        }
        const closeIndex = findMatchingParen(source, padIndex)
        const padNode = source.slice(padIndex, closeIndex + 1)
        const atIndex = padNode.indexOf('(at ')
        const atClose = findMatchingParen(padNode, atIndex)
        const coordinates = padNode
            .slice(atIndex + '(at '.length, atClose)
            .trim()
            .split(/\s+/)
            .map(Number)
        if (Math.abs(Math.abs(coordinates[0]) - STAB_BASE_OFFSET_MM) < 0.0001) {
            coordinates[0] = Math.sign(coordinates[0]) * offset
        }
        const rewritten = `${padNode.slice(0, atIndex)}(at ${coordinates.map(formatNumber).join(' ')})${padNode.slice(atClose + 1)}`
        result += source.slice(cursor, padIndex) + rewritten
        cursor = closeIndex + 1
    }
    return result
}

const deriveStabFootprint = (sizeLabel: string, offset: number, base: boolean) => {
    if (base) return STABILIZER_2U_FOOTPRINT
    const renamed = STABILIZER_2U_FOOTPRINT.replace(/^\(footprint "[^"]*"/, `(footprint "Stabilizer_Cherry_MX_${sizeLabel}"`)
    return remapStabOffset(renamed, offset)
}

const buildTextProperty = (name: string, value: string, angle: number, layer: string, uuid: string) =>
    `\t\t(property "${name}" "${escapeString(value)}" (at 0 0${formatAngleSuffix(angle)}) (layer "${layer}") (uuid "${uuid}") (effects (font (size ${formatNumber(SILK_TEXT_SIZE_MM)} ${formatNumber(SILK_TEXT_SIZE_MM)}) (thickness ${formatNumber(SILK_TEXT_THICKNESS_MM)}))))`

const buildSurfacePad = (name: string, offsetX: number, layers: string[], netIndex: number, netName: string, uuid: string) => {
    const layerList = layers.map((layer) => `"${layer}"`).join(' ')
    return `\t\t(pad "${name}" smd rect (at ${formatNumber(offsetX)} 0) (size ${formatNumber(DIODE_PAD_WIDTH_MM)} ${formatNumber(DIODE_PAD_HEIGHT_MM)}) (layers ${layerList}) (net ${netIndex} "${escapeString(netName)}") (uuid "${uuid}"))`
}

const DIODE_CATHODE_MARK_OFFSET_MM = 2.2
const DIODE_CATHODE_MARK_HALF_HEIGHT_MM = 0.6

const buildCathodeMark = (layer: string, uuid: string) =>
    `\t\t(fp_line (start ${formatNumber(-DIODE_CATHODE_MARK_OFFSET_MM)} ${formatNumber(-DIODE_CATHODE_MARK_HALF_HEIGHT_MM)}) (end ${formatNumber(-DIODE_CATHODE_MARK_OFFSET_MM)} ${formatNumber(DIODE_CATHODE_MARK_HALF_HEIGHT_MM)}) (stroke (width ${formatNumber(SILK_LINE_WIDTH_MM)}) (type solid)) (layer "${layer}") (uuid "${uuid}"))`

const buildSod123Diode = (
    diodeCenter: { x: number; y: number },
    angle: number,
    reference: string,
    switchNet: SwitchNetAssignment,
    nets: string[],
    diodesOnBack: boolean,
    nextUuid: () => string,
) => {
    const copperLayer = diodesOnBack ? 'B.Cu' : 'F.Cu'
    const pasteLayer = diodesOnBack ? 'B.Paste' : 'F.Paste'
    const maskLayer = diodesOnBack ? 'B.Mask' : 'F.Mask'
    const silkLayer = diodesOnBack ? 'B.SilkS' : 'F.SilkS'
    const fabLayer = diodesOnBack ? 'B.Fab' : 'F.Fab'
    const surfaceLayers = [copperLayer, pasteLayer, maskLayer]
    return [
        '\t(footprint "keebforge:D_SOD-123"',
        `\t\t(layer "${copperLayer}")`,
        `\t\t(uuid "${nextUuid()}")`,
        `\t\t(at ${formatNumber(diodeCenter.x)} ${formatNumber(diodeCenter.y)}${formatAngleSuffix(angle)})`,
        '\t\t(attr smd)',
        buildTextProperty('Reference', reference, angle, silkLayer, nextUuid()),
        buildTextProperty('Value', DIODE_VALUE, angle, fabLayer, nextUuid()),
        buildCathodeMark(silkLayer, nextUuid()),
        buildSurfacePad('1', -DIODE_PAD_OFFSET_MM, surfaceLayers, switchNet.rowNet, nets[switchNet.rowNet], nextUuid()),
        buildSurfacePad('2', DIODE_PAD_OFFSET_MM, surfaceLayers, switchNet.junctionNet, nets[switchNet.junctionNet], nextUuid()),
        '\t)',
    ].join('\n')
}

const buildLayerTable = () =>
    [
        '\t(layers',
        '\t\t(0 "F.Cu" signal)',
        '\t\t(31 "B.Cu" signal)',
        '\t\t(32 "B.Adhes" user "B.Adhesive")',
        '\t\t(33 "F.Adhes" user "F.Adhesive")',
        '\t\t(34 "B.Paste" user)',
        '\t\t(35 "F.Paste" user)',
        '\t\t(36 "B.SilkS" user "B.Silkscreen")',
        '\t\t(37 "F.SilkS" user "F.Silkscreen")',
        '\t\t(38 "B.Mask" user)',
        '\t\t(39 "F.Mask" user)',
        '\t\t(40 "Dwgs.User" user "User.Drawings")',
        '\t\t(41 "Cmts.User" user "User.Comments")',
        '\t\t(42 "Eco1.User" user "User.Eco1")',
        '\t\t(43 "Eco2.User" user "User.Eco2")',
        '\t\t(44 "Edge.Cuts" user)',
        '\t\t(45 "Margin" user)',
        '\t\t(46 "B.CrtYd" user "B.Courtyard")',
        '\t\t(47 "F.CrtYd" user "F.Courtyard")',
        '\t\t(48 "B.Fab" user)',
        '\t\t(49 "F.Fab" user)',
        '\t)',
    ].join('\n')

const buildEdgeCuts = (board: { left: number; top: number; right: number; bottom: number }, uuid: string) =>
    `\t(gr_rect (start ${formatNumber(board.left)} ${formatNumber(board.top)}) (end ${formatNumber(board.right)} ${formatNumber(board.bottom)}) (stroke (width ${formatNumber(EDGE_CUTS_STROKE_WIDTH_MM)}) (type solid)) (fill none) (layer "Edge.Cuts") (uuid "${uuid}"))`

export const generateKicadPcb = (keyboard: KleKeyboard, options: PcbOptions) => {
    const nextUuid = createUuidFactory()
    const layout = computePcbLayout(keyboard, options)
    const { netlist, board, switches, diodes, stabilizers, mountingHoles } = layout
    const nets = netlist.nets
    const switchRecord = options.switchMount === 'hotswap' ? SWITCH_FOOTPRINTS : SOLDER_SWITCH_FOOTPRINTS

    const netDeclarations = nets.map((name, index) => `\t(net ${index} "${escapeString(name)}")`).join('\n')

    const footprintBlocks: string[] = []

    switches.forEach((item, ordinal) => {
        const encoderNet = netlist.encoderNets[ordinal]
        if (item.isEncoder && encoderNet) {
            footprintBlocks.push(
                instantiateFootprint(ENCODER_EC11_FOOTPRINT, {
                    at: { x: item.center.x, y: item.center.y, angle: item.angle },
                    reference: item.reference,
                    value: item.value,
                    padNets: {
                        S1: { net: item.colNet, name: nets[item.colNet] },
                        S2: { net: item.junctionNet, name: nets[item.junctionNet] },
                        A: { net: encoderNet.aNet, name: nets[encoderNet.aNet] },
                        B: { net: encoderNet.bNet, name: nets[encoderNet.bNet] },
                        C: { net: encoderNet.gndNet, name: nets[encoderNet.gndNet] },
                    },
                    nextUuid,
                }),
            )
        } else {
            const switchSource = resolveSwitchSource(switchRecord, item.footprintKey)
            footprintBlocks.push(
                instantiateFootprint(switchSource, {
                    at: { x: item.center.x, y: item.center.y, angle: item.angle },
                    reference: item.reference,
                    value: item.value,
                    padNets: {
                        '1': { net: item.colNet, name: nets[item.colNet] },
                        '2': { net: item.junctionNet, name: nets[item.junctionNet] },
                    },
                    nextUuid,
                }),
            )
        }

        if (options.diode === 'do-35') {
            const diode = diodes[ordinal]
            footprintBlocks.push(
                instantiateFootprint(DIODE_DO35_FOOTPRINT, {
                    at: { x: diode.origin.x, y: diode.origin.y, angle: diode.angle },
                    reference: diode.reference,
                    value: DIODE_VALUE,
                    backLayer: options.diodesOnBack,
                    padNets: {
                        '1': { net: diode.rowNet, name: nets[diode.rowNet] },
                        '2': { net: diode.junctionNet, name: nets[diode.junctionNet] },
                    },
                    nextUuid,
                }),
            )
        } else {
            const diode = diodes[ordinal]
            footprintBlocks.push(
                buildSod123Diode(diode.center, diode.angle, `D${ordinal + 1}`, netlist.switchNets[ordinal], nets, options.diodesOnBack, nextUuid),
            )
        }
    })

    stabilizers.forEach((stab, index) => {
        const source = deriveStabFootprint(stab.sizeLabel, stab.offset, stab.base)
        footprintBlocks.push(
            instantiateFootprint(source, {
                at: { x: stab.center.x, y: stab.center.y, angle: stab.angle },
                reference: `ST${index + 1}`,
                nextUuid,
            }),
        )
    })

    mountingHoles.forEach((hole, index) => {
        footprintBlocks.push(
            instantiateFootprint(MOUNTING_HOLE_FOOTPRINT, {
                at: { x: hole.x, y: hole.y, angle: 0 },
                reference: `H${index + 1}`,
                nextUuid,
            }),
        )
    })

    return [
        '(kicad_pcb',
        `\t(version ${KICAD_FILE_VERSION})`,
        '\t(generator "keebforge")',
        `\t(generator_version "${KICAD_GENERATOR_VERSION}")`,
        '\t(general',
        `\t\t(thickness ${formatNumber(BOARD_THICKNESS_MM)})`,
        '\t)',
        '\t(paper "A4")',
        buildLayerTable(),
        '\t(setup',
        '\t\t(pad_to_mask_clearance 0)',
        '\t)',
        netDeclarations,
        ...footprintBlocks,
        ...(options.includeOutline ? [buildEdgeCuts(board, nextUuid())] : []),
        ')',
    ].join('\n')
}
