import { describe, expect, test } from 'vitest'
import { parseKle } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { KleKey } from '@entities/kle/types'
import { assignMatrix } from '@entities/pcb/matrix'

const findPreset = (id: string) => {
    const preset = KLE_PRESETS.find((entry) => entry.id === id)
    if (!preset) throw new Error(`missing preset ${id}`)
    return preset
}

const isMatrixKey = (key: { decal: boolean; ghost: boolean }) => !key.decal && !key.ghost

const makeKey = (overrides: Partial<KleKey> = {}): KleKey => ({
    color: '#cccccc',
    labels: [],
    textColor: [],
    textSize: [],
    defaults: { textColor: '#000000', textSize: 3 },
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    x2: 0,
    y2: 0,
    width2: 1,
    height2: 1,
    rotationX: 0,
    rotationY: 0,
    rotationAngle: 0,
    decal: false,
    ghost: false,
    stepped: false,
    nub: false,
    profile: '',
    sm: '',
    sb: '',
    st: '',
    switchRotation: 0,
    stabRotation: 0,
    ...overrides,
})

const makeGrid = (rows: number, cols: number) => {
    const keys: KleKey[] = []
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) keys.push(makeKey({ x: col, y: row }))
    return keys
}

describe('kle-ng cluster port', () => {
    test('assigns distinct columns when two keys round to the same tentative cell', () => {
        const matrix = assignMatrix([makeKey({ x: 0.4, y: 0 }), makeKey({ x: 0.6, y: 0 })])
        expect(matrix.source).toBe('positional')
        expect(matrix.perKey[0].col).not.toBe(matrix.perKey[1].col)
        expect(matrix.perKey).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
        ])
    })

    test('emits a collision warning when overlapping keys are shifted to the next free slot', () => {
        const matrix = assignMatrix([makeKey({ x: 0.4, y: 0 }), makeKey({ x: 0.6, y: 0 })])
        expect(matrix.warnings).toBeDefined()
        expect(matrix.warnings?.some((warning) => warning.includes('collision'))).toBe(true)
    })

    test('gives every key a unique cell even when all keys share the same center', () => {
        const matrix = assignMatrix([makeKey(), makeKey(), makeKey(), makeKey()])
        const cells = new Set(matrix.perKey.filter((cell) => cell.row >= 0).map((cell) => `${cell.row},${cell.col}`))
        expect(cells.size).toBe(4)
        expect(matrix.perKey).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
            { row: 0, col: 3 },
        ])
    })

    test('produces no collision warning for a clean grid with no overlapping centers', () => {
        const matrix = assignMatrix(makeGrid(2, 2))
        expect(matrix.warnings).toBeUndefined()
    })

    test('marks ghost and decal keys as unassigned while regular keys keep a cell', () => {
        const matrix = assignMatrix([makeKey({ x: 0, y: 0, ghost: true }), makeKey({ x: 1, y: 0 }), makeKey({ x: 2, y: 0, decal: true })])
        expect(matrix.perKey[0]).toEqual({ row: -1, col: -1 })
        expect(matrix.perKey[1]).toEqual({ row: 0, col: 0 })
        expect(matrix.perKey[2]).toEqual({ row: -1, col: -1 })
    })

    test('assigns zero-based dense row and column indices to a regular grid', () => {
        const matrix = assignMatrix(makeGrid(2, 2))
        expect(matrix.perKey).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
        ])
    })

    test('annotates a single key at row zero column zero regardless of absolute position', () => {
        const matrix = assignMatrix([makeKey({ x: 5, y: 3 })])
        expect(matrix.rows).toBe(1)
        expect(matrix.cols).toBe(1)
        expect(matrix.perKey[0]).toEqual({ row: 0, col: 0 })
    })
})

