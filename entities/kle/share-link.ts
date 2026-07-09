import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { parseKle } from './parse'
import { serializeKle } from './serialize'
import type { KleKeyboard } from './types'

const MAX_DECOMPRESSED_SIZE = 1_000_000

export const SHARE_FRAGMENT_PREFIX = '#share='

export const encodeShareFragment = (keyboard: KleKeyboard) => compressToEncodedURIComponent(JSON.stringify(serializeKle(keyboard)))

export const decodeShareFragment = (fragment: string) => {
    try {
        const decompressed = decompressFromEncodedURIComponent(fragment)
        if (!decompressed) return { ok: false as const, error: 'Share link is empty or malformed' }
        if (decompressed.length > MAX_DECOMPRESSED_SIZE) return { ok: false as const, error: 'Layout data exceeds maximum allowed size' }
        const parsed: unknown = JSON.parse(decompressed)
        if (!Array.isArray(parsed)) return { ok: false as const, error: 'Invalid KLE layout data structure' }
        return { ok: true as const, keyboard: parseKle(parsed) }
    } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : 'Invalid share link' }
    }
}
