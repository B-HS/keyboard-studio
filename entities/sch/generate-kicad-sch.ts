import { KleKeyboard } from '@entities/kle/types'
import { assignMatrix } from '@entities/pcb/matrix'
import { orderPhysicalKeys } from '@entities/pcb/netlist'
import { DIODE_SYMBOL, SW_PUSH_SYMBOL } from '@entities/sch/symbol-data'

const KICAD_SCH_VERSION = 20250114
const GENERATOR = 'keebforge'
const GENERATOR_VERSION = '9.0'
const PROJECT_NAME = 'keebforge'
const SWITCH_LIB_ID = 'Switch:SW_Push'
const DIODE_LIB_ID = 'Device:D'
const DIODE_VALUE = '1N4148'
const SWITCH_VALUE = 'SW_Push'

const SWITCH_PIN_HALF_MM = 5.08
const DIODE_PIN_HALF_MM = 3.81
const WIRE_STUB_MM = 2.54
const DIODE_SPAN_MM = 2 * DIODE_PIN_HALF_MM
const CELL_SPAN_MM = 2 * SWITCH_PIN_HALF_MM + WIRE_STUB_MM + DIODE_SPAN_MM
const LABEL_TEXT_ALLOWANCE_MM = 8.89
const CELL_GAP_MM = 2.54
const COL_PITCH_MM = CELL_SPAN_MM + 2 * LABEL_TEXT_ALLOWANCE_MM + CELL_GAP_MM
const ROW_PITCH_MM = 20.32
const GRID_ORIGIN_X_MM = 38.1
const GRID_ORIGIN_Y_MM = 25.4
const REFERENCE_OFFSET_MM = 2.54
const FONT_SIZE_MM = 1.27
const PAGE_MARGIN_MM = 12.7

const STANDARD_PAGES = [
    { name: 'A4', width: 297, height: 210 },
    { name: 'A3', width: 420, height: 297 },
    { name: 'A2', width: 594, height: 420 },
    { name: 'A1', width: 841, height: 594 },
    { name: 'A0', width: 1189, height: 841 },
]

const escapeString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const formatNumber = (value: number) => {
    const rounded = Number(value.toFixed(6))
    return Object.is(rounded, -0) ? '0' : String(rounded)
}

