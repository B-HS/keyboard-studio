import { assignMatrix } from '@entities/pcb/matrix'
import { getKeyboardBoundsU, roundCoordinate } from './geometry'
import { KleKey } from './types'

const LABEL_COUNT = 12

const deepCloneKey = (key: KleKey): KleKey => ({
    ...key,
    labels: [...key.labels],
    textColor: [...key.textColor],
    textSize: [...key.textSize],
    defaults: { ...key.defaults },
})

const toDenseNullArray = <TValue>(values: readonly (TValue | null)[]) => {
    const result: (TValue | null)[] = new Array(LABEL_COUNT).fill(null)
    for (let index = 0; index < values.length && index < LABEL_COUNT; index++) result[index] = values[index] ?? null
    return result
}

export const addMatrixCoordinateLegends = (keys: KleKey[]): KleKey[] => {
    const assignment = assignMatrix(keys)
    return keys.map((key, index) => {
        const cell = assignment.perKey[index]
        if (!cell || cell.row < 0) return key
        const clone = deepCloneKey(key)
        clone.labels = toDenseNullArray(key.labels)
        clone.labels[0] = `${cell.row},${cell.col}`
        return clone
    })
}

export const removeAllLegends = (keys: KleKey[], indices: number[] | null): KleKey[] => {
    const targets = indices === null ? null : new Set(indices)
    return keys.map((key, index) => {
        if (targets !== null && !targets.has(index)) return key
        const clone = deepCloneKey(key)
        clone.labels = new Array(LABEL_COUNT).fill(null)
        clone.textColor = new Array(LABEL_COUNT).fill(null)
        clone.textSize = new Array(LABEL_COUNT).fill(null)
        return clone
    })
}

const mirrorKey = (key: KleKey, axisValue: number, axis: 'horizontal' | 'vertical') => {
    const clone = deepCloneKey(key)
    clone.rotationAngle = key.rotationAngle === 0 ? 0 : -key.rotationAngle
    if (axis === 'horizontal') {
        clone.x = roundCoordinate(2 * axisValue - key.x - key.width)
        clone.x2 = roundCoordinate(key.width - key.width2 - key.x2)
        clone.rotationX = roundCoordinate(2 * axisValue - key.rotationX)
        return clone
    }
    clone.y = roundCoordinate(2 * axisValue - key.y - key.height)
    clone.y2 = roundCoordinate(key.height - key.height2 - key.y2)
    clone.rotationY = roundCoordinate(2 * axisValue - key.rotationY)
    return clone
}

export const mirrorKeys = (keys: KleKey[], indices: number[], axis: 'horizontal' | 'vertical'): KleKey[] => {
    const selected = indices.map((index) => keys[index]).filter((key): key is KleKey => key !== undefined)
    if (selected.length === 0) return [...keys]
    const bounds = getKeyboardBoundsU(selected)
    const axisValue = axis === 'horizontal' ? bounds.maxX : bounds.maxY
    const mirrored = selected.map((key) => mirrorKey(key, axisValue, axis))
    return [...keys, ...mirrored]
}

export const moveKeysBy = (keys: KleKey[], indices: number[], deltaX: number, deltaY: number): KleKey[] => {
    const targets = new Set(indices)
    return keys.map((key, index) => {
        if (!targets.has(index)) return key
        const clone = deepCloneKey(key)
        clone.x = roundCoordinate(key.x + deltaX)
        clone.y = roundCoordinate(key.y + deltaY)
        const hasRotation = key.rotationAngle !== 0 || key.rotationX !== 0 || key.rotationY !== 0
        if (hasRotation) {
            clone.rotationX = roundCoordinate(key.rotationX + deltaX)
            clone.rotationY = roundCoordinate(key.rotationY + deltaY)
        }
        return clone
    })
}
