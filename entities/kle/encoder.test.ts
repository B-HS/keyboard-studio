import { describe, expect, test } from 'vitest'
import { isEncoderKey, ROTARY_ENCODER_SM } from './encoder'
import { parseKle } from './parse'

describe('ROTARY_ENCODER_SM', () => {
    test('is the kle-ng switch-mount sentinel for a rotary encoder', () => {
        expect(ROTARY_ENCODER_SM).toBe('rot_ec11')
    })
})

describe('isEncoderKey', () => {
    test('is true only when the switch mount equals the encoder sentinel', () => {
        const keys = parseKle([[{ sm: ROTARY_ENCODER_SM }, 'A', { sm: '' }, 'B', 'C']]).keys
        expect(keys.map((key) => isEncoderKey(key))).toEqual([true, false, false])
    })

    test('is false for an unrelated switch mount value', () => {
        const key = parseKle([[{ sm: 'cherry' }, 'A']]).keys[0]
        expect(isEncoderKey(key)).toBe(false)
    })

    test('is false for a plain key with no switch mount', () => {
        const key = parseKle([['A']]).keys[0]
        expect(isEncoderKey(key)).toBe(false)
    })
})
