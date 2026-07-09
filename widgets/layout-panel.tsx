'use client'

import { useState, type CSSProperties, type FC } from 'react'
import { ChevronDown, Copy, Move, Plus, Redo2, Trash2, Undo2, Wand2 } from 'lucide-react'
import { getKeyboardBoundsU, KEY_UNIT_MM } from '@entities/kle/geometry'
import { COLOR_THEMES, applyColorTheme } from '@entities/kle/themes'
import { addMatrixCoordinateLegends, mirrorKeys, moveKeysBy, removeAllLegends } from '@entities/kle/tools'
import type { KleKey, KleKeyboard } from '@entities/kle/types'
import { KeyboardCanvas } from '@features/keyboard/keyboard-canvas'
import { KeyPropertiesPanel } from '@features/keyboard/key-properties-panel'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@ui/dropdown-menu'
import { Input } from '@ui/input'
import { Label } from '@ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@ui/popover'
import { Separator } from '@ui/separator'
import { Switch } from '@ui/switch'

const DOT_BACKDROP_STYLE: CSSProperties = {
    backgroundImage: 'radial-gradient(color-mix(in oklab, var(--muted-foreground) 22%, transparent) 1px, transparent 1px)',
    backgroundSize: '16px 16px',
    backgroundPosition: '-1px -1px',
}

type LayoutPanelProps = {
    keyboard: KleKeyboard
    selectedIndices: number[]
    resetViewToken: number
    canUndo: boolean
    canRedo: boolean
    onSelectionChange: (indices: number[]) => void
    onApplyKeys: (nextKeys: KleKey[], nextSelection: number[]) => void
    onMoveSelection: (deltaX: number, deltaY: number) => void
    onResizeSelection: (deltaWidth: number, deltaHeight: number) => void
    onDeleteSelection: () => void
    onAddKey: () => void
    onDuplicate: () => void
    onCopySelection: () => void
    onCutSelection: () => void
    onPaste: () => void
    onUndo: () => void
    onRedo: () => void
}

