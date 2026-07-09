import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, test } from 'vitest'
import { parseKle } from './parse'
import { serializeKle, sortKleKeys } from './serialize'
import { KLE_PRESETS } from './presets'
import { decodeShareFragment, encodeShareFragment, SHARE_FRAGMENT_PREFIX } from './share-link'

const KLE_NG_DOCS_FRAGMENT =
    'NrDeCIENwLgdgL4BpwB4CWBbA5gAgM4BOAxgLwDkAFgC7UAO+MA9E4ZAO4B0261lArgCN++AKYkA9gDtqomZ2ITMTSABNImdviYBrADaiAtFOytRAM22VRa7Zkj5ZhJnSF70xJuuqQmH6dr6opx0JuS47OiqfKQAzABMuNbo2DRx8QB84AC62UA'

describe('encodeShareFragment / decodeShareFragment round-trip', () => {
    for (const preset of KLE_PRESETS) {
        test(`${preset.id} survives encode -> decode`, () => {
            const original = parseKle(preset.raw)
            const decoded = decodeShareFragment(encodeShareFragment(original))
            expect(decoded.ok).toBe(true)
            if (!decoded.ok) return
            expect(decoded.keyboard.meta).toEqual(original.meta)
            expect(sortKleKeys(decoded.keyboard.keys)).toEqual(sortKleKeys(original.keys))
        })
    }

    test('produces a non-empty fragment for a valid keyboard', () => {
        const fragment = encodeShareFragment(parseKle(KLE_PRESETS[0].raw))
        expect(fragment.length).toBeGreaterThan(0)
    })
})

describe('decodeShareFragment cross-tool compatibility', () => {
    test('decodes the real kle-ng docs share fragment into a valid keyboard', () => {
        const decoded = decodeShareFragment(KLE_NG_DOCS_FRAGMENT)
        expect(decoded.ok).toBe(true)
        if (!decoded.ok) return
        expect(decoded.keyboard.keys.length).toBe(1)
        expect(decoded.keyboard.keys[0].labels.find((label) => label != null)).toContain('kle.png')
    })

    test('re-encoding the decoded kle-ng keyboard stays decodable', () => {
        const decoded = decodeShareFragment(KLE_NG_DOCS_FRAGMENT)
        expect(decoded.ok).toBe(true)
        if (!decoded.ok) return
        const reDecoded = decodeShareFragment(encodeShareFragment(decoded.keyboard))
        expect(reDecoded.ok).toBe(true)
        if (!reDecoded.ok) return
        expect(sortKleKeys(reDecoded.keyboard.keys)).toEqual(sortKleKeys(decoded.keyboard.keys))
    })
})

describe('decodeShareFragment error handling', () => {
    test('returns an error for an empty fragment', () => {
        const decoded = decodeShareFragment('')
        expect(decoded.ok).toBe(false)
        if (decoded.ok) return
        expect(decoded.error).toBeTruthy()
    })

    test('returns an error for garbage that does not decompress to JSON', () => {
        const decoded = decodeShareFragment('not-a-valid-lz-string-payload')
        expect(decoded.ok).toBe(false)
    })

    test('returns an error when the payload decompresses to a non-array', () => {
        const fragment = compressToEncodedURIComponent(JSON.stringify({ not: 'an array' }))
        const decoded = decodeShareFragment(fragment)
        expect(decoded.ok).toBe(false)
        if (decoded.ok) return
        expect(decoded.error).toBe('Invalid KLE layout data structure')
    })

    test('rejects a payload that decompresses beyond the maximum allowed size', () => {
        const huge = JSON.stringify([Array.from({ length: 300000 }, () => 'x')])
        const decoded = decodeShareFragment(compressToEncodedURIComponent(huge))
        expect(decoded.ok).toBe(false)
        if (decoded.ok) return
        expect(decoded.error).toBe('Layout data exceeds maximum allowed size')
    })

    test('exposes the "#share=" fragment prefix', () => {
        expect(SHARE_FRAGMENT_PREFIX).toBe('#share=')
    })
})
