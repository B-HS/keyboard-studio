'use client'

import { useEffect, useRef, useState, type FC, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { KleKeyboard } from '@entities/kle/types'
import { getKeyboardBoundsU, getKeyPolygonU, roundCoordinate, type Point } from '@entities/kle/geometry'
import { cn } from '@lib/utils'
import { KeyShape } from './key-shape'

const KEY_UNIT_PX = 54
const VIEWBOX_PADDING_PX = 44
const PLATE_PADDING_PX = 14
const PLATE_RADIUS_PX = 14
const MIN_ZOOM = 0.4
const MAX_ZOOM = 4
const ZOOM_STEP = 1.1
const DRAG_THRESHOLD_PX = 4
const MOVE_SNAP_U = 0.25
const RESIZE_STEP_U = 0.25
const NUDGE_STEP_U = 0.25
const NUDGE_STEP_LARGE_U = 1

type ViewTransform = { k: number; tx: number; ty: number }

const IDENTITY_VIEW: ViewTransform = { k: 1, tx: 0, ty: 0 }

const NOOP_SELECT = () => {}

type SelectionModifier = 'plain' | 'toggle' | 'add'

type Gesture =
    | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
    | { kind: 'move'; pointerId: number; startX: number; startY: number; startU: Point; movingIndices: number[]; index: number; moved: boolean }
    | { kind: 'rubber'; pointerId: number; startX: number; startY: number; startU: Point; base: number[]; additive: boolean; moved: boolean }
    | { kind: 'select'; pointerId: number; index: number; modifier: SelectionModifier }

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

const snapToQuarter = (value: number) => Math.round(value / MOVE_SNAP_U) * MOVE_SNAP_U

const clientToUserSpace = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const screenMatrix = svg.getScreenCTM()
    if (!screenMatrix) return { x: 0, y: 0 }
    const userPoint = new DOMPoint(clientX, clientY).matrixTransform(screenMatrix.inverse())
    return { x: userPoint.x, y: userPoint.y }
}

const toggleIndex = (indices: number[], index: number) => (indices.includes(index) ? indices.filter((entry) => entry !== index) : [...indices, index])

const addIndex = (indices: number[], index: number) => (indices.includes(index) ? indices : [...indices, index])

const mergeIndices = (base: number[], extra: number[]) => {
    const seen = new Set(base)
    const merged = [...base]
    for (const index of extra) {
        if (!seen.has(index)) {
            seen.add(index)
            merged.push(index)
        }
    }
    return merged
}

const pointInPolygon = (polygon: Point[], point: Point) => {
    let inside = false
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const current = polygon[index]
        const prior = polygon[previous]
        const crosses = current.y > point.y !== prior.y > point.y
        if (crosses && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) inside = !inside
    }
    return inside
}

const orientation = (a: Point, b: Point, c: Point) => (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)

const onSegment = (a: Point, b: Point, c: Point) =>
    Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) && Math.min(a.y, c.y) <= b.y && b.y <= Math.max(a.y, c.y)

const segmentsIntersect = (a: Point, b: Point, c: Point, d: Point) => {
    const o1 = orientation(a, b, c)
    const o2 = orientation(a, b, d)
    const o3 = orientation(c, d, a)
    const o4 = orientation(c, d, b)
    if (o1 * o2 < 0 && o3 * o4 < 0) return true
    if (o1 === 0 && onSegment(a, c, b)) return true
    if (o2 === 0 && onSegment(a, d, b)) return true
    if (o3 === 0 && onSegment(c, a, d)) return true
    if (o4 === 0 && onSegment(c, b, d)) return true
    return false
}

type SelectionRect = { minX: number; minY: number; maxX: number; maxY: number }

const rectContains = (rect: SelectionRect, point: Point) =>
    point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY

const polygonIntersectsRect = (polygon: Point[], rect: SelectionRect) => {
    const corners = [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
    ]
    if (polygon.some((point) => rectContains(rect, point))) return true
    if (corners.some((corner) => pointInPolygon(polygon, corner))) return true
    for (let index = 0; index < polygon.length; index++) {
        const start = polygon[index]
        const end = polygon[(index + 1) % polygon.length]
        for (let corner = 0; corner < corners.length; corner++) {
            if (segmentsIntersect(start, end, corners[corner], corners[(corner + 1) % corners.length])) return true
        }
    }
    return false
}