describe('kle-ng cluster-symmetry port', () => {
    test('leaves a perfectly symmetric ortho grid equal to the plain cluster grid', () => {
        const keys = makeGrid(4, 6)
        const matrix = assignMatrix(keys)
        expect(matrix.rows).toBe(4)
        expect(matrix.cols).toBe(6)
        keys.forEach((_, index) => {
            expect(matrix.perKey[index]).toEqual({ row: Math.floor(index / 6), col: index % 6 })
        })
    })

    test('forces right-side columns to totalCols-1-leftCol on a symmetric split layout', () => {
        const keys: KleKey[] = []
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) keys.push(makeKey({ x: col, y: row }))
            for (let col = 0; col < 3; col++) keys.push(makeKey({ x: 5 + col, y: row }))
        }
        const matrix = assignMatrix(keys)
        expect(matrix.cols).toBe(6)
        const totalCols = matrix.cols
        const rowBuckets = new Map<number, { col: number; centerX: number }[]>()
        keys.forEach((key, index) => {
            const cell = matrix.perKey[index]
            const bucket = rowBuckets.get(cell.row)
            const entry = { col: cell.col, centerX: key.x + 0.5 }
            if (bucket) bucket.push(entry)
            else rowBuckets.set(cell.row, [entry])
        })
        const axis = (0 + 7) / 2
        for (const bucket of rowBuckets.values()) {
            const left = bucket.filter((entry) => entry.centerX < axis).sort((a, b) => a.centerX - b.centerX)
            const right = bucket.filter((entry) => entry.centerX > axis).sort((a, b) => a.centerX - b.centerX)
            expect(left.length).toBe(right.length)
            left.forEach((entry, position) => {
                const twin = right[left.length - 1 - position]
                expect(twin.col).toBe(totalCols - 1 - entry.col)
            })
        }
    })

    test('keeps a center key on the symmetry column when total columns is odd', () => {
        const matrix = assignMatrix([
            makeKey({ x: 0, y: 0 }),
            makeKey({ x: 1, y: 0 }),
            makeKey({ x: 2, y: 0 }),
            makeKey({ x: 3, y: 0 }),
            makeKey({ x: 4, y: 0 }),
        ])
        expect(matrix.cols).toBe(5)
        expect(matrix.perKey[2].col).toBe(2)
        expect(matrix.perKey[0].col).toBe(0)
        expect(matrix.perKey[4].col).toBe(4)
    })

    test('falls back to the plain cluster grid when one side has an extra unpaired key', () => {
        const keys = makeGrid(3, 3)
        keys.push(makeKey({ x: 4, y: 1 }))
        const matrix = assignMatrix(keys)
        expect(matrix.rows).toBe(3)
        expect(matrix.cols).toBe(4)
        expect(matrix.perKey[9]).toEqual({ row: 1, col: 3 })
        for (let index = 0; index < 9; index++) expect(matrix.perKey[index]).toEqual({ row: Math.floor(index / 3), col: index % 3 })
    })

    test('still produces a valid single row when a right-side key breaks the vertical match', () => {
        const matrix = assignMatrix([makeKey({ x: 0, y: 0 }), makeKey({ x: 1, y: 0 }), makeKey({ x: 2, y: 0.2 }), makeKey({ x: 3, y: 0 })])
        expect(matrix.rows).toBe(1)
        expect(matrix.cols).toBe(4)
        const cells = new Set(matrix.perKey.map((cell) => `${cell.row},${cell.col}`))
        expect(cells.size).toBe(4)
    })
})

describe('assignMatrix label mode', () => {
    test('uses coordinate labels when every matrix key carries one', () => {
        const keyboard = parseKle([
            ['0,0', '0,1'],
            ['1,0', '1,1'],
        ])
        const matrix = assignMatrix(keyboard.keys)
        expect(matrix.source).toBe('labels')
        expect(matrix.warnings).toBeUndefined()
        expect(matrix.rows).toBe(2)
        expect(matrix.cols).toBe(2)
        expect(matrix.perKey).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
        ])
    })

    test('explicit labels win over what positional inference would produce', () => {
        const keyboard = parseKle([
            ['1,1', '1,0'],
            ['0,1', '0,0'],
        ])
        const matrix = assignMatrix(keyboard.keys)
        expect(matrix.source).toBe('labels')
        expect(matrix.perKey).toEqual([
            { row: 1, col: 1 },
            { row: 1, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 0 },
        ])
    })

    test('a single missing coordinate label falls back to positional inference', () => {
        const keyboard = parseKle([['0,0', 'Legend']])
        const matrix = assignMatrix(keyboard.keys)
        expect(matrix.source).toBe('positional')
    })

    test('decal keys are excluded and marked -1 while labels still drive the matrix', () => {
        const keyboard = parseKle([['0,0', { d: true }, 'Decal', '0,1']])
        const matrix = assignMatrix(keyboard.keys)
        expect(matrix.source).toBe('labels')
        expect(matrix.perKey[0]).toEqual({ row: 0, col: 0 })
        expect(matrix.perKey[1]).toEqual({ row: -1, col: -1 })
        expect(matrix.perKey[2]).toEqual({ row: 0, col: 1 })
    })

    test('duplicate coordinate labels fall back to positional and populate warnings', () => {
        const keyboard = parseKle([
            ['0,0', '0,0'],
            ['1,0', '1,1'],
        ])
        const matrix = assignMatrix(keyboard.keys)
        expect(matrix.source).toBe('positional')
        expect(matrix.warnings).toBeDefined()
        expect(matrix.warnings?.length).toBeGreaterThan(0)
        expect(matrix.warnings?.[0]).toContain('0,0')
        expect(matrix.rows).toBe(2)
        expect(matrix.cols).toBe(2)
        expect(matrix.perKey).toEqual([
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
        ])
    })
})

