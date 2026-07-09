import type { FC } from 'react'
import type { KleKey } from '@entities/kle/types'
import { fitFontSize, wrapAndFit } from '@lib/legend-fit'
import { readableTextFallback } from './cap-colors'

const KEY_UNIT_PX = 54
const CAP_TOP_INSET_X = 6
const CAP_TOP_INSET_TOP = 3
const CAP_TOP_INSET_BOTTOM = 9
const CAP_FOOTPRINT_RADIUS = 5
const LABEL_PADDING_PX = 4
const LABEL_FONT_BASE_PX = 6
const LABEL_FONT_PER_SIZE_PX = 2
const FRONT_LABEL_SCALE = 0.8
const FRONT_LABEL_FIRST_SLOT = 9
const LINE_HEIGHT_RATIO = 1.05
const MAX_LEGEND_LINES = 3
const LABEL_MIN_FONT_PX = 7

type LabelColumn = 'left' | 'center' | 'right'
type LabelRow = 'top' | 'middle' | 'bottom' | 'front'
type SlotPlacement = { column: LabelColumn; row: LabelRow }

const SLOT_PLACEMENTS: SlotPlacement[] = [
    { column: 'left', row: 'top' },
    { column: 'center', row: 'top' },
    { column: 'right', row: 'top' },
    { column: 'left', row: 'middle' },
    { column: 'center', row: 'middle' },
    { column: 'right', row: 'middle' },
    { column: 'left', row: 'bottom' },
    { column: 'center', row: 'bottom' },
    { column: 'right', row: 'bottom' },
    { column: 'left', row: 'front' },
    { column: 'center', row: 'front' },
    { column: 'right', row: 'front' },
]

const TEXT_ANCHOR_BY_COLUMN = { left: 'start', center: 'middle', right: 'end' } as const satisfies Record<LabelColumn, string>
const DOMINANT_BASELINE_BY_ROW = { top: 'hanging', middle: 'central', bottom: 'text-after-edge', front: 'central' } as const satisfies Record<
    LabelRow,
    string
>

const decodeEntities = (text: string) =>
    text
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')

const toLabelLines = (raw: string) => decodeEntities(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).split('\n')

type KeyLegendsProps = {
    kleKey: KleKey
    index: number
}

export const KeyLegends: FC<KeyLegendsProps> = ({ kleKey, index }) => {
    const footprintX = kleKey.x * KEY_UNIT_PX
    const footprintY = kleKey.y * KEY_UNIT_PX
    const footprintWidth = kleKey.width * KEY_UNIT_PX
    const footprintHeight = kleKey.height * KEY_UNIT_PX

    const topSurfaceX = footprintX + CAP_TOP_INSET_X
    const topSurfaceY = footprintY + CAP_TOP_INSET_TOP
    const topSurfaceWidth = footprintWidth - CAP_TOP_INSET_X * 2
    const topSurfaceHeight = footprintHeight - CAP_TOP_INSET_TOP - CAP_TOP_INSET_BOTTOM
    const frontBevelCenterY = footprintY + footprintHeight - CAP_TOP_INSET_BOTTOM / 2

    const clipId = `keebforge-legend-clip-${index}`

    const resolveX = (column: LabelColumn) =>
        column === 'left'
            ? topSurfaceX + LABEL_PADDING_PX
            : column === 'right'
              ? topSurfaceX + topSurfaceWidth - LABEL_PADDING_PX
              : topSurfaceX + topSurfaceWidth / 2

    const resolveY = (row: LabelRow) =>
        row === 'top'
            ? topSurfaceY + LABEL_PADDING_PX
            : row === 'middle'
              ? topSurfaceY + topSurfaceHeight / 2
              : row === 'bottom'
                ? topSurfaceY + topSurfaceHeight - LABEL_PADDING_PX
                : frontBevelCenterY

    const renderedLabels = SLOT_PLACEMENTS.map((placement, slot) => {
        const raw = kleKey.labels[slot]
        if (!raw) return null
        const lines = toLabelLines(raw)
        if (lines.every((line) => line.trim() === '')) return null
        const isFront = slot >= FRONT_LABEL_FIRST_SLOT
        const textSize = kleKey.textSize[slot] ?? kleKey.defaults.textSize
        const baseFontSize = (LABEL_FONT_BASE_PX + LABEL_FONT_PER_SIZE_PX * textSize) * (isFront ? FRONT_LABEL_SCALE : 1)
        const color = kleKey.textColor[slot] ?? kleKey.defaults.textColor ?? readableTextFallback(kleKey.color)
        const anchorX = resolveX(placement.column)
        const anchorY = resolveY(placement.row)
        const availableWidth = topSurfaceWidth - LABEL_PADDING_PX * 2
        const fit = isFront
            ? { lines, fontSizePx: baseFontSize }
            : lines.length > 1
              ? { lines, fontSizePx: fitFontSize({ lines, maxWidthPx: availableWidth, fontSizePx: baseFontSize, minFontSizePx: LABEL_MIN_FONT_PX }) }
              : wrapAndFit({
                    text: lines[0],
                    maxWidthPx: availableWidth,
                    fontSizePx: baseFontSize,
                    maxLines: MAX_LEGEND_LINES,
                    minFontSizePx: LABEL_MIN_FONT_PX,
                })
        const fontSize = fit.fontSizePx
        const displayLines = fit.lines
        const lineHeight = fontSize * LINE_HEIGHT_RATIO
        const firstLineOffset =
            placement.row === 'top'
                ? 0
                : placement.row === 'bottom'
                  ? -(displayLines.length - 1) * lineHeight
                  : -((displayLines.length - 1) / 2) * lineHeight
        return (
            <text
                key={slot}
                x={anchorX}
                y={anchorY}
                fontSize={fontSize}
                fontWeight={500}
                fill={color}
                textAnchor={TEXT_ANCHOR_BY_COLUMN[placement.column]}
                dominantBaseline={DOMINANT_BASELINE_BY_ROW[placement.row]}>
                {displayLines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={anchorX} dy={lineIndex === 0 ? firstLineOffset : lineHeight}>
                        {line}
                    </tspan>
                ))}
            </text>
        )
    })

    return (
        <g clipPath={`url(#${clipId})`} pointerEvents='none'>
            <clipPath id={clipId}>
                <rect x={footprintX} y={footprintY} width={footprintWidth} height={footprintHeight} rx={CAP_FOOTPRINT_RADIUS} />
            </clipPath>
            {renderedLabels}
        </g>
    )
}
