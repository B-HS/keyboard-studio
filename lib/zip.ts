export type ZipEntry = { name: string; data: Uint8Array | string }

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50
const LOCAL_HEADER_SIZE = 30
const CENTRAL_HEADER_SIZE = 46
const EOCD_SIZE = 22
const VERSION_NEEDED = 20
const UTF8_FLAG = 0x0800
const STORE_METHOD = 0
const DOS_DATE = 0x0021
const DOS_TIME = 0

const buildCrcTable = () => {
    const table = new Uint32Array(256)
    for (let index = 0; index < 256; index++) {
        let value = index
        for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
        table[index] = value >>> 0
    }
    return table
}

const CRC_TABLE = buildCrcTable()

export const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff
    for (let index = 0; index < bytes.length; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

const toBytes = (data: Uint8Array | string) => (typeof data === 'string' ? new TextEncoder().encode(data) : data)

export const createZip = (entries: ZipEntry[]) => {
    const encoder = new TextEncoder()
    const records = entries.map((entry) => {
        const nameBytes = encoder.encode(entry.name)
        const dataBytes = toBytes(entry.data)
        return { nameBytes, dataBytes, crc: crc32(dataBytes) }
    })

    const centralSize = records.reduce((sum, record) => sum + CENTRAL_HEADER_SIZE + record.nameBytes.length, 0)
    const localSize = records.reduce((sum, record) => sum + LOCAL_HEADER_SIZE + record.nameBytes.length + record.dataBytes.length, 0)
    const buffer = new Uint8Array(localSize + centralSize + EOCD_SIZE)
    const view = new DataView(buffer.buffer)

    let offset = 0
    const localOffsets: number[] = []

    for (const record of records) {
        localOffsets.push(offset)
        view.setUint32(offset, LOCAL_HEADER_SIGNATURE, true)
        view.setUint16(offset + 4, VERSION_NEEDED, true)
        view.setUint16(offset + 6, UTF8_FLAG, true)
        view.setUint16(offset + 8, STORE_METHOD, true)
        view.setUint16(offset + 10, DOS_TIME, true)
        view.setUint16(offset + 12, DOS_DATE, true)
        view.setUint32(offset + 14, record.crc, true)
        view.setUint32(offset + 18, record.dataBytes.length, true)
        view.setUint32(offset + 22, record.dataBytes.length, true)
        view.setUint16(offset + 26, record.nameBytes.length, true)
        view.setUint16(offset + 28, 0, true)
        buffer.set(record.nameBytes, offset + LOCAL_HEADER_SIZE)
        buffer.set(record.dataBytes, offset + LOCAL_HEADER_SIZE + record.nameBytes.length)
        offset += LOCAL_HEADER_SIZE + record.nameBytes.length + record.dataBytes.length
    }

    const centralOffset = offset
    records.forEach((record, index) => {
        view.setUint32(offset, CENTRAL_HEADER_SIGNATURE, true)
        view.setUint16(offset + 4, VERSION_NEEDED, true)
        view.setUint16(offset + 6, VERSION_NEEDED, true)
        view.setUint16(offset + 8, UTF8_FLAG, true)
        view.setUint16(offset + 10, STORE_METHOD, true)
        view.setUint16(offset + 12, DOS_TIME, true)
        view.setUint16(offset + 14, DOS_DATE, true)
        view.setUint32(offset + 16, record.crc, true)
        view.setUint32(offset + 20, record.dataBytes.length, true)
        view.setUint32(offset + 24, record.dataBytes.length, true)
        view.setUint16(offset + 28, record.nameBytes.length, true)
        view.setUint16(offset + 30, 0, true)
        view.setUint16(offset + 32, 0, true)
        view.setUint16(offset + 34, 0, true)
        view.setUint16(offset + 36, 0, true)
        view.setUint32(offset + 38, 0, true)
        view.setUint32(offset + 42, localOffsets[index], true)
        buffer.set(record.nameBytes, offset + CENTRAL_HEADER_SIZE)
        offset += CENTRAL_HEADER_SIZE + record.nameBytes.length
    })

    view.setUint32(offset, EOCD_SIGNATURE, true)
    view.setUint16(offset + 4, 0, true)
    view.setUint16(offset + 6, 0, true)
    view.setUint16(offset + 8, records.length, true)
    view.setUint16(offset + 10, records.length, true)
    view.setUint32(offset + 12, centralSize, true)
    view.setUint32(offset + 16, centralOffset, true)
    view.setUint16(offset + 20, 0, true)

    return buffer
}
