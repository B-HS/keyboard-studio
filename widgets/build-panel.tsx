'use client'

import { FC, PropsWithChildren, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DownloadIcon, PackageIcon } from 'lucide-react'
import { formatKleJson } from '@entities/kle/format'
import { roundCoordinate } from '@entities/kle/geometry'
import { serializeKle } from '@entities/kle/serialize'
import { buildKeyboardSummary, renderKeyboardSummaryText } from '@entities/kle/summary'
import { KleKeyboard, KleMetadata } from '@entities/kle/types'
import { generateKicadPcb } from '@entities/pcb/generate-kicad'
import { DEFAULT_PCB_OPTIONS } from '@entities/pcb/types'
import { buildWiringDiagram, wiringColColor, wiringDiagramToSvg, wiringRowColor } from '@entities/pcb/wiring-diagram'
import { buildPlate } from '@entities/plate/generate'
import { plateToDxf } from '@entities/plate/export-dxf'
import { plateToJscadScript } from '@entities/plate/export-jscad'
import { plateToStl } from '@entities/plate/export-stl'
import { plateToSvg } from '@entities/plate/export-svg'
import { DEFAULT_PLATE_OPTIONS } from '@entities/plate/types'
import { generateKicadPro, generateKicadSch } from '@entities/sch/generate-kicad-sch'
import { downloadBinaryFile, downloadTextFile } from '@lib/download'
import { createZip, ZipEntry } from '@lib/zip'
import { Button } from '@ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/card'
import { Input } from '@ui/input'
import { Label } from '@ui/label'
import { Separator } from '@ui/separator'
import { Textarea } from '@ui/textarea'

type BuildPanelProps = {
    keyboard: KleKeyboard
    onApplyMeta: (meta: KleMetadata) => void
}

const SVG_PADDING_MM = 10
const WIRE_STROKE_MM = 1.1
const OUTLINE_STROKE_MM = 0.3
const NODE_RADIUS_MM = 1.1
const ENCODER_RADIUS_MM = 4.5
const ENCODER_STROKE_MM = 0.6
const LABEL_FONT_MM = 3.6
const LABEL_OFFSET_MM = 3
const BUNDLE_FILE_NAME = 'keyboard-project.zip'
const WIRING_FILE_NAME = 'wiring-diagram.svg'
const KICAD_PROJECT_NAME = 'keyboard'

const BUNDLE_CONTENTS = [
    'layout.json',
    'plate.stl',
    'plate.dxf',
    'plate.svg',
    'plate.jscad',
    'keyboard.kicad_pcb',
    'keyboard.kicad_sch',
    'keyboard.kicad_pro',
    'wiring-diagram.svg',
    'summary.txt',
]

const concatArrayBuffers = (buffers: ArrayBuffer[]) => {
    const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const buffer of buffers) {
        out.set(new Uint8Array(buffer), offset)
        offset += buffer.byteLength
    }
    return out
}

const SectionHeading: FC<PropsWithChildren> = ({ children }) => (
    <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{children}</p>
)

type StatTileProps = {
    label: string
    value: string
}

const StatTile: FC<StatTileProps> = ({ label, value }) => (
    <div className='flex flex-col gap-1 rounded-lg border bg-card p-4'>
        <span className='text-xs text-muted-foreground'>{label}</span>
        <span className='text-lg font-medium tabular-nums'>{value}</span>
    </div>
)

type InventoryTableProps = {
    caption: string
    rows: { label: string; count: number }[]
    emptyLabel: string
}

const InventoryTable: FC<InventoryTableProps> = ({ caption, rows, emptyLabel }) => (
    <div className='flex flex-col gap-3'>
        <SectionHeading>{caption}</SectionHeading>
        {rows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{emptyLabel}</p>
        ) : (
            <table className='w-full text-sm'>
                <thead>
                    <tr className='border-b text-left text-xs uppercase tracking-wide text-muted-foreground'>
                        <th className='pb-2 font-medium'>Size</th>
                        <th className='pb-2 text-right font-medium'>Qty</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label} className='border-b border-border/60 last:border-0'>
                            <td className='py-1.5 tabular-nums'>{row.label}</td>
                            <td className='py-1.5 text-right tabular-nums'>{row.count}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
)

