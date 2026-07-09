import type { KleKey } from './types'

export const ROTARY_ENCODER_SM = 'rot_ec11'

export const isEncoderKey = (key: KleKey) => key.sm === ROTARY_ENCODER_SM
