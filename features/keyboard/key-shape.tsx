import { useState, type FC, type MouseEvent as ReactMouseEvent } from 'react'
import { isEncoderKey } from '@entities/kle/encoder'
import type { KleKey } from '@entities/kle/types'
import { getKeyPolygonU, type Point } from '@entities/kle/geometry'
import { darken, lighten } from './cap-colors'
import { KeyLegends } from './key-legends'

const KEY_UNIT_PX = 54
const CAP_FOOTPRINT_GAP_PX = 1
const CAP_BASE_RADIUS = 5
const CAP_TOP_RADIUS = 4
const CAP_TOP_INSET_X = 6
const CAP_TOP_INSET_TOP = 3
const CAP_TOP_INSET_BOTTOM = 9
const BASE_DARKEN_FACTOR = 0.85
const TOP_LIGHTEN_FACTOR = 1.2
const HOVER_LIGHTEN_FACTOR = 1.08
const GHOST_OPACITY = 0.35
const NUB_MAX_WIDTH_PX = 12
const NUB_WIDTH_RATIO = 0.3
const NUB_HEIGHT_PX = 2.5
const NUB_VERTICAL_RATIO = 0.72
const NUB_FILL = '#000000'
const NUB_FILL_OPACITY = 0.22
const SELECTION_STROKE_WIDTH = 2
const ENCODER_BASE_DIAMETER_RATIO = 0.9
const ENCODER_KNURL_DIAMETER_RATIO = 0.82
const ENCODER_TOP_DIAMETER_RATIO = 0.62
const ENCODER_KNURL_DARKEN_FACTOR = 0.7
const ENCODER_KNURL_STROKE_WIDTH = 1.5
const ENCODER_KNURL_DASH = '3 3'

