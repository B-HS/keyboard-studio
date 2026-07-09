import { getKeyCenterU } from '@entities/kle/geometry'
import { KleKey } from '@entities/kle/types'
import { MatrixAssignment } from '@entities/pcb/types'

const COORDINATE_LABEL_PATTERN = /^(\d+),(\d+)$/
const ROTATION_EPSILON_DEG = 1e-6
const SYMMETRY_POSITION_TOLERANCE_U = 0.05
const SYMMETRY_ROTATION_TOLERANCE_DEG = 0.5
const SYMMETRY_AXIS_TOLERANCE_U = 0.05

type CoordinateLabel = { row: number; col: number }

type Center = { x: number; y: number }

type VariantResult = {
    rows: number[]
    cols: number[]
    collisions: number
    numRows: number
    numCols: number
    matrixMax: number
    matrixSum: number
    wireLength: number
}

type SymmetryPair = { leftIndex: number; rightIndex: number }

type SymmetryInfo = { axis: number; pairs: SymmetryPair[]; centerIndexes: number[] }

const isMatrixKey = (key: KleKey) => !key.decal && !key.ghost

const worldCenter = (key: KleKey): Center => getKeyCenterU(key)

const flatCenter = (key: KleKey): Center => ({ x: key.x + key.width / 2, y: key.y + key.height / 2 })

const distance = (a: Center, b: Center) => Math.hypot(a.x - b.x, a.y - b.y)

const readCoordinateLabel = (key: KleKey): CoordinateLabel | null => {
    for (const label of key.labels) {
        if (typeof label !== 'string') continue
        const match = label.match(COORDINATE_LABEL_PATTERN)
        if (match) return { row: Number(match[1]), col: Number(match[2]) }
    }
    return null
}

const findDuplicateCoordinate = (labels: (CoordinateLabel | null)[]) => {
    const seen = new Set<string>()
    for (const label of labels) {
        if (!label) continue
        const key = `${label.row},${label.col}`
        if (seen.has(key)) return label
        seen.add(key)
    }
    return null
}

const assignFromLabels = (keys: KleKey[], matrixKeyIndexes: number[], labels: (CoordinateLabel | null)[]) => {
    const perKey = keys.map(() => ({ row: -1, col: -1 }))
    let maxRow = -1
    let maxCol = -1
    matrixKeyIndexes.forEach((keyIndex, position) => {
        const label = labels[position]
        if (!label) return
        perKey[keyIndex] = { row: label.row, col: label.col }
        if (label.row > maxRow) maxRow = label.row
        if (label.col > maxCol) maxCol = label.col
    })
    return { rows: maxRow + 1, cols: maxCol + 1, perKey, source: 'labels' as const }
}

const denseReindex = (values: number[]) => {
    const order = Array.from(new Set(values)).sort((left, right) => left - right)
    const rank = new Map<number, number>()
    order.forEach((value, index) => rank.set(value, index))
    return values.map((value) => rank.get(value) ?? 0)
}

const groupPositionsBy = (length: number, keyOf: (position: number) => number) => {
    const groups = new Map<number, number[]>()
    for (let position = 0; position < length; position++) {
        const key = keyOf(position)
        const bucket = groups.get(key)
        if (bucket) bucket.push(position)
        else groups.set(key, [position])
    }
    return groups
}

const approximateWireLength = (centers: Center[], rows: number[], cols: number[]) => {
    const byRow = groupPositionsBy(centers.length, (position) => rows[position])
    const byCol = groupPositionsBy(centers.length, (position) => cols[position])
    let total = 0
    byRow.forEach((positions) => {
        const ordered = [...positions].sort((left, right) => centers[left].x - centers[right].x)
        for (let index = 1; index < ordered.length; index++) total += distance(centers[ordered[index - 1]], centers[ordered[index]])
    })
    byCol.forEach((positions) => {
        const ordered = [...positions].sort((left, right) => centers[left].y - centers[right].y)
        for (let index = 1; index < ordered.length; index++) total += distance(centers[ordered[index - 1]], centers[ordered[index]])
    })
    return total
}

