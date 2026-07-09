declare module '@jscad/stl-serializer' {
    import { extrusions } from '@jscad/modeling'

    type StlSolid = ReturnType<typeof extrusions.extrudeLinear>

    export type StlSerializeOptions = {
        binary?: boolean
        statusCallback?: (status: { progress: number }) => void
    }

    export const mimeType: string

    export const serialize: (options: StlSerializeOptions, ...solids: StlSolid[]) => ArrayBuffer[]
}
