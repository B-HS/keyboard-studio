import { KleKey, KleKeyboard, KleMetadata } from './types'

const LABEL_COUNT = 12
const DEFAULT_ALIGNMENT = 4
const DEFAULT_KEY_COLOR = '#cccccc'
const DEFAULT_BACK_COLOR = '#eeeeee'
const DEFAULT_TEXT_COLOR = '#000000'
const DEFAULT_TEXT_SIZE = 3

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

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

const asNumber = (value: unknown) => (typeof value === 'number' ? value : undefined)

const asString = (value: unknown) => (typeof value === 'string' ? value : undefined)

const asBoolean = (value: unknown) => (typeof value === 'boolean' ? value : undefined)

const asOptionalNumberArray = (value: unknown) => (Array.isArray(value) ? value.map((entry) => asNumber(entry) ?? null) : undefined)

const remapByAlignment = <TValue>(items: readonly (TValue | null | undefined)[], alignment: number) => {
    const result: (TValue | null)[] = new Array(LABEL_COUNT).fill(null)
    const mapping = LABEL_MAP[alignment]
    if (!mapping) return result
    for (let index = 0; index < items.length && index < LABEL_COUNT; index++) {
        const value = items[index]
        const target = mapping[index]
        if (value && target !== -1) result[target] = value
    }
    return result
}

const toDenseLabels = <TValue>(items: readonly (TValue | null | undefined)[]) => {
    const result: (TValue | null)[] = new Array(LABEL_COUNT).fill(null)
    for (let index = 0; index < LABEL_COUNT; index++) result[index] = items[index] ?? null
    return result
}

const createDefaultKey = (): KleKey => ({
    color: DEFAULT_KEY_COLOR,
    labels: [],
    textColor: [],
    textSize: [],
    defaults: { textColor: DEFAULT_TEXT_COLOR, textSize: DEFAULT_TEXT_SIZE },
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
})

const cloneKey = (key: KleKey): KleKey => ({
    ...key,
    labels: [...key.labels],
    textColor: [...key.textColor],
    textSize: [...key.textSize],
    defaults: { ...key.defaults },
})

const createDefaultMetadata = (): KleMetadata => ({
    author: '',
    backcolor: DEFAULT_BACK_COLOR,
    background: null,
    name: '',
    notes: '',
    radii: '',
    switchBrand: '',
    switchMount: '',
    switchType: '',
})

const parseMetadata = (raw: UnknownRecord) => {
    const meta = createDefaultMetadata()
    const author = asString(raw.author)
    if (author) meta.author = author
    const backcolor = asString(raw.backcolor)
    if (backcolor) meta.backcolor = backcolor
    if (isRecord(raw.background)) {
        meta.background = { name: asString(raw.background.name) ?? '', style: asString(raw.background.style) ?? '' }
    }
    const name = asString(raw.name)
    if (name) meta.name = name
    const notes = asString(raw.notes)
    if (notes) meta.notes = notes
    const radii = asString(raw.radii)
    if (radii) meta.radii = radii
    const switchBrand = asString(raw.switchBrand)
    if (switchBrand) meta.switchBrand = switchBrand
    const switchMount = asString(raw.switchMount)
    if (switchMount) meta.switchMount = switchMount
    const switchType = asString(raw.switchType)
    if (switchType) meta.switchType = switchType
    return meta
}