export const LayoutPanel: FC<LayoutPanelProps> = ({
    keyboard,
    selectedIndices,
    resetViewToken,
    canUndo,
    canRedo,
    onSelectionChange,
    onApplyKeys,
    onMoveSelection,
    onResizeSelection,
    onDeleteSelection,
    onAddKey,
    onDuplicate,
    onCopySelection,
    onCutSelection,
    onPaste,
    onUndo,
    onRedo,
}) => {
    const [moveOpen, setMoveOpen] = useState(false)
    const [moveDeltaX, setMoveDeltaX] = useState('0')
    const [moveDeltaY, setMoveDeltaY] = useState('0')
    const [moveInMm, setMoveInMm] = useState(false)
    const [bulkColor, setBulkColor] = useState('#cccccc')

    const keyCount = keyboard.keys.length
    const selectionCount = selectedIndices.length
    const hasSelection = selectionCount > 0
    const selectedKeys = selectedIndices.map((index) => keyboard.keys[index]).filter((key): key is KleKey => Boolean(key))
    const bounds = getKeyboardBoundsU(keyboard.keys)

    const handleMatrixLegends = () => onApplyKeys(addMatrixCoordinateLegends(keyboard.keys), selectedIndices)

    const handleRemoveLegends = () =>
        onApplyKeys(removeAllLegends(keyboard.keys, hasSelection ? selectedIndices : null), hasSelection ? selectedIndices : [])

    const handleMirror = (axis: 'horizontal' | 'vertical') => {
        const mirrored = mirrorKeys(keyboard.keys, selectedIndices, axis)
        const nextSelection = mirrored.map((_, index) => index).slice(keyCount)
        onApplyKeys(mirrored, nextSelection)
    }

    const handleMoveExactly = () => {
        const rawX = Number.parseFloat(moveDeltaX)
        const rawY = Number.parseFloat(moveDeltaY)
        const deltaX = Number.isFinite(rawX) ? (moveInMm ? rawX / KEY_UNIT_MM : rawX) : 0
        const deltaY = Number.isFinite(rawY) ? (moveInMm ? rawY / KEY_UNIT_MM : rawY) : 0
        onApplyKeys(moveKeysBy(keyboard.keys, selectedIndices, deltaX, deltaY), selectedIndices)
        setMoveOpen(false)
    }

    const handleUpdateSelected = (updater: (key: KleKey) => KleKey) => {
        const selected = new Set(selectedIndices)
        onApplyKeys(
            keyboard.keys.map((key, index) => (selected.has(index) ? updater(key) : key)),
            selectedIndices,
        )
    }

    const handleApplyBulkColor = () => {
        const selected = new Set(selectedIndices)
        onApplyKeys(
            keyboard.keys.map((key, index) => (selected.has(index) ? { ...key, color: bulkColor } : key)),
            selectedIndices,
        )
    }

    const selectionBounds = getKeyboardBoundsU(selectedKeys)

    return (
        <div className='flex h-full min-h-0 flex-col gap-4 p-4'>
            <div className='flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5'>
                <Button variant='ghost' size='sm' onClick={onAddKey}>
                    <Plus className='size-4' />
                    Add key
                </Button>
                <Button variant='ghost' size='sm' disabled={!hasSelection} onClick={onDuplicate}>
                    <Copy className='size-4' />
                    Duplicate
                </Button>
                <Button variant='ghost' size='sm' disabled={!hasSelection} onClick={onDeleteSelection}>
                    <Trash2 className='size-4' />
                    Delete
                </Button>

                <Separator orientation='vertical' className='mx-1 h-5' />

                <Button variant='ghost' size='icon-sm' disabled={!canUndo} onClick={onUndo} aria-label='Undo'>
                    <Undo2 className='size-4' />
                </Button>
                <Button variant='ghost' size='icon-sm' disabled={!canRedo} onClick={onRedo} aria-label='Redo'>
                    <Redo2 className='size-4' />
                </Button>

                <Separator orientation='vertical' className='mx-1 h-5' />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='sm'>
                            <Wand2 className='size-4' />
                            Tools
                            <ChevronDown className='size-3.5 text-muted-foreground' />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='start' className='min-w-56'>
                        <DropdownMenuItem onSelect={handleMatrixLegends}>Add matrix coordinates as legends</DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleRemoveLegends}>
                            Remove all legends {hasSelection ? '(selection)' : '(all)'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={!hasSelection} onSelect={() => handleMirror('horizontal')}>
                            Mirror horizontal
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!hasSelection} onSelect={() => handleMirror('vertical')}>
                            Mirror vertical
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Apply color theme</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className='min-w-44'>
                                {COLOR_THEMES.map((theme) => (
                                    <DropdownMenuItem
                                        key={theme.id}
                                        onSelect={() => onApplyKeys(applyColorTheme(keyboard.keys, theme), selectedIndices)}>
                                        <span>{theme.name}</span>
                                        <span className='ml-auto flex items-center gap-0.5'>
                                            {[theme.alpha.cap, theme.modifier.cap, theme.accent.cap].map((swatch, index) => (
                                                <span
                                                    key={index}
                                                    className='size-3 rounded-[3px] border border-border/60'
                                                    style={{ backgroundColor: swatch }}
                                                />
                                            ))}
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                    <PopoverTrigger asChild>
                        <Button variant='ghost' size='sm' disabled={!hasSelection}>
                            <Move className='size-4' />
                            Move
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align='start' className='w-64 space-y-3'>
                        <p className='text-xs font-medium text-foreground'>Move selection</p>
                        <div className='grid grid-cols-2 gap-2'>
                            <div className='space-y-1'>
                                <Label htmlFor='move-dx' className='text-2xs text-muted-foreground'>
                                    dx {moveInMm ? 'mm' : 'u'}
                                </Label>
                                <Input id='move-dx' inputMode='decimal' value={moveDeltaX} onChange={(event) => setMoveDeltaX(event.target.value)} />
                            </div>
                            <div className='space-y-1'>
                                <Label htmlFor='move-dy' className='text-2xs text-muted-foreground'>
                                    dy {moveInMm ? 'mm' : 'u'}
                                </Label>
                                <Input id='move-dy' inputMode='decimal' value={moveDeltaY} onChange={(event) => setMoveDeltaY(event.target.value)} />
                            </div>
                        </div>
                        <div className='flex items-center justify-between'>
                            <Label htmlFor='move-mm' className='text-2xs text-muted-foreground'>
                                Values in millimeters
                            </Label>
                            <Switch id='move-mm' checked={moveInMm} onCheckedChange={setMoveInMm} />
                        </div>
                        <Button size='sm' className='w-full' onClick={handleMoveExactly}>
                            Apply
                        </Button>
                    </PopoverContent>
                </Popover>

                <div className='ml-auto'>
                    {hasSelection ? <Badge variant='default'>{selectionCount} selected</Badge> : <Badge variant='secondary'>{keyCount} keys</Badge>}
                </div>
            </div>

            <div className='relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30' style={DOT_BACKDROP_STYLE}>
                <KeyboardCanvas
                    keyboard={keyboard}
                    selectedIndices={selectedIndices}
                    resetViewToken={resetViewToken}
                    onSelectionChange={onSelectionChange}
                    onMoveSelection={onMoveSelection}
                    onResizeSelection={onResizeSelection}
                    onDeleteSelection={onDeleteSelection}
                    onAddKey={onAddKey}
                    onCopySelection={onCopySelection}
                    onCutSelection={onCutSelection}
                    onPaste={onPaste}
                    className='absolute inset-0 bg-transparent'
                />
                <div className='pointer-events-none absolute right-2 top-2 rounded-md border border-border/60 bg-background/70 px-2 py-1 text-2xs text-muted-foreground backdrop-blur-sm'>
                    drag to select · space or middle-drag to pan · scroll to zoom
                </div>
            </div>

            <div className='max-h-80 shrink-0 overflow-y-auto'>
                {selectionCount === 1 ? (
                    <KeyPropertiesPanel selectedKeys={selectedKeys} onUpdateSelected={handleUpdateSelected} />
                ) : selectionCount > 1 ? (
                    <div className='flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2 text-2xs text-muted-foreground'>
                        <span className='font-sans font-medium uppercase tracking-wide text-foreground/60'>{selectionCount} keys</span>
                        <span className='font-mono'>
                            {selectionBounds.width.toFixed(2)} × {selectionBounds.height.toFixed(2)} u
                        </span>
                        <span className='ml-auto flex items-center gap-2'>
                            <Label htmlFor='bulk-color' className='text-2xs text-muted-foreground'>
                                Cap color
                            </Label>
                            <input
                                id='bulk-color'
                                type='color'
                                value={bulkColor}
                                onChange={(event) => setBulkColor(event.target.value)}
                                className='size-7 cursor-pointer rounded-md border border-border bg-transparent p-0.5'
                            />
                            <Button size='xs' variant='outline' onClick={handleApplyBulkColor}>
                                Apply
                            </Button>
                        </span>
                    </div>
                ) : (
                    <div className='flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-2xs text-muted-foreground'>
                        <span className='font-sans font-medium uppercase tracking-wide text-foreground/60'>Layout</span>
                        <span className='text-foreground'>{keyCount} keys</span>
                        <span>
                            {bounds.width.toFixed(2)} × {bounds.height.toFixed(2)} u
                        </span>
                        <span>
                            {(bounds.width * KEY_UNIT_MM).toFixed(1)} × {(bounds.height * KEY_UNIT_MM).toFixed(1)} mm
                        </span>
                        <span className='ml-auto font-sans'>Click a key or drag to select</span>
                    </div>
                )}
            </div>
        </div>
    )
}