type KeyboardCanvasProps = {
    keyboard: KleKeyboard
    selectedIndices: number[]
    resetViewToken: number
    onSelectionChange: (indices: number[]) => void
    onMoveSelection: (deltaX: number, deltaY: number) => void
    onResizeSelection: (deltaWidth: number, deltaHeight: number) => void
    onDeleteSelection: () => void
    onAddKey: () => void
    onCopySelection: () => void
    onCutSelection: () => void
    onPaste: () => void
    className?: string
}

export const KeyboardCanvas: FC<KeyboardCanvasProps> = ({
    keyboard,
    selectedIndices,
    resetViewToken,
    onSelectionChange,
    onMoveSelection,
    onResizeSelection,
    onDeleteSelection,
    onAddKey,
    onCopySelection,
    onCutSelection,
    onPaste,
    className,
}) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const gestureRef = useRef<Gesture | null>(null)
    const spaceRef = useRef(false)
    const previewOffsetRef = useRef<Point>({ x: 0, y: 0 })

    const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW)
    const [isPanning, setIsPanning] = useState(false)
    const [isSpaceHeld, setIsSpaceHeld] = useState(false)
    const [preview, setPreview] = useState<{ indices: number[]; x: number; y: number } | null>(null)
    const [rubber, setRubber] = useState<SelectionRect | null>(null)

    const bounds = getKeyboardBoundsU(keyboard.keys)
    const contentLeft = bounds.minX * KEY_UNIT_PX
    const contentTop = bounds.minY * KEY_UNIT_PX
    const contentWidth = bounds.width * KEY_UNIT_PX
    const contentHeight = bounds.height * KEY_UNIT_PX
    const viewBox = `${contentLeft - VIEWBOX_PADDING_PX} ${contentTop - VIEWBOX_PADDING_PX} ${contentWidth + VIEWBOX_PADDING_PX * 2} ${contentHeight + VIEWBOX_PADDING_PX * 2}`

    const selectedSet = new Set(selectedIndices)
    const previewSet = preview ? new Set(preview.indices) : null

    const toContentU = (clientX: number, clientY: number) => {
        const svg = svgRef.current
        if (!svg) return { x: 0, y: 0 }
        const user = clientToUserSpace(svg, clientX, clientY)
        return { x: (user.x - view.tx) / view.k / KEY_UNIT_PX, y: (user.y - view.ty) / view.k / KEY_UNIT_PX }
    }

    const hitTest = (point: Point) => {
        for (let index = keyboard.keys.length - 1; index >= 0; index--) {
            if (pointInPolygon(getKeyPolygonU(keyboard.keys[index]), point)) return index
        }
        return null
    }

    const cycleSelection = (direction: number) => {
        const count = keyboard.keys.length
        if (count === 0) return
        const anchor = selectedIndices.length > 0 ? selectedIndices[selectedIndices.length - 1] : direction > 0 ? -1 : 0
        const next = (((anchor + direction) % count) + count) % count
        onSelectionChange([next])
    }

    const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (event.button !== 0 && event.button !== 1) return
        const svg = svgRef.current
        if (!svg) return
        svg.focus()
        svg.setPointerCapture(event.pointerId)
        const isPan = event.button === 1 || (event.button === 0 && spaceRef.current)
        if (isPan) {
            gestureRef.current = { kind: 'pan', pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY }
            setIsPanning(true)
            return
        }
        const cursor = toContentU(event.clientX, event.clientY)
        const hit = hitTest(cursor)
        const modifier: SelectionModifier = event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'plain'
        if (hit !== null) {
            if (modifier === 'plain') {
                const inSelection = selectedSet.has(hit)
                const movingIndices = inSelection ? selectedIndices : [hit]
                if (!inSelection) onSelectionChange([hit])
                gestureRef.current = {
                    kind: 'move',
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startU: cursor,
                    movingIndices,
                    index: hit,
                    moved: false,
                }
                return
            }
            gestureRef.current = { kind: 'select', pointerId: event.pointerId, index: hit, modifier }
            return
        }
        const additive = modifier !== 'plain'
        gestureRef.current = {
            kind: 'rubber',
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startU: cursor,
            base: additive ? selectedIndices : [],
            additive,
            moved: false,
        }
    }

    const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        const gesture = gestureRef.current
        const svg = svgRef.current
        if (!gesture || !svg || gesture.pointerId !== event.pointerId) return
        if (gesture.kind === 'pan') {
            const previousUser = clientToUserSpace(svg, gesture.lastX, gesture.lastY)
            const currentUser = clientToUserSpace(svg, event.clientX, event.clientY)
            gesture.lastX = event.clientX
            gesture.lastY = event.clientY
            setView((previous) => ({
                k: previous.k,
                tx: previous.tx + (currentUser.x - previousUser.x),
                ty: previous.ty + (currentUser.y - previousUser.y),
            }))
            return
        }
        if (gesture.kind === 'move') {
            if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_THRESHOLD_PX) return
            gesture.moved = true
            const cursor = toContentU(event.clientX, event.clientY)
            const offsetX = snapToQuarter(cursor.x - gesture.startU.x)
            const offsetY = snapToQuarter(cursor.y - gesture.startU.y)
            previewOffsetRef.current = { x: offsetX, y: offsetY }
            setPreview({ indices: gesture.movingIndices, x: offsetX, y: offsetY })
            return
        }
        if (gesture.kind === 'rubber') {
            if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_THRESHOLD_PX) return
            gesture.moved = true
            const cursor = toContentU(event.clientX, event.clientY)
            const rect: SelectionRect = {
                minX: Math.min(gesture.startU.x, cursor.x),
                minY: Math.min(gesture.startU.y, cursor.y),
                maxX: Math.max(gesture.startU.x, cursor.x),
                maxY: Math.max(gesture.startU.y, cursor.y),
            }
            setRubber(rect)
            const hits: number[] = []
            for (let index = 0; index < keyboard.keys.length; index++) {
                if (polygonIntersectsRect(getKeyPolygonU(keyboard.keys[index]), rect)) hits.push(index)
            }
            onSelectionChange(gesture.additive ? mergeIndices(gesture.base, hits) : hits)
        }
    }

    const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
        const gesture = gestureRef.current
        const svg = svgRef.current
        if (!gesture || gesture.pointerId !== event.pointerId) return
        svg?.releasePointerCapture(event.pointerId)
        gestureRef.current = null
        if (gesture.kind === 'pan') {
            setIsPanning(false)
            return
        }
        if (gesture.kind === 'move') {
            if (gesture.moved) {
                const offset = previewOffsetRef.current
                if (offset.x !== 0 || offset.y !== 0) onMoveSelection(offset.x, offset.y)
            } else {
                onSelectionChange([gesture.index])
            }
            setPreview(null)
            return
        }
        if (gesture.kind === 'rubber') {
            if (!gesture.moved) onSelectionChange([])
            setRubber(null)
            return
        }
        if (gesture.modifier === 'toggle') onSelectionChange(toggleIndex(selectedIndices, gesture.index))
        else onSelectionChange(addIndex(selectedIndices, gesture.index))
    }

    const handleDoubleClick = () => setView(IDENTITY_VIEW)

    const handleKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
        if (event.key === ' ') {
            spaceRef.current = true
            setIsSpaceHeld(true)
            event.preventDefault()
            return
        }
        const modifier = event.ctrlKey || event.metaKey
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault()
            onDeleteSelection()
            return
        }
        if (event.key === 'Escape') {
            onSelectionChange([])
            return
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            if (event.shiftKey) onResizeSelection(-RESIZE_STEP_U, 0)
            else onMoveSelection(modifier ? -NUDGE_STEP_LARGE_U : -NUDGE_STEP_U, 0)
            return
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault()
            if (event.shiftKey) onResizeSelection(RESIZE_STEP_U, 0)
            else onMoveSelection(modifier ? NUDGE_STEP_LARGE_U : NUDGE_STEP_U, 0)
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (event.shiftKey) onResizeSelection(0, -RESIZE_STEP_U)
            else onMoveSelection(0, modifier ? -NUDGE_STEP_LARGE_U : -NUDGE_STEP_U)
            return
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (event.shiftKey) onResizeSelection(0, RESIZE_STEP_U)
            else onMoveSelection(0, modifier ? NUDGE_STEP_LARGE_U : NUDGE_STEP_U)
            return
        }
        if (event.key === 'a' || event.key === 'A') {
            event.preventDefault()
            if (modifier) onSelectionChange(keyboard.keys.map((_, index) => index))
            else onAddKey()
            return
        }
        if (modifier && (event.key === 'c' || event.key === 'C')) {
            event.preventDefault()
            onCopySelection()
            return
        }
        if (modifier && (event.key === 'x' || event.key === 'X')) {
            event.preventDefault()
            onCutSelection()
            return
        }
        if (modifier && (event.key === 'v' || event.key === 'V')) {
            event.preventDefault()
            onPaste()
            return
        }
        if (modifier && event.key === ']') {
            event.preventDefault()
            cycleSelection(1)
            return
        }
        if (modifier && event.key === '[') {
            event.preventDefault()
            cycleSelection(-1)
        }
    }

    const handleKeyUp = (event: ReactKeyboardEvent<SVGSVGElement>) => {
        if (event.key === ' ') {
            spaceRef.current = false
            setIsSpaceHeld(false)
        }
    }

    const handleBlur = () => {
        spaceRef.current = false
        setIsSpaceHeld(false)
    }

    useEffect(() => {
        const svg = svgRef.current
        if (!svg) return
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault()
            const cursor = clientToUserSpace(svg, event.clientX, event.clientY)
            setView((previous) => {
                const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
                const nextScale = clampZoom(previous.k * factor)
                const localX = (cursor.x - previous.tx) / previous.k
                const localY = (cursor.y - previous.ty) / previous.k
                return { k: nextScale, tx: cursor.x - localX * nextScale, ty: cursor.y - localY * nextScale }
            })
        }
        svg.addEventListener('wheel', handleWheel, { passive: false })
        return () => svg.removeEventListener('wheel', handleWheel)
    }, [])

    useEffect(() => {
        setView(IDENTITY_VIEW)
    }, [resetViewToken])

    const cursorClass = isPanning ? 'cursor-grabbing' : isSpaceHeld ? 'cursor-grab' : preview ? 'cursor-grabbing' : 'cursor-default'

    return (
        <svg
            ref={svgRef}
            viewBox={viewBox}
            tabIndex={0}
            preserveAspectRatio='xMidYMid meet'
            role='img'
            aria-label={keyboard.meta.name || 'Keyboard layout'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onBlur={handleBlur}
            className={cn('h-full w-full touch-none select-none bg-muted/20 outline-none', cursorClass, className)}>
            <defs>
                <filter id='keebforge-plate-shadow' x='-20%' y='-20%' width='140%' height='140%'>
                    <feDropShadow dx='0' dy='2' stdDeviation='6' floodColor='#000000' floodOpacity='0.2' />
                </filter>
            </defs>
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
                {keyboard.meta.backcolor && (
                    <rect
                        x={contentLeft - PLATE_PADDING_PX}
                        y={contentTop - PLATE_PADDING_PX}
                        width={contentWidth + PLATE_PADDING_PX * 2}
                        height={contentHeight + PLATE_PADDING_PX * 2}
                        rx={PLATE_RADIUS_PX}
                        fill={keyboard.meta.backcolor}
                        className='stroke-black/10'
                        strokeWidth={1}
                        vectorEffect='non-scaling-stroke'
                        filter='url(#keebforge-plate-shadow)'
                    />
                )}
                {keyboard.keys.map((key, keyIndex) => {
                    const isSelected = selectedSet.has(keyIndex)
                    const isPreviewing = previewSet?.has(keyIndex) && preview
                    const transform = isPreviewing
                        ? `translate(${roundCoordinate(preview.x * KEY_UNIT_PX)} ${roundCoordinate(preview.y * KEY_UNIT_PX)})`
                        : undefined
                    return (
                        <g key={keyIndex} transform={transform}>
                            <KeyShape kleKey={key} index={keyIndex} isSelected={isSelected} onSelect={NOOP_SELECT} />
                        </g>
                    )
                })}
                {rubber && (
                    <rect
                        x={roundCoordinate(rubber.minX * KEY_UNIT_PX)}
                        y={roundCoordinate(rubber.minY * KEY_UNIT_PX)}
                        width={roundCoordinate((rubber.maxX - rubber.minX) * KEY_UNIT_PX)}
                        height={roundCoordinate((rubber.maxY - rubber.minY) * KEY_UNIT_PX)}
                        className='fill-primary/15 stroke-primary'
                        strokeWidth={1}
                        vectorEffect='non-scaling-stroke'
                    />
                )}
            </g>
        </svg>
    )
}