describe('assignMatrix positional dimensions', () => {
    test('ansi-60 infers exactly five rows and fourteen columns', () => {
        const matrix = assignMatrix(parseKle(findPreset('ansi-60').raw).keys)
        expect(matrix.source).toBe('positional')
        expect(matrix.rows).toBe(5)
        expect(matrix.cols).toBe(14)
    })

    test('ortho-40 infers exactly four rows and twelve columns', () => {
        const matrix = assignMatrix(parseKle(findPreset('ortho-40').raw).keys)
        expect(matrix.source).toBe('positional')
        expect(matrix.rows).toBe(4)
        expect(matrix.cols).toBe(12)
    })

    test('ansi-tkl infers six rows', () => {
        const matrix = assignMatrix(parseKle(findPreset('ansi-tkl').raw).keys)
        expect(matrix.rows).toBe(6)
    })

    test('ansi-104 infers six rows', () => {
        const matrix = assignMatrix(parseKle(findPreset('ansi-104').raw).keys)
        expect(matrix.rows).toBe(6)
    })

    test('alice stays within six rows and sixteen columns', () => {
        const matrix = assignMatrix(parseKle(findPreset('alice').raw).keys)
        expect(matrix.rows).toBe(5)
        expect(matrix.cols).toBe(15)
        expect(matrix.rows).toBeLessThanOrEqual(6)
        expect(matrix.cols).toBeLessThanOrEqual(16)
    })
})

describe('assignMatrix positional invariants across every preset', () => {
    for (const preset of KLE_PRESETS) {
        test(`${preset.id} assigns every matrix key without duplicates`, () => {
            const keyboard = parseKle(preset.raw)
            const matrix = assignMatrix(keyboard.keys)

            expect(matrix.perKey.length).toBe(keyboard.keys.length)

            const occupied = new Set<string>()
            keyboard.keys.forEach((key, index) => {
                const assignment = matrix.perKey[index]
                if (isMatrixKey(key)) {
                    expect(assignment.row).toBeGreaterThanOrEqual(0)
                    expect(assignment.row).toBeLessThan(matrix.rows)
                    expect(assignment.col).toBeGreaterThanOrEqual(0)
                    expect(assignment.col).toBeLessThan(matrix.cols)
                    const cell = `${assignment.row},${assignment.col}`
                    expect(occupied.has(cell)).toBe(false)
                    occupied.add(cell)
                } else {
                    expect(assignment).toEqual({ row: -1, col: -1 })
                }
            })
        })

        test(`${preset.id} produces compacted rows and columns`, () => {
            const matrix = assignMatrix(parseKle(preset.raw).keys)
            const assigned = matrix.perKey.filter((assignment) => assignment.row >= 0 && assignment.col >= 0)

            const maxRow = Math.max(...assigned.map((assignment) => assignment.row))
            const maxCol = Math.max(...assigned.map((assignment) => assignment.col))
            expect(matrix.rows).toBe(maxRow + 1)
            expect(matrix.cols).toBe(maxCol + 1)

            const usedRows = new Set(assigned.map((assignment) => assignment.row))
            const usedCols = new Set(assigned.map((assignment) => assignment.col))
            for (let row = 0; row < matrix.rows; row++) expect(usedRows.has(row)).toBe(true)
            for (let col = 0; col < matrix.cols; col++) expect(usedCols.has(col)).toBe(true)
        })

        test(`${preset.id} inference is deterministic across repeated runs`, () => {
            const first = assignMatrix(parseKle(preset.raw).keys)
            const second = assignMatrix(parseKle(preset.raw).keys)
            expect(first).toEqual(second)
        })
    }
})
