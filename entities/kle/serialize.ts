import type { KleKey, KleKeyboard, KleMetadata } from './types'

const LABEL_COUNT = 12
const DEFAULT_ALIGNMENT = 4
const DEFAULT_KEY_COLOR = '#cccccc'
const DEFAULT_BACK_COLOR = '#eeeeee'
const DEFAULT_TEXT_COLOR = '#000000'
const DEFAULT_TEXT_SIZE = 3
const FORCE_EMIT = -1
const FULL_CIRCLE_DEGREES = 360

const LABEL_MAP = [
    [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
    [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
    [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
    [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
    [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
    [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
    [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
    [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
]

const DISALLOWED_ALIGNMENT_FOR_LABELS = [
    [1, 2, 3, 5, 6, 7],
    [2, 3, 6, 7],
    [1, 2, 3, 5, 6, 7],
    [1, 3, 5, 7],
    [],
    [1, 3, 5, 7],
    [1, 2, 3, 5, 6, 7],
    [2, 3, 6, 7],
    [1, 2, 3, 5, 6, 7],
    [4, 5, 6, 7],
    [],
    [4, 5, 6, 7],
]

const ALIGNMENT_PREFERENCE = [7, 5, 6, 4, 3, 1, 2, 0]

type KeyProps = Record<string, string | number | boolean | number[]>
type MetaProps = Record<string, string | { name: string; style: string }>

const serializeProp = <T extends string | number | boolean | number[]>(props: KeyProps, name: string, value: T, defaultValue: T) => {
    if (value !== defaultValue) props[name] = value
    return value
}

const serializeMeta = (meta: KleMetadata) => {
    const result: MetaProps = {}
    if (meta.backcolor !== DEFAULT_BACK_COLOR) result.backcolor = meta.backcolor
    if (meta.name !== '') result.name = meta.name
    if (meta.author !== '') result.author = meta.author
    if (meta.notes !== '') result.notes = meta.notes
    if (meta.background) result.background = { name: meta.background.name, style: meta.background.style }
    if (meta.radii !== '') result.radii = meta.radii
    if (meta.switchMount !== '') result.switchMount = meta.switchMount
    if (meta.switchBrand !== '') result.switchBrand = meta.switchBrand
    if (meta.switchType !== '') result.switchType = meta.switchType
    return result
}

const reorderLabels = (key: KleKey, runningTextSize: number[]) => {
    const align = ALIGNMENT_PREFERENCE.filter((flag) => {
        for (let index = 0; index < LABEL_COUNT; index++) {
            if (key.labels[index] && DISALLOWED_ALIGNMENT_FOR_LABELS[index].includes(flag)) return false
        }
        return true
    })
    const chosen = align[0] ?? DEFAULT_ALIGNMENT
    const mapping = LABEL_MAP[chosen]
    const labels: string[] = new Array(LABEL_COUNT).fill('')
    const textColor: string[] = new Array(LABEL_COUNT).fill('')
    const textSize: number[] = []
    for (let index = 0; index < LABEL_COUNT; index++) {
        const target = mapping.indexOf(index)
        if (target < 0) continue
        const label = key.labels[index]
        if (label) labels[target] = label
        const color = key.textColor[index]
        if (color) textColor[target] = color
        const size = key.textSize[index]
        if (size) textSize[target] = size
    }
    for (let index = 0; index < textSize.length; index++) {
        const base = labels[index] ? textSize[index] : runningTextSize[index]
        textSize[index] = !base || base === key.defaults.textSize ? 0 : base
    }
    return { align: chosen, labels, textColor, textSize }
}

const textSizesMatch = (current: number[], candidate: number[], labels: string[]) => {
    for (let index = 0; index < LABEL_COUNT; index++) {
        if (labels[index] && (Boolean(current[index]) !== Boolean(candidate[index]) || (current[index] && current[index] !== candidate[index])))
            return false
    }
    return true
}

const normalizedAngle = (angle: number) => ((angle % FULL_CIRCLE_DEGREES) + FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES

export const sortKleKeys = (keys: KleKey[]) =>
    [...keys].sort(
        (left, right) =>
            normalizedAngle(left.rotationAngle) - normalizedAngle(right.rotationAngle) ||
            left.rotationX - right.rotationX ||
            left.rotationY - right.rotationY ||
            left.y - right.y ||
            left.x - right.x,
    )

export const serializeKle = (keyboard: KleKeyboard): unknown[] => {
    const rows: unknown[] = []
    const meta = serializeMeta(keyboard.meta)
    if (Object.keys(meta).length > 0) rows.push(meta)

    const running = {
        x: 0,
        y: -1,
        rotationAngle: 0,
        rotationX: 0,
        rotationY: 0,
        color: DEFAULT_KEY_COLOR,
        textColor: DEFAULT_TEXT_COLOR,
        ghost: false,
        profile: '',
        sm: '',
        sb: '',
        st: '',
        switchRotation: 0,
        stabRotation: 0,
        align: DEFAULT_ALIGNMENT,
        defaultTextSize: DEFAULT_TEXT_SIZE,
        textSize: [] as number[],
    }
    const cluster = { r: 0, rx: 0, ry: 0 }
    let newRow = true
    let row: unknown[] = []

    for (const key of sortKleKeys(keyboard.keys)) {
        const props: KeyProps = {}
        const ordered = reorderLabels(key, running.textSize)

        const clusterChanged = key.rotationAngle !== cluster.r || key.rotationX !== cluster.rx || key.rotationY !== cluster.ry
        const rowChanged = key.y !== running.y
        if (row.length > 0 && (rowChanged || clusterChanged)) {
            rows.push(row)
            row = []
            newRow = true
        }

        if (newRow) {
            running.y++
            if (key.rotationY !== cluster.ry || key.rotationX !== cluster.rx) running.y = key.rotationY
            running.x = key.rotationX
            cluster.r = key.rotationAngle
            cluster.rx = key.rotationX
            cluster.ry = key.rotationY
            newRow = false
        }

        running.rotationAngle = serializeProp(props, 'r', key.rotationAngle, running.rotationAngle)
        running.rotationX = serializeProp(props, 'rx', key.rotationX, running.rotationX)
        running.rotationY = serializeProp(props, 'ry', key.rotationY, running.rotationY)
        running.y += serializeProp(props, 'y', key.y - running.y, 0)
        running.x += serializeProp(props, 'x', key.x - running.x, 0) + key.width
        running.color = serializeProp(props, 'c', key.color, running.color)

        if (!ordered.textColor[0]) ordered.textColor[0] = key.defaults.textColor
        running.textColor = serializeProp(props, 't', ordered.textColor.join('\n').trimEnd(), running.textColor)

        running.ghost = serializeProp(props, 'g', key.ghost, running.ghost)
        running.profile = serializeProp(props, 'p', key.profile, running.profile)
        running.sm = serializeProp(props, 'sm', key.sm, running.sm)
        running.sb = serializeProp(props, 'sb', key.sb, running.sb)
        running.st = serializeProp(props, 'st', key.st, running.st)
        running.switchRotation = serializeProp(props, '_r', key.switchRotation, running.switchRotation)
        running.stabRotation = serializeProp(props, '_rs', key.stabRotation, running.stabRotation)
        running.align = serializeProp(props, 'a', ordered.align, running.align)
        running.defaultTextSize = serializeProp(props, 'f', key.defaults.textSize, running.defaultTextSize)
        if (props.f) running.textSize = []
        if (!textSizesMatch(running.textSize, ordered.textSize, ordered.labels)) {
            if (ordered.textSize.length === 0) {
                serializeProp(props, 'f', key.defaults.textSize, FORCE_EMIT)
            } else {
                let optimizeF2 = !ordered.textSize[0]
                for (let index = 2; index < ordered.textSize.length && optimizeF2; index++)
                    optimizeF2 = ordered.textSize[index] === ordered.textSize[1]
                if (optimizeF2) {
                    const secondarySize = ordered.textSize[1]
                    serializeProp(props, 'f2', secondarySize, FORCE_EMIT)
                    running.textSize = new Array(LABEL_COUNT).fill(secondarySize)
                    running.textSize[0] = 0
                } else {
                    running.textSize = serializeProp(props, 'fa', ordered.textSize, [])
                }
            }
        }
        serializeProp(props, 'w', key.width, 1)
        serializeProp(props, 'h', key.height, 1)
        serializeProp(props, 'w2', key.width2, key.width)
        serializeProp(props, 'h2', key.height2, key.height)
        serializeProp(props, 'x2', key.x2, 0)
        serializeProp(props, 'y2', key.y2, 0)
        serializeProp(props, 'n', key.nub, false)
        serializeProp(props, 'l', key.stepped, false)
        serializeProp(props, 'd', key.decal, false)
        if (Object.keys(props).length > 0) row.push(props)
        row.push(ordered.labels.join('\n').trimEnd())
    }
    if (row.length > 0) rows.push(row)
    return rows
}
