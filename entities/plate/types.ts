import { Point } from '@entities/kle/geometry'

export type PlateCutout = 'mx' | 'mx-open' | 'alps' | 'choc'

export type PlateStabilizer = 'cherry' | 'mx-basic' | 'mx-bidirectional' | 'mx-tight' | 'mx-spec' | 'mx-spec-narrow' | 'none'

export type PlateOptions = {
    cutout: PlateCutout
    stabilizer: PlateStabilizer
    switchCutoutWidth: number | null
    switchCutoutHeight: number | null
    kerf: number
    edgeMargin: number
    cornerRadius: number
    thickness: number
}

export const DEFAULT_PLATE_OPTIONS: PlateOptions = {
    cutout: 'mx',
    stabilizer: 'cherry',
    switchCutoutWidth: null,
    switchCutoutHeight: null,
    kerf: 0,
    edgeMargin: 3,
    cornerRadius: 3,
    thickness: 1.5,
}

export const SWITCH_CUTOUT_DEFAULTS: Record<PlateCutout, { width: number; height: number }> = {
    'mx': { width: 14, height: 14 },
    'mx-open': { width: 14, height: 14 },
    'alps': { width: 15.5, height: 12.8 },
    'choc': { width: 13.8, height: 13.8 },
}

export const STABILIZER_STYLES = {
    'cherry': { slotWidth: 6.65, slotHeight: 12.3, topAboveCenter: 5.53 },
    'mx-basic': { slotWidth: 7, slotHeight: 15, topAboveCenter: 5.53 },
    'mx-bidirectional': { slotWidth: 7, slotHeight: 18, topAboveCenter: 9 },
    'mx-tight': { slotWidth: 6.75, slotHeight: 14, topAboveCenter: 5.53 },
    'mx-spec': { slotWidth: 6.65, slotHeight: 12.29, topAboveCenter: 5.53 },
    'mx-spec-narrow': { slotWidth: 6.65, slotHeight: 12.29, topAboveCenter: 5.53 },
} as const

export type PlateGeometry = {
    outline: Point[]
    holes: Point[][]
    widthMm: number
    heightMm: number
}
