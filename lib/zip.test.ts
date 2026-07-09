import { describe, expect, test } from 'vitest'
import { createZip, crc32 } from '@lib/zip'

const encode = (text: string) => new TextEncoder().encode(text)

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50

describe('crc32', () => {
    test('matches the standard IEEE test vectors', () => {
        expect(crc32(encode(''))).toBe(0)
        expect(crc32(encode('123456789'))).toBe(0xcbf43926)
        expect(crc32(encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
    })
})

describe('createZip', () => {
    test('writes a store-only archive with valid signatures and offsets', () => {
        const name = 'hello.txt'
        const content = 'Hello, World!'
        const zip = createZip([{ name, data: content }])
        const view = new DataView(zip.buffer)

        const nameLength = encode(name).length
        const dataLength = encode(content).length
        const localSize = 30 + nameLength + dataLength
        const centralSize = 46 + nameLength
        const eocdOffset = localSize + centralSize

        expect(zip.length).toBe(localSize + centralSize + 22)
        expect(view.getUint32(0, true)).toBe(LOCAL_HEADER_SIGNATURE)
        expect(view.getUint32(localSize, true)).toBe(CENTRAL_HEADER_SIGNATURE)
        expect(view.getUint32(eocdOffset, true)).toBe(EOCD_SIGNATURE)

        expect(view.getUint16(0 + 8, true)).toBe(0)
        expect(view.getUint32(0 + 14, true)).toBe(crc32(encode(content)))
        expect(view.getUint32(0 + 18, true)).toBe(dataLength)
        expect(view.getUint32(0 + 22, true)).toBe(dataLength)
        expect(view.getUint16(0 + 26, true)).toBe(nameLength)
        expect(new TextDecoder().decode(zip.slice(30, 30 + nameLength))).toBe(name)
        expect(new TextDecoder().decode(zip.slice(30 + nameLength, localSize))).toBe(content)

        expect(view.getUint16(eocdOffset + 8, true)).toBe(1)
        expect(view.getUint16(eocdOffset + 10, true)).toBe(1)
        expect(view.getUint32(eocdOffset + 12, true)).toBe(centralSize)
        expect(view.getUint32(eocdOffset + 16, true)).toBe(localSize)
    })

    test('sets the utf-8 language flag on local and central headers', () => {
        const zip = createZip([{ name: 'a.txt', data: 'x' }])
        const view = new DataView(zip.buffer)
        const centralOffset = 30 + 5 + 1
        expect(view.getUint16(6, true)).toBe(0x0800)
        expect(view.getUint16(centralOffset + 8, true)).toBe(0x0800)
    })

    test('records the correct local header offset for each entry', () => {
        const entries = [
            { name: 'first.txt', data: 'alpha' },
            { name: 'second.bin', data: new Uint8Array([1, 2, 3, 4, 5, 6]) },
        ]
        const zip = createZip(entries)
        const view = new DataView(zip.buffer)

        const firstLocal = 30 + encode('first.txt').length + encode('alpha').length
        const secondLocal = 30 + encode('second.bin').length + 6
        const centralStart = firstLocal + secondLocal

        expect(view.getUint32(0, true)).toBe(LOCAL_HEADER_SIGNATURE)
        expect(view.getUint32(firstLocal, true)).toBe(LOCAL_HEADER_SIGNATURE)
        expect(view.getUint32(centralStart, true)).toBe(CENTRAL_HEADER_SIGNATURE)
        expect(view.getUint32(centralStart + 42, true)).toBe(0)

        const secondCentral = centralStart + 46 + encode('first.txt').length
        expect(view.getUint32(secondCentral, true)).toBe(CENTRAL_HEADER_SIGNATURE)
        expect(view.getUint32(secondCentral + 42, true)).toBe(firstLocal)

        const eocdOffset = centralStart + (46 + encode('first.txt').length) + (46 + encode('second.bin').length)
        expect(view.getUint32(eocdOffset, true)).toBe(EOCD_SIGNATURE)
        expect(view.getUint16(eocdOffset + 10, true)).toBe(2)
    })

    test('stores binary payloads verbatim', () => {
        const payload = new Uint8Array([0, 255, 128, 64, 32])
        const zip = createZip([{ name: 'blob', data: payload }])
        const headerSize = 30 + encode('blob').length
        expect(Array.from(zip.slice(headerSize, headerSize + payload.length))).toEqual(Array.from(payload))
    })

    test('produces a valid empty archive with only an end-of-central-directory record', () => {
        const zip = createZip([])
        expect(zip.length).toBe(22)
        const view = new DataView(zip.buffer)
        expect(view.getUint32(0, true)).toBe(EOCD_SIGNATURE)
        expect(view.getUint16(8, true)).toBe(0)
        expect(view.getUint16(10, true)).toBe(0)
        expect(view.getUint32(12, true)).toBe(0)
        expect(view.getUint32(16, true)).toBe(0)
    })

    test('every stored entry round-trips its bytes and crc walking the local headers', () => {
        const entries = [
            { name: 'a.txt', data: 'alpha' },
            { name: 'nested/b.bin', data: new Uint8Array([9, 8, 7, 0, 255]) },
            { name: 'c.kicad_pcb', data: '(kicad_pcb)' },
        ]
        const zip = createZip(entries)
        const view = new DataView(zip.buffer)
        let offset = 0
        for (const entry of entries) {
            expect(view.getUint32(offset, true)).toBe(LOCAL_HEADER_SIGNATURE)
            const crc = view.getUint32(offset + 14, true)
            const size = view.getUint32(offset + 18, true)
            const nameLength = view.getUint16(offset + 26, true)
            const dataStart = offset + 30 + nameLength
            const stored = zip.slice(dataStart, dataStart + size)
            const expected = typeof entry.data === 'string' ? encode(entry.data) : entry.data
            expect(Array.from(stored)).toEqual(Array.from(expected))
            expect(crc).toBe(crc32(expected))
            offset = dataStart + size
        }
        expect(view.getUint32(offset, true)).toBe(CENTRAL_HEADER_SIGNATURE)
        const eocdEntries = view.getUint16(zip.length - 22 + 10, true)
        expect(eocdEntries).toBe(entries.length)
    })
})
