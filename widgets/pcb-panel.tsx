'use client'

import { isEncoderKey } from '@entities/kle/encoder'
import { getKeyCenterMm, rotatePoint, roundCoordinate } from '@entities/kle/geometry'
import { KleKeyboard } from '@entities/kle/types'
import {
    DIODE_DO35_DRILL_MM,
    DIODE_DO35_HALF_SPAN_MM,
    DIODE_DO35_PAD_DIAMETER_MM,
    DIODE_DO35_PAD_PITCH_MM,
    DIODE_PAD_HEIGHT_MM,
    DIODE_PAD_OFFSET_MM,
    DIODE_PAD_WIDTH_MM,
    ENCODER_PAD_A_POSITION_MM,
    ENCODER_PAD_B_POSITION_MM,
    ENCODER_PAD_C_POSITION_MM,
    ENCODER_PIN_DRILL_MM,
    ENCODER_PIN_PAD_DIAMETER_MM,
    ENCODER_SWITCH_PAD_ONE_POSITION_MM,
    ENCODER_SWITCH_PAD_TWO_POSITION_MM,
    MOUNTING_HOLE_DIAMETER_MM,
    STAB_POST_DIAMETER_MM,
    STAB_WIRE_DIAMETER_MM,
    SWITCH_CENTER_HOLE_DIAMETER_MM,
    SWITCH_FIXATION_PIN_DIAMETER_MM,
    SWITCH_FIXATION_PIN_OFFSET_MM,
    SWITCH_PIN_DRILL_MM,
    SWITCH_PIN_HOLE_DIAMETER_MM,
    SWITCH_PIN_ONE_POSITION_MM,
    SWITCH_PIN_PAD_DIAMETER_MM,
    SWITCH_PIN_TWO_POSITION_MM,
    SWITCH_SOCKET_PAD_HEIGHT_MM,
    SWITCH_SOCKET_PAD_ONE_POSITION_MM,
    SWITCH_SOCKET_PAD_TWO_POSITION_MM,
    SWITCH_SOCKET_PAD_WIDTH_MM,
} from '@entities/pcb/constants'
import { generateKicadPcb } from '@entities/pcb/generate-kicad'
import { computePcbLayout } from '@entities/pcb/layout'
import { DEFAULT_PCB_OPTIONS, DiodeKind, PcbOptions, SwitchMount } from '@entities/pcb/types'
import { generateKicadPro, generateKicadSch } from '@entities/sch/generate-kicad-sch'
import { downloadTextFile } from '@lib/download'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/card'
import { Input } from '@ui/input'
import { Label } from '@ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'
import { Separator } from '@ui/separator'
import { Skeleton } from '@ui/skeleton'
import { Switch } from '@ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@ui/toggle-group'
import { BoxIcon, DownloadIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { FC, useState } from 'react'
import { toast } from 'sonner'

const GltfViewer = dynamic(() => import('@features/viewer3d/gltf-viewer').then((mod) => mod.GltfViewer), {
    ssr: false,
    loading: () => <Skeleton className='h-full w-full' />,
})

const KICAD_PCB_FILE_NAME = 'keyboard.kicad_pcb'
const KICAD_SCH_FILE_NAME = 'keyboard.kicad_sch'
const KICAD_PRO_FILE_NAME = 'keyboard.kicad_pro'
const KICAD_PROJECT_NAME = 'keyboard'
const KICAD_PCB_MIME_TYPE = 'application/x-kicad-pcb'
const KICAD_SCH_MIME_TYPE = 'application/x-kicad-schematic'
const KICAD_PRO_MIME_TYPE = 'application/json'
const RENDER_ENDPOINT = '/api/kicad/render'

const VIEWER_TABS = [
    { value: 'pcb-front.svg', label: 'PCB Front' },
    { value: 'pcb-back.svg', label: 'PCB Back' },
    { value: 'schematic.svg', label: 'Schematic' },
    { value: 'board.glb', label: '3D' },
] as const

type ViewerTab = (typeof VIEWER_TABS)[number]['value']

type RenderArtifact = { name: string; ok: boolean; error?: string }
type RenderManifest = { id: string; artifacts: RenderArtifact[] }

const artifactUrl = (id: string, name: string) => `/api/kicad/artifact/${id}/${name}`

const SWITCH_ROTATION_OPTIONS = [0, 90, 180, 270] as const

const VIEW_PADDING_MM = 5
const SUBSTRATE_PADDING_MM = 2
const BOARD_CORNER_RADIUS_MM = 3

const SUBSTRATE_FILL = '#0c3b2b'
const SUBSTRATE_STROKE = '#1c5a44'
const EDGE_CUTS_STROKE = '#f2c94c'
const COPPER_FILL = '#c79a4b'
const COPPER_STROKE = '#e4c67f'
const DRILL_FILL = '#08130f'
const DIODE_PAD_FILL = '#b98a3f'
const SILK_TEXT_FILL = '#eef2ea'
const RATSNEST_STROKE = '#7fd3ff'
const MATRIX_LABEL_FILL = '#a5f3d0'

const ORIGIN = { x: 0, y: 0 }
const COPPER_RING_WIDTH_MM = (SWITCH_PIN_PAD_DIAMETER_MM - SWITCH_PIN_DRILL_MM) / 2
const ENCODER_RING_WIDTH_MM = (ENCODER_PIN_PAD_DIAMETER_MM - ENCODER_PIN_DRILL_MM) / 2
const SILK_REFERENCE_FONT_MM = 2
const DIODE_REFERENCE_FONT_MM = 1.4
const MATRIX_LABEL_FONT_MM = 1.6
const MATRIX_LABEL_OFFSET_MM = 5
const DIODE_OFFSET_LIMIT_MM = 15

const clampDiodeOffset = (value: number) => Math.min(DIODE_OFFSET_LIMIT_MM, Math.max(-DIODE_OFFSET_LIMIT_MM, value))

type PcbPanelProps = {
    keyboard: KleKeyboard
}

type SvgPoint = { x: number; y: number }

const rotatedWorldPoint = (base: SvgPoint, offset: SvgPoint, angleDeg: number) => {
    const rotated = rotatePoint(offset, ORIGIN, angleDeg)
    return { x: base.x + rotated.x, y: base.y + rotated.y }
}

const buildNearestNeighborChain = (points: SvgPoint[]) => {
    if (points.length < 2) return []
    const ordered = points
        .map((point, index) => ({ ...point, index }))
        .sort((left, right) => left.x - right.x || left.y - right.y || left.index - right.index)
    const pending = ordered.slice(1)
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
    let current = ordered[0]
    while (pending.length > 0) {
        let bestIndex = 0
        let bestDistance = Number.POSITIVE_INFINITY
        for (let candidate = 0; candidate < pending.length; candidate++) {
            const deltaX = pending[candidate].x - current.x
            const deltaY = pending[candidate].y - current.y
            const distance = deltaX * deltaX + deltaY * deltaY
            if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = candidate
            }
        }
        const next = pending.splice(bestIndex, 1)[0]
        segments.push({ x1: current.x, y1: current.y, x2: next.x, y2: next.y })
        current = next
    }
    return segments
}