const buildOutlinePath = (points: Point[]) =>
    points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x * KEY_UNIT_PX} ${point.y * KEY_UNIT_PX}`).join(' ') + ' Z'

type KeyShapeProps = {
    kleKey: KleKey
    index: number
    isSelected: boolean
    onSelect: (index: number) => void
}

export const KeyShape: FC<KeyShapeProps> = ({ kleKey, index, isSelected, onSelect }) => {
    const [isHovered, setIsHovered] = useState(false)

    const handleClick = (event: ReactMouseEvent) => {
        event.stopPropagation()
        onSelect(index)
    }

    const footprintX = kleKey.x * KEY_UNIT_PX
    const footprintY = kleKey.y * KEY_UNIT_PX
    const footprintWidth = kleKey.width * KEY_UNIT_PX
    const footprintHeight = kleKey.height * KEY_UNIT_PX

    const hasSecondary = !(kleKey.x2 === 0 && kleKey.y2 === 0 && kleKey.width2 === kleKey.width && kleKey.height2 === kleKey.height)
    const secondaryX = (kleKey.x + kleKey.x2) * KEY_UNIT_PX
    const secondaryY = (kleKey.y + kleKey.y2) * KEY_UNIT_PX
    const secondaryWidth = kleKey.width2 * KEY_UNIT_PX
    const secondaryHeight = kleKey.height2 * KEY_UNIT_PX

    const baseColorResting = darken(kleKey.color, BASE_DARKEN_FACTOR)
    const topColorResting = lighten(kleKey.color, TOP_LIGHTEN_FACTOR)
    const baseColor = isHovered ? lighten(baseColorResting, HOVER_LIGHTEN_FACTOR) : baseColorResting
    const topColor = isHovered ? lighten(topColorResting, HOVER_LIGHTEN_FACTOR) : topColorResting

    const rotationTransform =
        kleKey.rotationAngle !== 0 ? `rotate(${kleKey.rotationAngle} ${kleKey.rotationX * KEY_UNIT_PX} ${kleKey.rotationY * KEY_UNIT_PX})` : undefined

    const topSurfaceX = footprintX + CAP_TOP_INSET_X
    const topSurfaceY = footprintY + CAP_TOP_INSET_TOP
    const topSurfaceWidth = footprintWidth - CAP_TOP_INSET_X * 2
    const topSurfaceHeight = footprintHeight - CAP_TOP_INSET_TOP - CAP_TOP_INSET_BOTTOM

    const nubWidth = Math.min(topSurfaceWidth * NUB_WIDTH_RATIO, NUB_MAX_WIDTH_PX)

    const isEncoder = isEncoderKey(kleKey)
    const knobCenterX = footprintX + footprintWidth / 2
    const knobCenterY = footprintY + footprintHeight / 2
    const knobRadius = Math.min(footprintWidth, footprintHeight) / 2
    const knobBaseRadius = knobRadius * ENCODER_BASE_DIAMETER_RATIO
    const knobKnurlRadius = knobRadius * ENCODER_KNURL_DIAMETER_RATIO
    const knobTopRadius = knobRadius * ENCODER_TOP_DIAMETER_RATIO
    const knurlStroke = darken(kleKey.color, ENCODER_KNURL_DARKEN_FACTOR)

    const selectionOutlinePath =
        isSelected && hasSecondary ? buildOutlinePath(getKeyPolygonU({ ...kleKey, rotationAngle: 0, rotationX: 0, rotationY: 0 })) : null

    return (
        <g transform={rotationTransform} onClick={handleClick} onPointerEnter={() => setIsHovered(true)} onPointerLeave={() => setIsHovered(false)}>
            {kleKey.decal ? (
                <KeyLegends kleKey={kleKey} index={index} />
            ) : isEncoder ? (
                <>
                    <g opacity={kleKey.ghost ? GHOST_OPACITY : 1}>
                        <circle cx={knobCenterX} cy={knobCenterY} r={knobBaseRadius} fill={baseColor} />
                        <circle
                            cx={knobCenterX}
                            cy={knobCenterY}
                            r={knobKnurlRadius}
                            fill='none'
                            stroke={knurlStroke}
                            strokeWidth={ENCODER_KNURL_STROKE_WIDTH}
                            strokeDasharray={ENCODER_KNURL_DASH}
                        />
                        <circle cx={knobCenterX} cy={knobCenterY} r={knobTopRadius} fill={topColor} />
                    </g>
                    {!kleKey.ghost && <KeyLegends kleKey={kleKey} index={index} />}
                </>
            ) : (
                <>
                    <g opacity={kleKey.ghost ? GHOST_OPACITY : 1}>
                        <rect
                            x={footprintX + CAP_FOOTPRINT_GAP_PX}
                            y={footprintY + CAP_FOOTPRINT_GAP_PX}
                            width={footprintWidth - CAP_FOOTPRINT_GAP_PX * 2}
                            height={footprintHeight - CAP_FOOTPRINT_GAP_PX * 2}
                            rx={CAP_BASE_RADIUS}
                            fill={baseColor}
                        />
                        {hasSecondary && (
                            <rect
                                x={secondaryX + CAP_FOOTPRINT_GAP_PX}
                                y={secondaryY + CAP_FOOTPRINT_GAP_PX}
                                width={secondaryWidth - CAP_FOOTPRINT_GAP_PX * 2}
                                height={secondaryHeight - CAP_FOOTPRINT_GAP_PX * 2}
                                rx={CAP_BASE_RADIUS}
                                fill={baseColor}
                            />
                        )}
                        <rect x={topSurfaceX} y={topSurfaceY} width={topSurfaceWidth} height={topSurfaceHeight} rx={CAP_TOP_RADIUS} fill={topColor} />
                        {hasSecondary && !kleKey.stepped && (
                            <rect
                                x={secondaryX + CAP_TOP_INSET_X}
                                y={secondaryY + CAP_TOP_INSET_TOP}
                                width={secondaryWidth - CAP_TOP_INSET_X * 2}
                                height={secondaryHeight - CAP_TOP_INSET_TOP - CAP_TOP_INSET_BOTTOM}
                                rx={CAP_TOP_RADIUS}
                                fill={topColor}
                            />
                        )}
                        {kleKey.nub && (
                            <rect
                                x={topSurfaceX + topSurfaceWidth / 2 - nubWidth / 2}
                                y={topSurfaceY + topSurfaceHeight * NUB_VERTICAL_RATIO}
                                width={nubWidth}
                                height={NUB_HEIGHT_PX}
                                rx={NUB_HEIGHT_PX / 2}
                                fill={NUB_FILL}
                                fillOpacity={NUB_FILL_OPACITY}
                            />
                        )}
                    </g>
                    {!kleKey.ghost && <KeyLegends kleKey={kleKey} index={index} />}
                </>
            )}
            {isSelected && hasSecondary && selectionOutlinePath && (
                <path
                    d={selectionOutlinePath}
                    fill='none'
                    className='stroke-ring'
                    strokeWidth={SELECTION_STROKE_WIDTH}
                    strokeLinejoin='round'
                    vectorEffect='non-scaling-stroke'
                />
            )}
            {isSelected && !hasSecondary && (
                <rect
                    x={footprintX}
                    y={footprintY}
                    width={footprintWidth}
                    height={footprintHeight}
                    rx={CAP_BASE_RADIUS}
                    fill='none'
                    className='stroke-ring'
                    strokeWidth={SELECTION_STROKE_WIDTH}
                    vectorEffect='non-scaling-stroke'
                />
            )}
        </g>
    )
}