const createUuidFactory = () => {
    let counter = 0
    return () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`
}

const indentBlock = (block: string, indent: string) =>
    block
        .split('\n')
        .map((line) => `${indent}${line}`)
        .join('\n')

const buildLibSymbols = () => {
    const switchBlock = SW_PUSH_SYMBOL.replace('(symbol "SW_Push"', `(symbol "${SWITCH_LIB_ID}"`)
    const diodeBlock = DIODE_SYMBOL.replace('(symbol "D"', `(symbol "${DIODE_LIB_ID}"`)
    return ['\t(lib_symbols', indentBlock(switchBlock, '\t\t'), indentBlock(diodeBlock, '\t\t'), '\t)'].join('\n')
}

const buildEffects = (hidden: boolean) =>
    `(effects (font (size ${formatNumber(FONT_SIZE_MM)} ${formatNumber(FONT_SIZE_MM)}))${hidden ? ' (hide yes)' : ''})`

const buildProperty = (name: string, value: string, x: number, y: number, hidden: boolean) =>
    `\t\t(property "${escapeString(name)}" "${escapeString(value)}" (at ${formatNumber(x)} ${formatNumber(y)} 0) ${buildEffects(hidden)})`

const buildSymbolInstance = (
    libId: string,
    reference: string,
    value: string,
    x: number,
    y: number,
    angle: number,
    rootUuid: string,
    nextUuid: () => string,
) =>
    [
        `\t(symbol (lib_id "${libId}") (at ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(angle)}) (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${nextUuid()}")`,
        buildProperty('Reference', reference, x, y - REFERENCE_OFFSET_MM, false),
        buildProperty('Value', value, x, y + REFERENCE_OFFSET_MM, true),
        buildProperty('Footprint', '', x, y, true),
        buildProperty('Datasheet', '~', x, y, true),
        `\t\t(pin "1" (uuid "${nextUuid()}"))`,
        `\t\t(pin "2" (uuid "${nextUuid()}"))`,
        `\t\t(instances (project "${PROJECT_NAME}" (path "/${rootUuid}" (reference "${escapeString(reference)}") (unit 1))))`,
        '\t)',
    ].join('\n')

const buildWire = (x1: number, y1: number, x2: number, y2: number, uuid: string) =>
    `\t(wire (pts (xy ${formatNumber(x1)} ${formatNumber(y1)}) (xy ${formatNumber(x2)} ${formatNumber(y2)})) (stroke (width 0) (type default)) (uuid "${uuid}"))`

const buildGlobalLabel = (net: string, x: number, y: number, angle: number, justify: string, uuid: string) =>
    `\t(global_label "${escapeString(net)}" (shape input) (at ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(angle)}) (fields_autoplaced) (effects (font (size ${formatNumber(FONT_SIZE_MM)} ${formatNumber(FONT_SIZE_MM)})) (justify ${justify})) (uuid "${uuid}"))`

const selectPaper = (cols: number, rows: number) => {
    const contentWidth =
        GRID_ORIGIN_X_MM +
        Math.max(cols - 1, 0) * COL_PITCH_MM +
        SWITCH_PIN_HALF_MM +
        WIRE_STUB_MM +
        DIODE_SPAN_MM +
        LABEL_TEXT_ALLOWANCE_MM +
        PAGE_MARGIN_MM
    const contentHeight = GRID_ORIGIN_Y_MM + Math.max(rows - 1, 0) * ROW_PITCH_MM + LABEL_TEXT_ALLOWANCE_MM + PAGE_MARGIN_MM
    for (const page of STANDARD_PAGES) {
        if (contentWidth <= page.width && contentHeight <= page.height) return `(paper "${page.name}")`
    }
    return `(paper "User" ${formatNumber(Math.ceil(contentWidth))} ${formatNumber(Math.ceil(contentHeight))})`
}

export const generateKicadSch = (keyboard: KleKeyboard) => {
    const nextUuid = createUuidFactory()
    const rootUuid = nextUuid()
    const matrix = assignMatrix(keyboard.keys)
    const order = orderPhysicalKeys(matrix)

    const body: string[] = []
    order.forEach((keyIndex, ordinal) => {
        const { row, col } = matrix.perKey[keyIndex]
        const gridX = GRID_ORIGIN_X_MM + col * COL_PITCH_MM
        const gridY = GRID_ORIGIN_Y_MM + row * ROW_PITCH_MM
        const switchPin1X = gridX - SWITCH_PIN_HALF_MM
        const switchPin2X = gridX + SWITCH_PIN_HALF_MM
        const diodeAnodeX = switchPin2X + WIRE_STUB_MM
        const diodeCenterX = diodeAnodeX + DIODE_PIN_HALF_MM
        const diodeCathodeX = diodeCenterX + DIODE_PIN_HALF_MM

        body.push(buildSymbolInstance(SWITCH_LIB_ID, `SW${ordinal + 1}`, SWITCH_VALUE, gridX, gridY, 0, rootUuid, nextUuid))
        body.push(buildSymbolInstance(DIODE_LIB_ID, `D${ordinal + 1}`, DIODE_VALUE, diodeCenterX, gridY, 180, rootUuid, nextUuid))
        body.push(buildWire(switchPin2X, gridY, diodeAnodeX, gridY, nextUuid()))
        body.push(buildGlobalLabel(`COL${col}`, switchPin1X, gridY, 180, 'right', nextUuid()))
        body.push(buildGlobalLabel(`ROW${row}`, diodeCathodeX, gridY, 0, 'left', nextUuid()))
    })

    return [
        '(kicad_sch',
        `\t(version ${KICAD_SCH_VERSION})`,
        `\t(generator "${GENERATOR}")`,
        `\t(generator_version "${GENERATOR_VERSION}")`,
        `\t(uuid "${rootUuid}")`,
        `\t${selectPaper(matrix.cols, matrix.rows)}`,
        buildLibSymbols(),
        ...body,
        '\t(sheet_instances (path "/" (page "1")))',
        '\t(embedded_fonts no)',
        ')',
    ].join('\n')
}

const sanitizeProjectName = (name: string) => name.replace(/\.kicad_pro$/, '').replace(/[^A-Za-z0-9._-]/g, '_') || PROJECT_NAME

export const generateKicadPro = (name: string) => {
    const projectName = sanitizeProjectName(name)
    const project = {
        board: {
            design_settings: { defaults: {}, rules: {} },
            layer_presets: [],
            viewports: [],
        },
        boards: [],
        libraries: { pinned_footprint_libs: [], pinned_symbol_libs: [] },
        meta: { filename: `${projectName}.kicad_pro`, version: 3 },
        net_settings: {
            classes: [
                {
                    bus_width: 12,
                    clearance: 0.2,
                    diff_pair_gap: 0.25,
                    diff_pair_via_gap: 0.25,
                    diff_pair_width: 0.2,
                    line_style: 0,
                    microvia_diameter: 0.3,
                    microvia_drill: 0.1,
                    name: 'Default',
                    pcb_color: 'rgba(0, 0, 0, 0.000)',
                    priority: 2147483647,
                    schematic_color: 'rgba(0, 0, 0, 0.000)',
                    track_width: 0.25,
                    via_diameter: 0.6,
                    via_drill: 0.3,
                    wire_width: 6,
                },
            ],
            meta: { version: 5 },
        },
        pcbnew: { last_paths: {}, page_layout_descr_file: '' },
        schematic: {
            legacy_lib_dir: '',
            legacy_lib_list: [],
            top_level_sheets: [{ filename: `${projectName}.kicad_sch`, name: projectName, uuid: '00000000-0000-0000-0000-000000000000' }],
        },
        sheets: [],
        text_variables: {},
    }
    return `${JSON.stringify(project, null, 2)}\n`
}