const buildSortedChain = (points: SvgPoint[], compare: (left: SvgPoint, right: SvgPoint) => number) => {
    if (points.length < 2) return []
    const ordered = [...points].sort(compare)
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (let index = 1; index < ordered.length; index++) {
        segments.push({ x1: ordered[index - 1].x, y1: ordered[index - 1].y, x2: ordered[index].x, y2: ordered[index].y })
    }
    return segments
}

export const buildPcbPreview = (keyboard: KleKeyboard, options: PcbOptions) => {
    const layout = computePcbLayout(keyboard, options)
    const { matrix, netlist, order, board } = layout

    const switches = order.map((keyIndex, ordinal) => {
        const key = keyboard.keys[keyIndex]
        const center = getKeyCenterMm(key)
        const angle = key.rotationAngle + options.switchRotation + key.switchRotation
        const net = netlist.switchNets[ordinal]
        const encoderNet = netlist.encoderNets[ordinal]
        const isEncoder = isEncoderKey(key)
        const cell = matrix.perKey[keyIndex]
        const encoderPads =
            isEncoder && encoderNet
                ? [
                      { ...rotatedWorldPoint(center, ENCODER_PAD_A_POSITION_MM, angle), net: encoderNet.aNet },
                      { ...rotatedWorldPoint(center, ENCODER_PAD_B_POSITION_MM, angle), net: encoderNet.bNet },
                      { ...rotatedWorldPoint(center, ENCODER_PAD_C_POSITION_MM, angle), net: encoderNet.gndNet },
                      { ...rotatedWorldPoint(center, ENCODER_SWITCH_PAD_ONE_POSITION_MM, angle), net: net.colNet },
                      { ...rotatedWorldPoint(center, ENCODER_SWITCH_PAD_TWO_POSITION_MM, angle), net: net.junctionNet },
                  ]
                : []
        const diodeCenter = rotatedWorldPoint(center, { x: options.diodeOffsetXMm, y: options.diodeOffsetYMm }, angle)
        const do35Origin = rotatedWorldPoint(center, { x: options.diodeOffsetXMm - DIODE_DO35_HALF_SPAN_MM, y: options.diodeOffsetYMm }, angle)
        const diodeRow = options.diode === 'do-35' ? do35Origin : rotatedWorldPoint(diodeCenter, { x: -DIODE_PAD_OFFSET_MM, y: 0 }, angle)
        const diodeJunction =
            options.diode === 'do-35'
                ? rotatedWorldPoint(do35Origin, { x: DIODE_DO35_PAD_PITCH_MM, y: 0 }, angle)
                : rotatedWorldPoint(diodeCenter, { x: DIODE_PAD_OFFSET_MM, y: 0 }, angle)
        const isHotswap = options.switchMount === 'hotswap'
        const switchPadOnePosition = isHotswap ? SWITCH_SOCKET_PAD_ONE_POSITION_MM : SWITCH_PIN_ONE_POSITION_MM
        const switchPadTwoPosition = isHotswap ? SWITCH_SOCKET_PAD_TWO_POSITION_MM : SWITCH_PIN_TWO_POSITION_MM
        return {
            reference: `SW${ordinal + 1}`,
            diodeReference: `D${ordinal + 1}`,
            matrixLabel: `${cell.row},${cell.col}`,
            isEncoder,
            encoderPads,
            center,
            angle,
            fixationPins: [
                rotatedWorldPoint(center, { x: -SWITCH_FIXATION_PIN_OFFSET_MM, y: 0 }, angle),
                rotatedWorldPoint(center, { x: SWITCH_FIXATION_PIN_OFFSET_MM, y: 0 }, angle),
            ],
            pinHoles: [rotatedWorldPoint(center, SWITCH_PIN_ONE_POSITION_MM, angle), rotatedWorldPoint(center, SWITCH_PIN_TWO_POSITION_MM, angle)],
            switchPadOne: { ...rotatedWorldPoint(center, switchPadOnePosition, angle), net: net.colNet },
            switchPadTwo: { ...rotatedWorldPoint(center, switchPadTwoPosition, angle), net: net.junctionNet },
            diodeCenter,
            diodeRow: { ...diodeRow, net: net.rowNet },
            diodeJunction: { ...diodeJunction, net: net.junctionNet },
        }
    })

    const netPoints = new Map<number, SvgPoint[]>()
    const collectPoint = (net: number, point: SvgPoint) => {
        if (net <= 0) return
        const bucket = netPoints.get(net)
        if (bucket) bucket.push({ x: point.x, y: point.y })
        else netPoints.set(net, [{ x: point.x, y: point.y }])
    }
    for (const item of switches) {
        if (item.isEncoder) {
            for (const pad of item.encoderPads) collectPoint(pad.net, pad)
        } else {
            collectPoint(item.switchPadOne.net, item.switchPadOne)
            collectPoint(item.switchPadTwo.net, item.switchPadTwo)
        }
        collectPoint(item.diodeRow.net, item.diodeRow)
        collectPoint(item.diodeJunction.net, item.diodeJunction)
    }

    const ratsnestSegments = Array.from(netPoints.entries()).flatMap(([net, points]) => {
        const netName = netlist.nets[net] ?? ''
        if (netName.startsWith('ROW')) return buildSortedChain(points, (left, right) => left.x - right.x || left.y - right.y)
        if (netName.startsWith('COL')) return buildSortedChain(points, (left, right) => left.y - right.y || left.x - right.x)
        return buildNearestNeighborChain(points)
    })

    let minX = board.left
    let minY = board.top
    let maxX = board.right
    let maxY = board.bottom
    const includeCircle = (cx: number, cy: number, radius: number) => {
        if (cx - radius < minX) minX = cx - radius
        if (cy - radius < minY) minY = cy - radius
        if (cx + radius > maxX) maxX = cx + radius
        if (cy + radius > maxY) maxY = cy + radius
    }
    const includePoint = (x: number, y: number) => includeCircle(x, y, 0)
    const includeRotatedRect = (cx: number, cy: number, halfWidth: number, halfHeight: number, angleDeg: number) => {
        for (const corner of [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight },
        ]) {
            const world = rotatedWorldPoint({ x: cx, y: cy }, corner, angleDeg)
            includePoint(world.x, world.y)
        }
    }
    for (const item of switches) {
        if (item.isEncoder) {
            for (const pad of item.encoderPads) includeCircle(pad.x, pad.y, ENCODER_PIN_PAD_DIAMETER_MM / 2)
        } else {
            includeCircle(item.center.x, item.center.y, SWITCH_CENTER_HOLE_DIAMETER_MM / 2)
            for (const pin of item.fixationPins) includeCircle(pin.x, pin.y, SWITCH_FIXATION_PIN_DIAMETER_MM / 2)
            if (options.switchMount === 'hotswap') {
                for (const hole of item.pinHoles) includeCircle(hole.x, hole.y, SWITCH_PIN_HOLE_DIAMETER_MM / 2)
                for (const pad of [item.switchPadOne, item.switchPadTwo])
                    includeRotatedRect(pad.x, pad.y, SWITCH_SOCKET_PAD_WIDTH_MM / 2, SWITCH_SOCKET_PAD_HEIGHT_MM / 2, item.angle)
            } else {
                includeCircle(item.switchPadOne.x, item.switchPadOne.y, SWITCH_PIN_PAD_DIAMETER_MM / 2)
                includeCircle(item.switchPadTwo.x, item.switchPadTwo.y, SWITCH_PIN_PAD_DIAMETER_MM / 2)
            }
        }
        if (options.diode === 'do-35') {
            includeCircle(item.diodeRow.x, item.diodeRow.y, DIODE_DO35_PAD_DIAMETER_MM / 2)
            includeCircle(item.diodeJunction.x, item.diodeJunction.y, DIODE_DO35_PAD_DIAMETER_MM / 2)
        } else {
            includeRotatedRect(
                item.diodeCenter.x,
                item.diodeCenter.y,
                DIODE_PAD_OFFSET_MM + DIODE_PAD_WIDTH_MM / 2,
                DIODE_PAD_HEIGHT_MM / 2,
                item.angle,
            )
        }
        includePoint(item.center.x, item.center.y)
        includePoint(item.diodeCenter.x, item.diodeCenter.y)
        includePoint(item.center.x, item.center.y - MATRIX_LABEL_OFFSET_MM)
    }
    for (const stab of layout.stabilizers) {
        stab.holes.forEach((hole, index) => includeCircle(hole.x, hole.y, (index % 2 === 0 ? STAB_POST_DIAMETER_MM : STAB_WIRE_DIAMETER_MM) / 2))
    }
    for (const hole of layout.mountingHoles) includeCircle(hole.x, hole.y, MOUNTING_HOLE_DIAMETER_MM / 2)

    const substrate = {
        left: minX - SUBSTRATE_PADDING_MM,
        top: minY - SUBSTRATE_PADDING_MM,
        right: maxX + SUBSTRATE_PADDING_MM,
        bottom: maxY + SUBSTRATE_PADDING_MM,
    }
    const width = substrate.right - substrate.left
    const height = substrate.bottom - substrate.top
    const viewBox = [substrate.left - VIEW_PADDING_MM, substrate.top - VIEW_PADDING_MM, width + VIEW_PADDING_MM * 2, height + VIEW_PADDING_MM * 2]
        .map(roundCoordinate)
        .join(' ')

    return { layout, switches, ratsnestSegments, substrate, width, height, viewBox }
}