const annotateVariant = (centers: Center[]): VariantResult => {
    const rawRows = centers.map((center) => Math.round(center.y))
    const tentativeCols = centers.map((center) => Math.round(center.x))
    const rowToPositions = groupPositionsBy(centers.length, (position) => rawRows[position])

    const finalCols = new Array<number>(centers.length).fill(0)
    let collisions = 0
    rowToPositions.forEach((positions) => {
        const ordered = [...positions].sort((left, right) => {
            if (tentativeCols[left] !== tentativeCols[right]) return tentativeCols[left] - tentativeCols[right]
            return centers[left].x - centers[right].x
        })
        const used = new Set<number>()
        ordered.forEach((position) => {
            let column = tentativeCols[position]
            if (used.has(column)) {
                collisions++
                while (used.has(column)) column++
            }
            used.add(column)
            finalCols[position] = column
        })
    })

    const rows = denseReindex(rawRows)
    const cols = denseReindex(finalCols)
    const numRows = new Set(rows).size
    const numCols = new Set(cols).size
    return {
        rows,
        cols,
        collisions,
        numRows,
        numCols,
        matrixMax: Math.max(numRows, numCols),
        matrixSum: numRows + numCols,
        wireLength: approximateWireLength(centers, rows, cols),
    }
}

const variantBetter = (candidate: VariantResult, incumbent: VariantResult) => {
    const candidateScore = [candidate.matrixMax, candidate.matrixSum, candidate.wireLength]
    const incumbentScore = [incumbent.matrixMax, incumbent.matrixSum, incumbent.wireLength]
    for (let index = 0; index < candidateScore.length; index++) {
        if (candidateScore[index] < incumbentScore[index]) return true
        if (candidateScore[index] > incumbentScore[index]) return false
    }
    return false
}

const splitLayoutByRotation = (keys: KleKey[]) => {
    const groups: KleKey[][] = []
    const processed = new Set<KleKey>()
    for (const key of keys) {
        if (processed.has(key)) continue
        const group = keys.filter(
            (other) =>
                !processed.has(other) &&
                Math.abs(key.rotationAngle - other.rotationAngle) < ROTATION_EPSILON_DEG &&
                Math.abs(key.rotationX - other.rotationX) < ROTATION_EPSILON_DEG &&
                Math.abs(key.rotationY - other.rotationY) < ROTATION_EPSILON_DEG,
        )
        if (group.length === 0) continue
        groups.push(group)
        group.forEach((member) => processed.add(member))
    }
    return groups
}

const hasRotationClusters = (keys: KleKey[]) =>
    splitLayoutByRotation(keys).some((group) => Math.abs(group[0].rotationAngle) > ROTATION_EPSILON_DEG && group.length >= 2)

const runClusterAlgorithm = (regularKeys: KleKey[]) => {
    const worldCenters = regularKeys.map(worldCenter)
    const variantWorld = annotateVariant(worldCenters)
    if (!hasRotationClusters(regularKeys)) return { rows: variantWorld.rows, cols: variantWorld.cols, collisions: variantWorld.collisions }
    const variantFlat = annotateVariant(regularKeys.map(flatCenter))
    const chosen = variantBetter(variantFlat, variantWorld) ? variantFlat : variantWorld
    return { rows: chosen.rows, cols: chosen.cols, collisions: chosen.collisions }
}

