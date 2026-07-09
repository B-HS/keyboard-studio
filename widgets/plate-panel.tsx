'use client'

import { FC, PropsWithChildren, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { DownloadIcon } from 'lucide-react'
import { Point } from '@entities/kle/geometry'
import { KleKeyboard } from '@entities/kle/types'
import { buildPlate, getUsableKeys, isKeyStabilized } from '@entities/plate/generate'
import { plateToDxf } from '@entities/plate/export-dxf'
import { plateToStl } from '@entities/plate/export-stl'
import { plateToSvg } from '@entities/plate/export-svg'
import { plateToJscadScript } from '@entities/plate/export-jscad'
import { plateToMesh } from '@entities/plate/to-mesh'
import { DEFAULT_PLATE_OPTIONS, PlateCutout, PlateOptions, PlateStabilizer, SWITCH_CUTOUT_DEFAULTS } from '@entities/plate/types'
import { downloadBinaryFile, downloadTextFile } from '@lib/download'
import { useDebounce } from '@lib/hooks/use-debounce'
import { Button } from '@ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@ui/card'
import { Input } from '@ui/input'
import { Label } from '@ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'
import { Separator } from '@ui/separator'
import { Skeleton } from '@ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@ui/toggle-group'

type PlatePanelProps = {
    keyboard: KleKeyboard
}

type ViewMode = '2d' | '3d'

const MESH_DEBOUNCE_MS = 300

const MeshViewer = dynamic(() => import('@features/viewer3d/mesh-viewer').then((mod) => mod.MeshViewer), {
    ssr: false,
    loading: () => <Skeleton className='h-full w-full' />,
})

const CUTOUT_OPTIONS = [
    { value: 'mx', label: 'MX' },
    { value: 'mx-open', label: 'MX Open' },
    { value: 'alps', label: 'Alps' },
    { value: 'choc', label: 'Choc' },
] as const

const STABILIZER_OPTIONS = [
    { value: 'cherry', label: 'Cherry (plate mount)' },
    { value: 'mx-basic', label: 'MX basic' },
    { value: 'mx-bidirectional', label: 'MX bidirectional' },
    { value: 'mx-tight', label: 'MX tight' },
    { value: 'mx-spec', label: 'MX spec' },
    { value: 'mx-spec-narrow', label: 'MX spec narrow' },
    { value: 'none', label: 'None' },
] as const

const KERF_FIELD = { min: -0.5, max: 0.5, step: 0.01, fractionDigits: 2 }
const SIZE_FIELD = { min: 1, max: 30, step: 0.1, fractionDigits: 1 }
const MARGIN_FIELD = { min: 0, max: 20, step: 0.1, fractionDigits: 1 }
const RADIUS_FIELD = { min: 0, max: 10, step: 0.1, fractionDigits: 1 }
const THICKNESS_FIELD = { min: 0.5, max: 10, step: 0.1, fractionDigits: 1 }

const PREVIEW_PADDING_RATIO = 0.08
const LABEL_FONT_SIZE_RATIO = 0.035
const LABEL_OFFSET_RATIO = 0.35

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const polygonToPath = (polygon: Point[]) => `${polygon.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')} Z`

const SectionHeading: FC<PropsWithChildren> = ({ children }) => (
    <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{children}</p>
)

type NumberFieldProps = {
    label: string
    value: number
    unit: string
    min: number
    max: number
    step: number
    fractionDigits: number
    onCommit: (value: number) => void
}

const NumberField: FC<NumberFieldProps> = ({ label, value, unit, min, max, step, fractionDigits, onCommit }) => {
    const [draft, setDraft] = useState<string | null>(null)

    const commit = () => {
        if (draft === null) return
        const trimmed = draft.trim()
        const parsed = Number(trimmed)
        setDraft(null)
        if (trimmed === '' || !Number.isFinite(parsed)) return
        onCommit(clamp(parsed, min, max))
    }

    return (
        <div className='flex flex-col gap-1.5'>
            <Label className='text-xs font-normal text-muted-foreground'>{label}</Label>
            <div className='relative'>
                <Input
                    type='number'
                    inputMode='decimal'
                    min={min}
                    max={max}
                    step={step}
                    value={draft ?? value.toFixed(fractionDigits)}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                    className='pr-9 tabular-nums'
                />
                <span className='pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground'>{unit}</span>
            </div>
        </div>
    )
}

type OverrideFieldProps = {
    label: string
    value: number | null
    placeholder: number
    unit: string
    min: number
    max: number
    step: number
    fractionDigits: number
    onCommit: (value: number | null) => void
}

const OverrideField: FC<OverrideFieldProps> = ({ label, value, placeholder, unit, min, max, step, fractionDigits, onCommit }) => {
    const [draft, setDraft] = useState<string | null>(null)

    const commit = () => {
        if (draft === null) return
        const trimmed = draft.trim()
        setDraft(null)
        if (trimmed === '') return onCommit(null)
        const parsed = Number(trimmed)
        if (!Number.isFinite(parsed)) return
        onCommit(clamp(parsed, min, max))
    }

    return (
        <div className='flex flex-col gap-1.5'>
            <Label className='text-xs font-normal text-muted-foreground'>{label}</Label>
            <div className='relative'>
                <Input
                    type='number'
                    inputMode='decimal'
                    min={min}
                    max={max}
                    step={step}
                    placeholder={placeholder.toFixed(fractionDigits)}
                    value={draft ?? (value === null ? '' : value.toFixed(fractionDigits))}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                    className='pr-9 tabular-nums'
                />
                <span className='pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground'>{unit}</span>
            </div>
        </div>
    )
}

export const PlatePanel: FC<PlatePanelProps> = ({ keyboard }) => {
    const [options, setOptions] = useState<PlateOptions>(DEFAULT_PLATE_OPTIONS)
    const [viewMode, setViewMode] = useState<ViewMode>('2d')

    const updateOption = <Key extends keyof PlateOptions>(key: Key, value: PlateOptions[Key]) =>
        setOptions((previous) => ({ ...previous, [key]: value }))

    const switchDefaults = SWITCH_CUTOUT_DEFAULTS[options.cutout]

    const plate = buildPlate(keyboard.keys, options)
    const usableKeys = getUsableKeys(keyboard.keys)
    const stabilizerPairCount = usableKeys.filter((key) => isKeyStabilized(key, options)).length

    const debouncedOptions = useDebounce(options, MESH_DEBOUNCE_MS)
    const meshPlate = buildPlate(keyboard.keys, debouncedOptions)
    const meshData = viewMode === '3d' && meshPlate.outline.length > 0 ? plateToMesh(meshPlate, debouncedOptions.thickness) : null

    const outlineMinX = Math.min(...plate.outline.map((point) => point.x))
    const outlineMinY = Math.min(...plate.outline.map((point) => point.y))
    const previewSpan = Math.max(plate.widthMm, plate.heightMm)
    const previewPadding = previewSpan * PREVIEW_PADDING_RATIO
    const labelFontSize = previewSpan * LABEL_FONT_SIZE_RATIO
    const labelOffset = previewPadding * LABEL_OFFSET_RATIO
    const widthLabelX = outlineMinX + plate.widthMm / 2
    const heightLabelY = outlineMinY + plate.heightMm / 2
    const viewBox = `${outlineMinX - previewPadding} ${outlineMinY - previewPadding} ${plate.widthMm + previewPadding * 2} ${plate.heightMm + previewPadding * 2}`
    const platePath = [plate.outline, ...plate.holes].map(polygonToPath).join(' ')

    const handleDownloadStl = () => {
        try {
            downloadBinaryFile('plate.stl', plateToStl(plate, options.thickness), 'model/stl')
            toast.success('Downloaded plate.stl')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to generate STL')
        }
    }

    const handleDownloadDxf = () => {
        downloadTextFile('plate.dxf', plateToDxf(plate), 'application/dxf')
        toast.success('Downloaded plate.dxf')
    }

    const handleDownloadJscad = () => {
        downloadTextFile('plate.jscad', plateToJscadScript(plate, options.thickness), 'application/javascript')
        toast.success('Downloaded plate.jscad')
    }

    const handleDownloadSvg = () => {
        downloadTextFile('plate.svg', plateToSvg(plate), 'image/svg+xml')
        toast.success('Downloaded plate.svg')
    }

    return (
        <div className='flex flex-col gap-4 lg:flex-row'>
            <div className='flex min-w-0 flex-1 flex-col gap-4'>
                <div className='flex h-8 items-center justify-between'>
                    <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Preview</span>
                    <ToggleGroup
                        type='single'
                        value={viewMode}
                        variant='outline'
                        size='sm'
                        onValueChange={(value) => value && setViewMode(value as ViewMode)}>
                        <ToggleGroupItem value='2d' aria-label='2D preview'>
                            2D
                        </ToggleGroupItem>
                        <ToggleGroupItem value='3d' aria-label='3D preview'>
                            3D
                        </ToggleGroupItem>
                    </ToggleGroup>
                </div>

                {viewMode === '2d' && (
                    <div className='flex items-center justify-center rounded-xl border bg-card p-6'>
                        <svg viewBox={viewBox} className='max-h-[60vh] w-full' role='img' aria-label='Switch plate preview'>
                            <path
                                d={platePath}
                                fillRule='evenodd'
                                strokeWidth={1}
                                vectorEffect='non-scaling-stroke'
                                className='fill-muted-foreground/20 stroke-border'
                            />
                            <text
                                x={widthLabelX}
                                y={outlineMinY - labelOffset}
                                textAnchor='middle'
                                fontSize={labelFontSize}
                                className='fill-muted-foreground'>
                                {plate.widthMm.toFixed(1)} mm
                            </text>
                            <text
                                x={outlineMinX - labelOffset}
                                y={heightLabelY}
                                textAnchor='middle'
                                fontSize={labelFontSize}
                                transform={`rotate(-90 ${outlineMinX - labelOffset} ${heightLabelY})`}
                                className='fill-muted-foreground'>
                                {plate.heightMm.toFixed(1)} mm
                            </text>
                        </svg>
                    </div>
                )}

                {viewMode === '3d' && (
                    <div className='flex h-[60vh] items-center justify-center overflow-hidden rounded-xl border bg-card'>
                        {meshData ? (
                            <MeshViewer positions={meshData.positions} normals={meshData.normals} className='h-full w-full' />
                        ) : (
                            <Skeleton className='h-full w-full' />
                        )}
                    </div>
                )}
            </div>

            <Card className='w-full shrink-0 lg:w-80'>
                <CardHeader>
                    <CardTitle>Plate options</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-5'>
                    <div className='flex flex-col gap-2 text-sm'>
                        <div className='flex items-center justify-between gap-3'>
                            <span className='text-muted-foreground'>Size</span>
                            <span className='font-medium tabular-nums'>
                                {plate.widthMm.toFixed(1)} × {plate.heightMm.toFixed(1)} mm
                            </span>
                        </div>
                        <div className='flex items-center justify-between gap-3'>
                            <span className='text-muted-foreground'>Cutouts</span>
                            <span className='font-medium tabular-nums'>{usableKeys.length}</span>
                        </div>
                        <div className='flex items-center justify-between gap-3'>
                            <span className='text-muted-foreground'>Stabilizer pairs</span>
                            <span className='font-medium tabular-nums'>{stabilizerPairCount}</span>
                        </div>
                    </div>

                    <Separator />

                    <section className='flex flex-col gap-3'>
                        <SectionHeading>Cutout</SectionHeading>
                        <div className='flex flex-col gap-1.5'>
                            <Label className='text-xs font-normal text-muted-foreground'>Switch type</Label>
                            <Select value={options.cutout} onValueChange={(value) => updateOption('cutout', value as PlateCutout)}>
                                <SelectTrigger className='w-full'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CUTOUT_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className='grid grid-cols-2 gap-3'>
                            <OverrideField
                                label='Width'
                                value={options.switchCutoutWidth}
                                placeholder={switchDefaults.width}
                                unit='mm'
                                onCommit={(value) => updateOption('switchCutoutWidth', value)}
                                {...SIZE_FIELD}
                            />
                            <OverrideField
                                label='Height'
                                value={options.switchCutoutHeight}
                                placeholder={switchDefaults.height}
                                unit='mm'
                                onCommit={(value) => updateOption('switchCutoutHeight', value)}
                                {...SIZE_FIELD}
                            />
                            <NumberField
                                label='Kerf'
                                value={options.kerf}
                                unit='mm'
                                onCommit={(value) => updateOption('kerf', value)}
                                {...KERF_FIELD}
                            />
                        </div>
                    </section>

                    <section className='flex flex-col gap-3'>
                        <SectionHeading>Stabilizer</SectionHeading>
                        <div className='flex flex-col gap-1.5'>
                            <Label className='text-xs font-normal text-muted-foreground'>Style</Label>
                            <Select value={options.stabilizer} onValueChange={(value) => updateOption('stabilizer', value as PlateStabilizer)}>
                                <SelectTrigger className='w-full'>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STABILIZER_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </section>

                    <section className='flex flex-col gap-3'>
                        <SectionHeading>Outline</SectionHeading>
                        <div className='grid grid-cols-2 gap-3'>
                            <NumberField
                                label='Edge margin X'
                                value={options.edgeMarginX}
                                unit='mm'
                                onCommit={(value) => updateOption('edgeMarginX', value)}
                                {...MARGIN_FIELD}
                            />
                            <NumberField
                                label='Edge margin Y'
                                value={options.edgeMarginY}
                                unit='mm'
                                onCommit={(value) => updateOption('edgeMarginY', value)}
                                {...MARGIN_FIELD}
                            />
                            <NumberField
                                label='Corner radius'
                                value={options.cornerRadius}
                                unit='mm'
                                onCommit={(value) => updateOption('cornerRadius', value)}
                                {...RADIUS_FIELD}
                            />
                        </div>
                    </section>

                    <section className='flex flex-col gap-3'>
                        <SectionHeading>Material</SectionHeading>
                        <div className='grid grid-cols-2 gap-3'>
                            <NumberField
                                label='Thickness'
                                value={options.thickness}
                                unit='mm'
                                onCommit={(value) => updateOption('thickness', value)}
                                {...THICKNESS_FIELD}
                            />
                        </div>
                    </section>

                    <Separator />

                    <section className='flex flex-col gap-3'>
                        <SectionHeading>Download</SectionHeading>
                        <div className='flex flex-col gap-2'>
                            <Button onClick={handleDownloadStl}>
                                <DownloadIcon />
                                plate.stl
                            </Button>
                            <Button variant='outline' size='sm' onClick={handleDownloadDxf}>
                                <DownloadIcon />
                                plate.dxf
                            </Button>
                            <Button variant='outline' size='sm' onClick={handleDownloadSvg}>
                                <DownloadIcon />
                                plate.svg
                            </Button>
                            <Button variant='outline' size='sm' onClick={handleDownloadJscad}>
                                <DownloadIcon />
                                plate.jscad
                            </Button>
                        </div>
                    </section>
                </CardContent>
            </Card>
        </div>
    )
}