const polygonPoints = (polygon: { x: number; y: number }[]) =>
    polygon.map((point) => `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`).join(' ')

export const BuildPanel: FC<BuildPanelProps> = ({ keyboard, onApplyMeta }) => {
    const [name, setName] = useState(keyboard.meta.name)
    const [author, setAuthor] = useState(keyboard.meta.author)
    const [notes, setNotes] = useState(keyboard.meta.notes)

    const summary = buildKeyboardSummary(keyboard)
    const diagram = buildWiringDiagram(keyboard)
    const buildable = diagram.nodes.length > 0
    const metaDirty = name !== keyboard.meta.name || author !== keyboard.meta.author || notes !== keyboard.meta.notes

    const viewMinX = roundCoordinate(diagram.bounds.minX - SVG_PADDING_MM)
    const viewMinY = roundCoordinate(diagram.bounds.minY - SVG_PADDING_MM)
    const viewWidth = roundCoordinate(diagram.bounds.width + SVG_PADDING_MM * 2)
    const viewHeight = roundCoordinate(diagram.bounds.height + SVG_PADDING_MM * 2)
    const viewBox = `${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}`

    const applyMeta = () => onApplyMeta({ ...keyboard.meta, name, author, notes })

    const handleDownloadWiring = () => {
        downloadTextFile(WIRING_FILE_NAME, wiringDiagramToSvg(diagram), 'image/svg+xml')
        toast.success('Downloaded wiring-diagram.svg')
    }

    const handleDownloadBundle = () => {
        try {
            const plate = buildPlate(keyboard.keys, DEFAULT_PLATE_OPTIONS)
            const entries: ZipEntry[] = [
                { name: 'layout.json', data: formatKleJson(serializeKle(keyboard)) },
                { name: 'plate.stl', data: concatArrayBuffers(plateToStl(plate, DEFAULT_PLATE_OPTIONS.thickness)) },
                { name: 'plate.dxf', data: plateToDxf(plate) },
                { name: 'plate.svg', data: plateToSvg(plate) },
                { name: 'plate.jscad', data: plateToJscadScript(plate, DEFAULT_PLATE_OPTIONS.thickness) },
                { name: 'keyboard.kicad_pcb', data: generateKicadPcb(keyboard, DEFAULT_PCB_OPTIONS) },
                { name: 'keyboard.kicad_sch', data: generateKicadSch(keyboard) },
                { name: 'keyboard.kicad_pro', data: generateKicadPro(KICAD_PROJECT_NAME) },
                { name: 'wiring-diagram.svg', data: wiringDiagramToSvg(diagram) },
                { name: 'summary.txt', data: renderKeyboardSummaryText(summary) },
            ]
            downloadBinaryFile(BUNDLE_FILE_NAME, [createZip(entries).buffer], 'application/zip')
            toast.success('Downloaded project bundle')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to build project bundle')
        }
    }

    useEffect(() => {
        setName(keyboard.meta.name)
        setAuthor(keyboard.meta.author)
        setNotes(keyboard.meta.notes)
    }, [keyboard.meta.name, keyboard.meta.author, keyboard.meta.notes])

    return (
        <div className='flex flex-col gap-4'>
            <div className='grid gap-4 lg:grid-cols-2'>
                <Card>
                    <CardHeader>
                        <CardTitle>Build summary</CardTitle>
                        <CardDescription>Everything the layout needs to become a physical keyboard.</CardDescription>
                    </CardHeader>
                    <CardContent className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                        <StatTile label='Total keys' value={String(summary.totalKeys)} />
                        <StatTile label='Switches' value={String(summary.switchCount)} />
                        <StatTile label='Encoders' value={String(summary.encoderCount)} />
                        <StatTile label='Diodes' value={String(summary.diodeCount)} />
                        <StatTile label='Matrix' value={`${summary.rows} × ${summary.cols}`} />
                        <StatTile label='Stabilizers' value={String(summary.stabilizers.reduce((sum, stab) => sum + stab.count, 0))} />
                        <StatTile label='Size (u)' value={`${summary.widthU} × ${summary.heightU}`} />
                        <StatTile label='Size (mm)' value={`${summary.widthMm.toFixed(1)} × ${summary.heightMm.toFixed(1)}`} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Bill of materials</CardTitle>
                        <CardDescription>Keycap and stabilizer inventory by size.</CardDescription>
                    </CardHeader>
                    <CardContent className='flex flex-col gap-6'>
                        <InventoryTable
                            caption='Keycaps'
                            emptyLabel='No keycaps in this layout'
                            rows={summary.keycaps.map((cap) => ({ label: `${cap.widthU}u × ${cap.heightU}u`, count: cap.count }))}
                        />
                        <InventoryTable
                            caption='Stabilizers'
                            emptyLabel='No stabilizers required'
                            rows={summary.stabilizers.map((stab) => ({ label: stab.label, count: stab.count }))}
                        />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='flex flex-col gap-1'>
                        <CardTitle>Handwire wiring diagram</CardTitle>
                        <CardDescription>Row and column wires through each switch center for point-to-point wiring.</CardDescription>
                    </div>
                    <Button variant='outline' size='sm' onClick={handleDownloadWiring} disabled={!buildable} className='self-start sm:self-auto'>
                        <DownloadIcon />
                        {WIRING_FILE_NAME}
                    </Button>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                    {buildable ? (
                        <div className='overflow-hidden rounded-lg border bg-card p-4'>
                            <svg viewBox={viewBox} className='max-h-[60vh] w-full' role='img' aria-label='Handwire wiring diagram'>
                                {diagram.nodes.map((node) => (
                                    <path
                                        key={`outline-${node.keyIndex}`}
                                        d={`${node.polygon.map((point, index) => `${index === 0 ? 'M' : 'L'}${roundCoordinate(point.x)} ${roundCoordinate(point.y)}`).join(' ')} Z`}
                                        strokeWidth={OUTLINE_STROKE_MM}
                                        className='fill-muted/50 stroke-border'
                                    />
                                ))}
                                {diagram.cols.map((line) => (
                                    <polyline
                                        key={`col-${line.index}`}
                                        points={polygonPoints(line.points)}
                                        fill='none'
                                        stroke={wiringColColor(line.index, diagram.colCount)}
                                        strokeWidth={WIRE_STROKE_MM}
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                ))}
                                {diagram.rows.map((line) => (
                                    <polyline
                                        key={`row-${line.index}`}
                                        points={polygonPoints(line.points)}
                                        fill='none'
                                        stroke={wiringRowColor(line.index, diagram.rowCount)}
                                        strokeWidth={WIRE_STROKE_MM}
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                ))}
                                {diagram.nodes.map((node) => (
                                    <circle
                                        key={`node-${node.keyIndex}`}
                                        cx={roundCoordinate(node.center.x)}
                                        cy={roundCoordinate(node.center.y)}
                                        r={NODE_RADIUS_MM}
                                        className='fill-muted-foreground'
                                    />
                                ))}
                                {diagram.nodes
                                    .filter((node) => node.isEncoder)
                                    .map((node) => (
                                        <circle
                                            key={`encoder-${node.keyIndex}`}
                                            cx={roundCoordinate(node.center.x)}
                                            cy={roundCoordinate(node.center.y)}
                                            r={ENCODER_RADIUS_MM}
                                            fill='none'
                                            strokeWidth={ENCODER_STROKE_MM}
                                            className='stroke-primary'
                                        />
                                    ))}
                                {diagram.rows.map((line) => {
                                    const last = line.points[line.points.length - 1]
                                    return (
                                        <text
                                            key={`row-label-${line.index}`}
                                            x={roundCoordinate(last.x + LABEL_OFFSET_MM)}
                                            y={roundCoordinate(last.y)}
                                            fontSize={LABEL_FONT_MM}
                                            dominantBaseline='central'
                                            className='fill-muted-foreground'>
                                            R{line.index}
                                        </text>
                                    )
                                })}
                                {diagram.cols.map((line) => {
                                    const last = line.points[line.points.length - 1]
                                    return (
                                        <text
                                            key={`col-label-${line.index}`}
                                            x={roundCoordinate(last.x)}
                                            y={roundCoordinate(last.y + LABEL_OFFSET_MM + LABEL_FONT_MM)}
                                            fontSize={LABEL_FONT_MM}
                                            textAnchor='middle'
                                            className='fill-muted-foreground'>
                                            C{line.index}
                                        </text>
                                    )
                                })}
                            </svg>
                        </div>
                    ) : (
                        <div className='flex h-40 items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground'>
                            Add keys to generate a wiring diagram
                        </div>
                    )}
                    <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground'>
                        <span className='flex items-center gap-2'>
                            <span className='h-0.5 w-6 rounded-full' style={{ backgroundColor: wiringRowColor(0, 1) }} />
                            Rows (R0–R{Math.max(0, diagram.rowCount - 1)})
                        </span>
                        <span className='flex items-center gap-2'>
                            <span className='h-0.5 w-6 rounded-full' style={{ backgroundColor: wiringColColor(0, 1) }} />
                            Columns (C0–C{Math.max(0, diagram.colCount - 1)})
                        </span>
                        <span className='flex items-center gap-2'>
                            <span className='h-3 w-3 rounded-full border-2 border-primary' />
                            Rotary encoder
                        </span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Project bundle</CardTitle>
                    <CardDescription>Metadata plus every export packaged into a single archive.</CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-6'>
                    <div className='flex flex-col gap-4'>
                        <SectionHeading>Keyboard metadata</SectionHeading>
                        <div className='grid gap-4 sm:grid-cols-2'>
                            <div className='flex flex-col gap-1.5'>
                                <Label htmlFor='build-meta-name' className='text-xs font-normal text-muted-foreground'>
                                    Name
                                </Label>
                                <Input
                                    id='build-meta-name'
                                    value={name}
                                    placeholder='My keyboard'
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </div>
                            <div className='flex flex-col gap-1.5'>
                                <Label htmlFor='build-meta-author' className='text-xs font-normal text-muted-foreground'>
                                    Author
                                </Label>
                                <Input
                                    id='build-meta-author'
                                    value={author}
                                    placeholder='Your name'
                                    onChange={(event) => setAuthor(event.target.value)}
                                />
                            </div>
                        </div>
                        <div className='flex flex-col gap-1.5'>
                            <Label htmlFor='build-meta-notes' className='text-xs font-normal text-muted-foreground'>
                                Notes
                            </Label>
                            <Textarea
                                id='build-meta-notes'
                                value={notes}
                                placeholder='Build notes, firmware, plate material…'
                                rows={3}
                                onChange={(event) => setNotes(event.target.value)}
                            />
                        </div>
                        <div className='flex justify-end'>
                            <Button variant='outline' size='sm' onClick={applyMeta} disabled={!metaDirty}>
                                Save metadata
                            </Button>
                        </div>
                    </div>

                    <Separator />

                    <div className='flex flex-col gap-4'>
                        <SectionHeading>Download</SectionHeading>
                        <p className='text-sm text-muted-foreground'>Bundles {BUNDLE_CONTENTS.join(', ')} using the default plate and PCB options.</p>
                        <Button onClick={handleDownloadBundle} disabled={!buildable} className='self-start'>
                            <PackageIcon />
                            Download project bundle (.zip)
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
