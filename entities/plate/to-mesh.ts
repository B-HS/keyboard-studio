import { plateToStl } from './export-stl'
import { PlateGeometry } from './types'

const STL_HEADER_BYTES = 80
const STL_COUNT_BYTES = 4
const STL_TRIANGLE_BYTES = 50
const FLOAT_BYTES = 4
const COORDS_PER_VERTEX = 3
const VERTICES_PER_TRIANGLE = 3
const LITTLE_ENDIAN = true

const concatBuffers = (buffers: ArrayBuffer[]) => {
    const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const buffer of buffers) {
        merged.set(new Uint8Array(buffer), offset)
        offset += buffer.byteLength
    }
    return merged.buffer
}

export const plateToMesh = (plate: PlateGeometry, thicknessMm: number) => {
    const view = new DataView(concatBuffers(plateToStl(plate, thicknessMm)))
    const triangleCount = view.getUint32(STL_HEADER_BYTES, LITTLE_ENDIAN)
    const values = triangleCount * VERTICES_PER_TRIANGLE * COORDS_PER_VERTEX
    const positions = new Float32Array(values)
    const normals = new Float32Array(values)

    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const recordStart = STL_HEADER_BYTES + STL_COUNT_BYTES + triangle * STL_TRIANGLE_BYTES
        const normalX = view.getFloat32(recordStart, LITTLE_ENDIAN)
        const normalY = view.getFloat32(recordStart + FLOAT_BYTES, LITTLE_ENDIAN)
        const normalZ = view.getFloat32(recordStart + FLOAT_BYTES * 2, LITTLE_ENDIAN)
        for (let vertex = 0; vertex < VERTICES_PER_TRIANGLE; vertex++) {
            const vertexStart = recordStart + FLOAT_BYTES * COORDS_PER_VERTEX * (vertex + 1)
            const target = (triangle * VERTICES_PER_TRIANGLE + vertex) * COORDS_PER_VERTEX
            positions[target] = view.getFloat32(vertexStart, LITTLE_ENDIAN)
            positions[target + 1] = view.getFloat32(vertexStart + FLOAT_BYTES, LITTLE_ENDIAN)
            positions[target + 2] = view.getFloat32(vertexStart + FLOAT_BYTES * 2, LITTLE_ENDIAN)
            normals[target] = normalX
            normals[target + 1] = normalY
            normals[target + 2] = normalZ
        }
    }

    return { positions, normals }
}