export const parseKle = (rows: unknown): KleKeyboard => {
    if (!Array.isArray(rows)) throw new Error('KLE data must be an array of rows')

    const keys: KleKey[] = []
    let meta = createDefaultMetadata()
    const current = createDefaultKey()
    let alignment = DEFAULT_ALIGNMENT

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row: unknown = rows[rowIndex]
        if (Array.isArray(row)) {
            for (let itemIndex = 0; itemIndex < row.length; itemIndex++) {
                const item: unknown = row[itemIndex]
                if (typeof item === 'string') {
                    const key = cloneKey(current)
                    key.width2 = current.width2 === 0 ? current.width : current.width2
                    key.height2 = current.height2 === 0 ? current.height : current.height2
                    key.labels = remapByAlignment(item.split('\n'), alignment)
                    key.textSize = remapByAlignment(key.textSize, alignment)
                    key.textColor = toDenseLabels(key.textColor)
                    for (let position = 0; position < LABEL_COUNT; position++) {
                        if (!key.labels[position]) {
                            key.textSize[position] = null
                            key.textColor[position] = null
                        }
                        if (key.textSize[position] === key.defaults.textSize) key.textSize[position] = null
                        if (key.textColor[position] === key.defaults.textColor) key.textColor[position] = null
                    }
                    keys.push(key)

                    current.x += current.width
                    current.width = 1
                    current.height = 1
                    current.x2 = 0
                    current.y2 = 0
                    current.width2 = 0
                    current.height2 = 0
                    current.nub = false
                    current.stepped = false
                    current.decal = false
                } else if (isRecord(item)) {
                    const hasRotation = item.r != null || item.rx != null || item.ry != null
                    if (itemIndex !== 0 && hasRotation) throw new Error('KLE rotation can only be specified on the first key in a row')

                    const rotationAngle = asNumber(item.r)
                    if (rotationAngle != null) current.rotationAngle = rotationAngle
                    const rotationOriginX = asNumber(item.rx)
                    if (rotationOriginX != null) {
                        current.rotationX = rotationOriginX
                        current.x = current.rotationX
                        current.y = current.rotationY
                    }
                    const rotationOriginY = asNumber(item.ry)
                    if (rotationOriginY != null) {
                        current.rotationY = rotationOriginY
                        current.x = current.rotationX
                        current.y = current.rotationY
                    }
                    const nextAlignment = asNumber(item.a)
                    if (nextAlignment != null) alignment = nextAlignment
                    const primaryFontSize = asNumber(item.f)
                    if (primaryFontSize) {
                        current.defaults.textSize = primaryFontSize
                        current.textSize = []
                    }
                    const secondaryFontSize = asNumber(item.f2)
                    if (secondaryFontSize) for (let position = 1; position < LABEL_COUNT; position++) current.textSize[position] = secondaryFontSize
                    const fontSizeArray = asOptionalNumberArray(item.fa)
                    if (fontSizeArray) current.textSize = fontSizeArray
                    const profile = asString(item.p)
                    if (profile) current.profile = profile
                    const capColor = asString(item.c)
                    if (capColor) current.color = capColor
                    const textColorSpec = asString(item.t)
                    if (textColorSpec) {
                        const parts = textColorSpec.split('\n')
                        if (parts[0] !== '') current.defaults.textColor = parts[0]
                        current.textColor = remapByAlignment(parts, alignment)
                    }
                    const offsetX = asNumber(item.x)
                    if (offsetX) current.x += offsetX
                    const offsetY = asNumber(item.y)
                    if (offsetY) current.y += offsetY
                    const keyWidth = asNumber(item.w)
                    if (keyWidth) {
                        current.width = keyWidth
                        current.width2 = keyWidth
                    }
                    const keyHeight = asNumber(item.h)
                    if (keyHeight) {
                        current.height = keyHeight
                        current.height2 = keyHeight
                    }
                    const secondaryX = asNumber(item.x2)
                    if (secondaryX) current.x2 = secondaryX
                    const secondaryY = asNumber(item.y2)
                    if (secondaryY) current.y2 = secondaryY
                    const secondaryWidth = asNumber(item.w2)
                    if (secondaryWidth) current.width2 = secondaryWidth
                    const secondaryHeight = asNumber(item.h2)
                    if (secondaryHeight) current.height2 = secondaryHeight
                    const nub = asBoolean(item.n)
                    if (nub) current.nub = nub
                    const stepped = asBoolean(item.l)
                    if (stepped) current.stepped = stepped
                    const decal = asBoolean(item.d)
                    if (decal) current.decal = decal
                    if (item.g != null) {
                        const ghost = asBoolean(item.g)
                        if (ghost != null) current.ghost = ghost
                    }
                    const switchMount = asString(item.sm)
                    if (switchMount !== undefined) current.sm = switchMount
                    const switchBrand = asString(item.sb)
                    if (switchBrand !== undefined) current.sb = switchBrand
                    const switchType = asString(item.st)
                    if (switchType !== undefined) current.st = switchType
                    const switchRotation = asNumber(item._r)
                    if (switchRotation != null) current.switchRotation = switchRotation
                    const stabRotation = asNumber(item._rs)
                    if (stabRotation != null) current.stabRotation = stabRotation
                } else {
                    throw new Error('KLE row items must be strings or property objects')
                }
            }

            current.y += 1
            current.x = current.rotationX
        } else if (isRecord(row)) {
            if (rowIndex !== 0) throw new Error('KLE metadata must be the first element')
            meta = parseMetadata(row)
        } else {
            throw new Error('KLE rows must be arrays or a leading metadata object')
        }
    }

    return { meta, keys }
}

export const parseKleText = (text: string) => {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        try {
            parsed = JSON.parse(`[${text}]`)
        } catch (error) {
            return { ok: false as const, error: error instanceof Error ? error.message : 'Invalid KLE JSON' }
        }
    }
    try {
        return { ok: true as const, keyboard: parseKle(parsed) }
    } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : 'Invalid KLE layout' }
    }
}
