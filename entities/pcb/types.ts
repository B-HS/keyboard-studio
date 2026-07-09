import { DIODE_OFFSET_BELOW_SWITCH_MM } from '@entities/pcb/constants'

export type MatrixAssignment = {
    rows: number
    cols: number
    perKey: { row: number; col: number }[]
    source: 'labels' | 'positional'
    warnings?: string[]
}

export type DiodeKind = 'do-35' | 'sod-123'

export type SwitchMount = 'solder' | 'hotswap'

export type PcbOptions = {
    diodesOnBack: boolean
    includeOutline: boolean
    edgeMargin: number
    diode: DiodeKind
    switchMount: SwitchMount
    diodeOffsetXMm: number
    diodeOffsetYMm: number
    stabFootprints: boolean
    mountingHoles: boolean
    switchRotation: 0 | 90 | 180 | 270
}

export const DEFAULT_PCB_OPTIONS: PcbOptions = {
    diodesOnBack: true,
    includeOutline: false,
    edgeMargin: 3,
    diode: 'do-35',
    switchMount: 'solder',
    diodeOffsetXMm: 0,
    diodeOffsetYMm: DIODE_OFFSET_BELOW_SWITCH_MM,
    stabFootprints: true,
    mountingHoles: false,
    switchRotation: 0,
}

export type SwitchNetAssignment = {
    colNet: number
    junctionNet: number
    rowNet: number
}

export type EncoderNetAssignment = {
    encoderIndex: number
    aNet: number
    bNet: number
    gndNet: number
}

export type Netlist = {
    nets: string[]
    switchNets: SwitchNetAssignment[]
    encoderNets: (EncoderNetAssignment | null)[]
    gndNet: number
}