const detectSymmetry = (regularKeys: KleKey[], centers: Center[]): SymmetryInfo | null => {
    const count = regularKeys.length
    if (count === 0) return null

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    for (const center of centers) {
        if (center.x < minX) minX = center.x
        if (center.x > maxX) maxX = center.x
    }
    const axis = (minX + maxX) / 2

    const matched = new Array<boolean>(count).fill(false)
    const pairs: SymmetryPair[] = []
    const centerIndexes: number[] = []

    for (let index = 0; index < count; index++) {
        if (matched[index]) continue
        const center = centers[index]
        const angle = regularKeys[index].rotationAngle
        const mirrorX = 2 * axis - center.x

        if (Math.abs(mirrorX - center.x) < SYMMETRY_AXIS_TOLERANCE_U) {
            if (Math.abs(angle) > SYMMETRY_ROTATION_TOLERANCE_DEG) return null
            matched[index] = true
            centerIndexes.push(index)
            continue
        }

        let bestIndex = -1
        let bestDistance = Number.POSITIVE_INFINITY
        for (let other = 0; other < count; other++) {
            if (other === index || matched[other]) continue
            const otherCenter = centers[other]
            if (Math.abs(regularKeys[other].rotationAngle + angle) > SYMMETRY_ROTATION_TOLERANCE_DEG) continue
            const deltaX = otherCenter.x - mirrorX
            const deltaY = otherCenter.y - center.y
            if (Math.abs(deltaX) > SYMMETRY_POSITION_TOLERANCE_U || Math.abs(deltaY) > SYMMETRY_POSITION_TOLERANCE_U) continue
            const gap = Math.hypot(deltaX, deltaY)
            if (gap < bestDistance) {
                bestDistance = gap
                bestIndex = other
            }
        }
        if (bestIndex < 0) return null

        matched[index] = true
        matched[bestIndex] = true
        const leftIndex = center.x < centers[bestIndex].x ? index : bestIndex
        const rightIndex = leftIndex === index ? bestIndex : index
        pairs.push({ leftIndex, rightIndex })
    }

    for (let index = 0; index < count; index++) if (!matched[index]) return null
    return { axis, pairs, centerIndexes }
}

const enforceSymmetry = (baseRows: number[], baseCols: number[], info: SymmetryInfo) => {
    let totalCols = 0
    for (const col of baseCols) if (col + 1 > totalCols) totalCols = col + 1

    for (const centerIndex of info.centerIndexes) {
        const col = baseCols[centerIndex]
        if (totalCols - 1 - col !== col) return null
    }

    const rows = [...baseRows]
    const cols = [...baseCols]
    for (const { leftIndex, rightIndex } of info.pairs) {
        rows[rightIndex] = baseRows[leftIndex]
        cols[rightIndex] = totalCols - 1 - baseCols[leftIndex]
    }
    return { rows: denseReindex(rows), cols: denseReindex(cols) }
}

const assignPositionally = (keys: KleKey[], matrixKeyIndexes: number[]) => {
    const perKey = keys.map(() => ({ row: -1, col: -1 }))
    if (matrixKeyIndexes.length === 0) return { rows: 0, cols: 0, perKey, source: 'positional' as const }

    const regularKeys = matrixKeyIndexes.map((keyIndex) => keys[keyIndex])
    const base = runClusterAlgorithm(regularKeys)
    const symmetry = detectSymmetry(regularKeys, regularKeys.map(worldCenter))
    const enforced = symmetry ? enforceSymmetry(base.rows, base.cols, symmetry) : null
    const rows = enforced ? enforced.rows : base.rows
    const cols = enforced ? enforced.cols : base.cols

    matrixKeyIndexes.forEach((keyIndex, position) => {
        perKey[keyIndex] = { row: rows[position], col: cols[position] }
    })

    const dimensions = { rows: new Set(rows).size, cols: new Set(cols).size, perKey, source: 'positional' as const }
    if (base.collisions === 0) return dimensions
    return { ...dimensions, warnings: [`Resolved ${base.collisions} per-row column collision(s) by shifting overlapping keys to the next free slot`] }
}

export const assignMatrix = (keys: KleKey[]): MatrixAssignment => {
    const matrixKeyIndexes = keys
        .map((key, index) => ({ key, index }))
        .filter(({ key }) => isMatrixKey(key))
        .map(({ index }) => index)

    const labels = matrixKeyIndexes.map((keyIndex) => readCoordinateLabel(keys[keyIndex]))
    const everyMatrixKeyHasLabel = labels.length > 0 && labels.every((label) => label !== null)

    if (everyMatrixKeyHasLabel) {
        const duplicate = findDuplicateCoordinate(labels)
        if (!duplicate) return assignFromLabels(keys, matrixKeyIndexes, labels)
        const positional = assignPositionally(keys, matrixKeyIndexes)
        return {
            ...positional,
            warnings: [
                `Duplicate coordinate legend ${duplicate.row},${duplicate.col} on multiple keys; ignoring labels and inferring the matrix positionally`,
            ],
        }
    }

    return assignPositionally(keys, matrixKeyIndexes)
}