export const PcbPanel: FC<PcbPanelProps> = ({ keyboard }) => {
    const [diodesOnBack, setDiodesOnBack] = useState(DEFAULT_PCB_OPTIONS.diodesOnBack)
    const [includeOutline, setIncludeOutline] = useState(DEFAULT_PCB_OPTIONS.includeOutline)
    const [edgeMargin, setEdgeMargin] = useState(DEFAULT_PCB_OPTIONS.edgeMargin)
    const [diode, setDiode] = useState<DiodeKind>(DEFAULT_PCB_OPTIONS.diode)
    const [switchMount, setSwitchMount] = useState<SwitchMount>(DEFAULT_PCB_OPTIONS.switchMount)
    const [diodeOffsetXMm, setDiodeOffsetXMm] = useState(DEFAULT_PCB_OPTIONS.diodeOffsetXMm)
    const [diodeOffsetYMm, setDiodeOffsetYMm] = useState(DEFAULT_PCB_OPTIONS.diodeOffsetYMm)
    const [stabFootprints, setStabFootprints] = useState(DEFAULT_PCB_OPTIONS.stabFootprints)
    const [mountingHoles, setMountingHoles] = useState(DEFAULT_PCB_OPTIONS.mountingHoles)
    const [switchRotation, setSwitchRotation] = useState<PcbOptions['switchRotation']>(DEFAULT_PCB_OPTIONS.switchRotation)
    const [includeSwitchModels, setIncludeSwitchModels] = useState(false)
    const [showRatsnest, setShowRatsnest] = useState(true)
    const [showReferences, setShowReferences] = useState(true)
    const [showMatrix, setShowMatrix] = useState(false)
    const [rendering, setRendering] = useState(false)
    const [manifest, setManifest] = useState<RenderManifest | null>(null)
    const [viewerTab, setViewerTab] = useState<ViewerTab>('pcb-front.svg')

    const options: PcbOptions = {
        diodesOnBack,
        includeOutline,
        edgeMargin,
        diode,
        switchMount,
        diodeOffsetXMm,
        diodeOffsetYMm,
        stabFootprints,
        mountingHoles,
        switchRotation,
    }
    const preview = buildPcbPreview(keyboard, options)
    const { switches, ratsnestSegments, substrate, width, height, viewBox } = preview
    const { matrix, physicalKeys, stabilizers } = preview.layout
    const mountingHolePositions = preview.layout.mountingHoles

    const sourceLabel = matrix.source === 'labels' ? 'from labels' : 'inferred'

    const activeArtifact = manifest?.artifacts.find((entry) => entry.name === viewerTab) ?? null
    const activeUrl = manifest ? artifactUrl(manifest.id, viewerTab) : ''
    const activeLabel = VIEWER_TABS.find((tab) => tab.value === viewerTab)?.label ?? ''

    const handleDownloadPcb = () => {
        downloadTextFile(KICAD_PCB_FILE_NAME, generateKicadPcb(keyboard, options), KICAD_PCB_MIME_TYPE)
        toast.success('Downloaded', { description: KICAD_PCB_FILE_NAME })
    }

    const handleDownloadSch = () => {
        downloadTextFile(KICAD_SCH_FILE_NAME, generateKicadSch(keyboard), KICAD_SCH_MIME_TYPE)
        toast.success('Downloaded', { description: KICAD_SCH_FILE_NAME })
    }

    const handleDownloadPro = () => {
        downloadTextFile(KICAD_PRO_FILE_NAME, generateKicadPro(KICAD_PROJECT_NAME), KICAD_PRO_MIME_TYPE)
        toast.success('Downloaded', { description: KICAD_PRO_FILE_NAME })
    }

    const handleRender = async (withSwitchModels = includeSwitchModels) => {
        setRendering(true)
        try {
            const response = await fetch(RENDER_ENDPOINT, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    pcb: generateKicadPcb(keyboard, options),
                    sch: generateKicadSch(keyboard),
                    pro: generateKicadPro(KICAD_PROJECT_NAME),
                    includeSwitchModels: withSwitchModels,
                }),
            })
            if (!response.ok) {
                const detail = (await response.json().catch(() => null)) as { error?: string } | null
                toast.error('KiCad render failed', { description: detail?.error ?? `Server responded with ${response.status}` })
                return
            }
            const result = (await response.json()) as RenderManifest
            setManifest(result)
            const firstReady = result.artifacts.find((entry) => entry.ok)
            if (firstReady) setViewerTab(firstReady.name as ViewerTab)
            for (const entry of result.artifacts) {
                if (!entry.ok) toast.error(`Could not render ${entry.name}`, { description: entry.error ?? 'Export failed' })
            }
            if (firstReady) toast.success('KiCad render ready')
        } catch (error) {
            toast.error('KiCad render failed', { description: error instanceof Error ? error.message : 'Network error' })
        } finally {
            setRendering(false)
        }
    }

    const handleToggleSwitchModels = (next: boolean) => {
        setIncludeSwitchModels(next)
        if (manifest) handleRender(next)
    }

    return (
        <div className='flex h-full w-full flex-col gap-4'>
            <div className='flex w-full flex-1 flex-col gap-4 lg:flex-row'>
                <div className='relative min-h-80 flex-1 overflow-hidden rounded-xl border border-border bg-muted/40'>
                    <svg viewBox={viewBox} className='h-full w-full' preserveAspectRatio='xMidYMid meet' role='img' aria-label='PCB preview'>
                        <rect
                            x={roundCoordinate(substrate.left)}
                            y={roundCoordinate(substrate.top)}
                            width={roundCoordinate(width)}
                            height={roundCoordinate(height)}
                            rx={BOARD_CORNER_RADIUS_MM}
                            ry={BOARD_CORNER_RADIUS_MM}
                            fill={SUBSTRATE_FILL}
                            stroke={SUBSTRATE_STROKE}
                            strokeWidth={0.4}
                        />
                        {includeOutline && (
                            <rect
                                x={roundCoordinate(substrate.left)}
                                y={roundCoordinate(substrate.top)}
                                width={roundCoordinate(width)}
                                height={roundCoordinate(height)}
                                rx={BOARD_CORNER_RADIUS_MM}
                                ry={BOARD_CORNER_RADIUS_MM}
                                fill='none'
                                stroke={EDGE_CUTS_STROKE}
                                strokeWidth={0.3}
                            />
                        )}

                        {showRatsnest &&
                            ratsnestSegments.map((segment, index) => (
                                <line
                                    key={`rat-${index}`}
                                    x1={segment.x1}
                                    y1={segment.y1}
                                    x2={segment.x2}
                                    y2={segment.y2}
                                    stroke={RATSNEST_STROKE}
                                    strokeWidth={0.18}
                                    strokeDasharray='0.8 0.6'
                                    strokeOpacity={0.65}
                                />
                            ))}

                        {stabilizers.map((stab, stabIndex) =>
                            stab.holes.map((hole, holeIndex) => (
                                <circle
                                    key={`stab-${stabIndex}-${holeIndex}`}
                                    cx={hole.x}
                                    cy={hole.y}
                                    r={(holeIndex % 2 === 0 ? STAB_POST_DIAMETER_MM : STAB_WIRE_DIAMETER_MM) / 2}
                                    fill={DRILL_FILL}
                                    stroke={COPPER_STROKE}
                                    strokeWidth={0.08}
                                />
                            )),
                        )}

                        {mountingHolePositions.map((hole, index) => (
                            <circle
                                key={`mount-${index}`}
                                cx={hole.x}
                                cy={hole.y}
                                r={MOUNTING_HOLE_DIAMETER_MM / 2}
                                fill={DRILL_FILL}
                                stroke={EDGE_CUTS_STROKE}
                                strokeWidth={0.15}
                            />
                        ))}

                        {switches.map((item) => (
                            <g key={item.reference}>
                                {item.isEncoder ? (
                                    item.encoderPads.map((pad, index) => (
                                        <g key={`${item.reference}-enc-${index}`}>
                                            <circle
                                                cx={pad.x}
                                                cy={pad.y}
                                                r={ENCODER_PIN_PAD_DIAMETER_MM / 2}
                                                fill='none'
                                                stroke={COPPER_FILL}
                                                strokeWidth={ENCODER_RING_WIDTH_MM}
                                            />
                                            <circle
                                                cx={pad.x}
                                                cy={pad.y}
                                                r={ENCODER_PIN_DRILL_MM / 2}
                                                fill={DRILL_FILL}
                                                stroke={COPPER_STROKE}
                                                strokeWidth={0.08}
                                            />
                                        </g>
                                    ))
                                ) : (
                                    <>
                                        <circle cx={item.center.x} cy={item.center.y} r={SWITCH_CENTER_HOLE_DIAMETER_MM / 2} fill={DRILL_FILL} />
                                        {item.fixationPins.map((pin, index) => (
                                            <circle
                                                key={`${item.reference}-fix-${index}`}
                                                cx={pin.x}
                                                cy={pin.y}
                                                r={SWITCH_FIXATION_PIN_DIAMETER_MM / 2}
                                                fill={DRILL_FILL}
                                            />
                                        ))}
                                        {switchMount === 'hotswap' ? (
                                            <>
                                                {item.pinHoles.map((hole, index) => (
                                                    <circle
                                                        key={`${item.reference}-pin-${index}`}
                                                        cx={roundCoordinate(hole.x)}
                                                        cy={roundCoordinate(hole.y)}
                                                        r={SWITCH_PIN_HOLE_DIAMETER_MM / 2}
                                                        fill={DRILL_FILL}
                                                        stroke={SUBSTRATE_STROKE}
                                                        strokeWidth={0.08}
                                                    />
                                                ))}
                                                {[item.switchPadOne, item.switchPadTwo].map((pad, index) => (
                                                    <rect
                                                        key={`${item.reference}-socket-${index}`}
                                                        x={roundCoordinate(pad.x - SWITCH_SOCKET_PAD_WIDTH_MM / 2)}
                                                        y={roundCoordinate(pad.y - SWITCH_SOCKET_PAD_HEIGHT_MM / 2)}
                                                        width={SWITCH_SOCKET_PAD_WIDTH_MM}
                                                        height={SWITCH_SOCKET_PAD_HEIGHT_MM}
                                                        rx={0.3}
                                                        fill={COPPER_FILL}
                                                        fillOpacity={0.55}
                                                        stroke={COPPER_STROKE}
                                                        strokeWidth={0.08}
                                                        transform={`rotate(${roundCoordinate(item.angle)} ${roundCoordinate(pad.x)} ${roundCoordinate(pad.y)})`}
                                                    />
                                                ))}
                                            </>
                                        ) : (
                                            [item.switchPadOne, item.switchPadTwo].map((pad, index) => (
                                                <g key={`${item.reference}-pad-${index}`}>
                                                    <circle
                                                        cx={pad.x}
                                                        cy={pad.y}
                                                        r={SWITCH_PIN_PAD_DIAMETER_MM / 2}
                                                        fill='none'
                                                        stroke={COPPER_FILL}
                                                        strokeWidth={COPPER_RING_WIDTH_MM}
                                                    />
                                                    <circle
                                                        cx={pad.x}
                                                        cy={pad.y}
                                                        r={SWITCH_PIN_DRILL_MM / 2}
                                                        fill={DRILL_FILL}
                                                        stroke={COPPER_STROKE}
                                                        strokeWidth={0.08}
                                                    />
                                                </g>
                                            ))
                                        )}
                                    </>
                                )}
                                {diode === 'do-35' ? (
                                    [item.diodeRow, item.diodeJunction].map((pad, index) => (
                                        <g key={`${item.reference}-do35-${index}`}>
                                            <circle cx={pad.x} cy={pad.y} r={DIODE_DO35_PAD_DIAMETER_MM / 2} fill={DIODE_PAD_FILL} />
                                            <circle cx={pad.x} cy={pad.y} r={DIODE_DO35_DRILL_MM / 2} fill={DRILL_FILL} />
                                        </g>
                                    ))
                                ) : (
                                    <g transform={`translate(${item.diodeCenter.x} ${item.diodeCenter.y}) rotate(${item.angle})`}>
                                        <rect
                                            x={-DIODE_PAD_OFFSET_MM - DIODE_PAD_WIDTH_MM / 2}
                                            y={-DIODE_PAD_HEIGHT_MM / 2}
                                            width={DIODE_PAD_WIDTH_MM}
                                            height={DIODE_PAD_HEIGHT_MM}
                                            fill={DIODE_PAD_FILL}
                                            rx={0.15}
                                        />
                                        <rect
                                            x={DIODE_PAD_OFFSET_MM - DIODE_PAD_WIDTH_MM / 2}
                                            y={-DIODE_PAD_HEIGHT_MM / 2}
                                            width={DIODE_PAD_WIDTH_MM}
                                            height={DIODE_PAD_HEIGHT_MM}
                                            fill={DIODE_PAD_FILL}
                                            rx={0.15}
                                        />
                                    </g>
                                )}
                                {showReferences && (
                                    <g>
                                        <text
                                            x={item.center.x}
                                            y={item.center.y}
                                            fill={SILK_TEXT_FILL}
                                            fontSize={SILK_REFERENCE_FONT_MM}
                                            textAnchor='middle'
                                            dominantBaseline='central'>
                                            {item.reference}
                                        </text>
                                        <text
                                            x={item.diodeCenter.x}
                                            y={item.diodeCenter.y}
                                            fill={SILK_TEXT_FILL}
                                            fontSize={DIODE_REFERENCE_FONT_MM}
                                            textAnchor='middle'
                                            dominantBaseline='central'
                                            opacity={0.75}>
                                            {item.diodeReference}
                                        </text>
                                    </g>
                                )}
                                {showMatrix && (
                                    <text
                                        x={roundCoordinate(item.center.x)}
                                        y={roundCoordinate(item.center.y - MATRIX_LABEL_OFFSET_MM)}
                                        fill={MATRIX_LABEL_FILL}
                                        fontSize={MATRIX_LABEL_FONT_MM}
                                        textAnchor='middle'
                                        dominantBaseline='central'>
                                        {item.matrixLabel}
                                    </text>
                                )}
                            </g>
                        ))}
                    </svg>
                </div>

                <Card className='w-full shrink-0 lg:w-80'>
                    <CardHeader>
                        <CardTitle>PCB generator</CardTitle>
                        <CardDescription>Handwire-grade footprints with matrix nets for KiCad.</CardDescription>
                    </CardHeader>
                    <CardContent className='flex flex-col gap-4'>
                        <div className='flex items-center justify-between gap-3'>
                            <div className='flex flex-col'>
                                <span className='text-sm font-medium text-foreground'>Matrix</span>
                                <span className='text-sm text-muted-foreground'>
                                    {matrix.rows} x {matrix.cols} · {physicalKeys.length} keys
                                </span>
                            </div>
                            <Badge variant='secondary'>{sourceLabel}</Badge>
                        </div>

                        <Separator />

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-switch-mount'>Switch mount</Label>
                            <Select value={switchMount} onValueChange={(value) => setSwitchMount(value as SwitchMount)}>
                                <SelectTrigger id='pcb-switch-mount' className='w-40'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value='solder'>Solder (THT pins)</SelectItem>
                                    <SelectItem value='hotswap'>Hotswap (Kailh socket)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-diode'>Diode</Label>
                            <Select value={diode} onValueChange={(value) => setDiode(value as DiodeKind)}>
                                <SelectTrigger id='pcb-diode' className='w-40'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value='do-35'>DO-35 THT</SelectItem>
                                    <SelectItem value='sod-123'>SOD-123 SMD</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-diodes-on-back'>Diodes on back</Label>
                            <Switch id='pcb-diodes-on-back' checked={diodesOnBack} onCheckedChange={setDiodesOnBack} />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-diode-offset-x'>Diode offset X (mm)</Label>
                            <Input
                                id='pcb-diode-offset-x'
                                type='number'
                                min={-DIODE_OFFSET_LIMIT_MM}
                                max={DIODE_OFFSET_LIMIT_MM}
                                step={0.1}
                                value={diodeOffsetXMm}
                                onChange={(event) => setDiodeOffsetXMm(clampDiodeOffset(Number(event.target.value) || 0))}
                                className='w-24'
                            />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-diode-offset-y'>Diode offset Y (mm)</Label>
                            <Input
                                id='pcb-diode-offset-y'
                                type='number'
                                min={-DIODE_OFFSET_LIMIT_MM}
                                max={DIODE_OFFSET_LIMIT_MM}
                                step={0.1}
                                value={diodeOffsetYMm}
                                onChange={(event) => setDiodeOffsetYMm(clampDiodeOffset(Number(event.target.value) || 0))}
                                className='w-24'
                            />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-stab'>Stabilizer footprints</Label>
                            <Switch id='pcb-stab' checked={stabFootprints} onCheckedChange={setStabFootprints} />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-mounting-holes'>Mounting holes</Label>
                            <Switch id='pcb-mounting-holes' checked={mountingHoles} onCheckedChange={setMountingHoles} />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-switch-rotation'>Switch rotation</Label>
                            <Select
                                value={String(switchRotation)}
                                onValueChange={(value) => setSwitchRotation(Number(value) as PcbOptions['switchRotation'])}>
                                <SelectTrigger id='pcb-switch-rotation' className='w-40'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SWITCH_ROTATION_OPTIONS.map((rotation) => (
                                        <SelectItem key={rotation} value={String(rotation)}>
                                            {rotation}°
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-outline'>Board outline</Label>
                            <Switch id='pcb-outline' checked={includeOutline} onCheckedChange={setIncludeOutline} />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-edge-margin'>Edge margin (mm)</Label>
                            <Input
                                id='pcb-edge-margin'
                                type='number'
                                min={0}
                                step={0.5}
                                value={edgeMargin}
                                onChange={(event) => setEdgeMargin(Math.max(0, Number(event.target.value) || 0))}
                                disabled={!includeOutline}
                                className='w-24'
                            />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-show-ratsnest'>Show ratsnest</Label>
                            <Switch id='pcb-show-ratsnest' checked={showRatsnest} onCheckedChange={setShowRatsnest} />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-show-references'>Show references</Label>
                            <Switch id='pcb-show-references' checked={showReferences} onCheckedChange={setShowReferences} />
                        </div>

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-show-matrix'>Show matrix</Label>
                            <Switch id='pcb-show-matrix' checked={showMatrix} onCheckedChange={setShowMatrix} />
                        </div>

                        <Separator />

                        <div className='flex items-center justify-between gap-3'>
                            <Label htmlFor='pcb-switch-models'>Include switch models in 3D</Label>
                            <Switch id='pcb-switch-models' checked={includeSwitchModels} onCheckedChange={handleToggleSwitchModels} />
                        </div>

                        <Button onClick={() => handleRender()} disabled={physicalKeys.length === 0 || rendering} className='w-full'>
                            {rendering ? <Loader2Icon className='animate-spin' /> : <BoxIcon />}
                            {rendering ? 'Rendering…' : 'Render with KiCad'}
                        </Button>

                        <div className='flex flex-col gap-2'>
                            <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Download KiCad project</span>
                            <Button variant='outline' size='sm' onClick={handleDownloadPcb} disabled={physicalKeys.length === 0}>
                                <DownloadIcon />
                                keyboard.kicad_pcb
                            </Button>
                            <Button variant='outline' size='sm' onClick={handleDownloadSch} disabled={physicalKeys.length === 0}>
                                <DownloadIcon />
                                keyboard.kicad_sch
                            </Button>
                            <Button variant='outline' size='sm' onClick={handleDownloadPro}>
                                <DownloadIcon />
                                keyboard.kicad_pro
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {manifest && (
                <Card className='w-full'>
                    <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <div className='flex flex-col gap-1'>
                            <CardTitle>KiCad render</CardTitle>
                            <CardDescription>Rendered locally with kicad-cli.</CardDescription>
                        </div>
                        <ToggleGroup
                            type='single'
                            value={viewerTab}
                            onValueChange={(value) => value && setViewerTab(value as ViewerTab)}
                            variant='outline'
                            className='self-start sm:self-auto'>
                            {VIEWER_TABS.map((tab) => {
                                const artifact = manifest.artifacts.find((entry) => entry.name === tab.value)
                                return (
                                    <ToggleGroupItem key={tab.value} value={tab.value} disabled={!artifact?.ok}>
                                        {tab.label}
                                    </ToggleGroupItem>
                                )
                            })}
                        </ToggleGroup>
                    </CardHeader>
                    <CardContent>
                        {activeArtifact?.ok ? (
                            <div className='relative flex h-[32rem] w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-neutral-900'>
                                {viewerTab === 'board.glb' ? (
                                    <GltfViewer url={activeUrl} className='h-full w-full' />
                                ) : (
                                    <img src={activeUrl} alt={activeLabel} className='h-full w-full object-contain p-4' />
                                )}
                                {viewerTab !== 'board.glb' && (
                                    <Button
                                        asChild
                                        variant='ghost'
                                        size='sm'
                                        className='absolute right-3 top-3 gap-1.5 bg-neutral-900/70 text-neutral-100 hover:bg-neutral-800 hover:text-white'>
                                        <a href={activeUrl} target='_blank' rel='noopener noreferrer'>
                                            <ExternalLinkIcon />
                                            Open
                                        </a>
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className='flex h-[32rem] w-full items-center justify-center rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground'>
                                {activeLabel} is unavailable.
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
