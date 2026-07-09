import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { assignMatrix } from '@entities/pcb/matrix'
import { buildNetlist } from '@entities/pcb/netlist'
import { MatrixAssignment } from '@entities/pcb/types'

const twoByTwo: MatrixAssignment = {
    rows: 2,
    cols: 2,
    source: 'labels',
    perKey: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
    ],
}

describe('buildNetlist structure', () => {
    test('net zero is the empty string', () => {
        const { nets } = buildNetlist(twoByTwo)
        expect(nets[0]).toBe('')
    })

    test('net count is rows + cols + keys + 1', () => {
        const { nets, switchNets } = buildNetlist(twoByTwo)
        expect(nets.length).toBe(2 + 2 + 4 + 1)
        expect(switchNets.length).toBe(4)
    })

    test('row and column nets precede junction nets', () => {
        const { nets } = buildNetlist(twoByTwo)
        expect(nets.slice(0, 5)).toEqual(['', 'ROW0', 'ROW1', 'COL0', 'COL1'])
        expect(nets.slice(5)).toEqual(['N_R0_C0', 'N_R0_C1', 'N_R1_C0', 'N_R1_C1'])
    })
})

describe('buildNetlist COL2ROW mapping', () => {
    test('each switch maps pin1 to its column and pin2 to its junction', () => {
        const { nets, switchNets } = buildNetlist(twoByTwo)
        expect(nets[switchNets[0].colNet]).toBe('COL0')
        expect(nets[switchNets[0].rowNet]).toBe('ROW0')
        expect(nets[switchNets[0].junctionNet]).toBe('N_R0_C0')
        expect(nets[switchNets[3].colNet]).toBe('COL1')
        expect(nets[switchNets[3].rowNet]).toBe('ROW1')
        expect(nets[switchNets[3].junctionNet]).toBe('N_R1_C1')
    })

    test('junction nets are unique per physical key', () => {
        const { switchNets } = buildNetlist(twoByTwo)
        const junctions = switchNets.map((entry) => entry.junctionNet)
        expect(new Set(junctions).size).toBe(junctions.length)
    })
})

describe('buildNetlist over an inferred preset', () => {
    test('ansi-60 declares one net per row, column and key plus net zero', () => {
        const matrix = assignMatrix(parseKle(KLE_PRESETS[0].raw).keys)
        const { nets, switchNets } = buildNetlist(matrix)
        const physicalCount = matrix.perKey.filter((assignment) => assignment.row >= 0).length
        expect(nets.length).toBe(1 + matrix.rows + matrix.cols + physicalCount)
        expect(switchNets.length).toBe(physicalCount)
    })
})
