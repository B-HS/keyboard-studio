export type KleMetadata = {
    author: string
    backcolor: string
    background: { name: string; style: string } | null
    name: string
    notes: string
    radii: string
    switchBrand: string
    switchMount: string
    switchType: string
}

export type KleKey = {
    color: string
    labels: (string | null)[]
    textColor: (string | null)[]
    textSize: (number | null)[]
    defaults: { textColor: string; textSize: number }
    x: number
    y: number
    width: number
    height: number
    x2: number
    y2: number
    width2: number
    height2: number
    rotationX: number
    rotationY: number
    rotationAngle: number
    decal: boolean
    ghost: boolean
    stepped: boolean
    nub: boolean
    profile: string
    sm: string
    sb: string
    st: string
    switchRotation: number
    stabRotation: number
}

export type KleKeyboard = {
    meta: KleMetadata
    keys: KleKey[]
}
