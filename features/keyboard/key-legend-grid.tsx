import type { FC } from 'react'
import type { KleKey } from '@entities/kle/types'
import { setLabelSlot } from '@lib/kle-field'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'
import { HexColorInput } from './key-appearance-fields'

const TOP_FACE_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
const FRONT_FACE_SLOTS = [9, 10, 11]
const SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const INHERIT_VALUE = 'inherit'

type LegendCellProps = {
    kleKey: KleKey
    slot: number
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

const LegendCell: FC<LegendCellProps> = ({ kleKey, slot, onUpdateSelected }) => {
    const label = kleKey.labels[slot] ?? ''
    const slotColor = kleKey.textColor[slot] ?? null
    const slotSize = kleKey.textSize[slot] ?? null
    const effectiveColor = slotColor ?? kleKey.defaults.textColor

    const commitLabel = (raw: string) => {
        const next = raw === '' ? null : raw
        if (next !== (kleKey.labels[slot] ?? null)) onUpdateSelected((key) => ({ ...key, labels: setLabelSlot(key.labels, slot, next) }))
    }

    return (
        <div className='flex flex-col gap-1 rounded-md border border-input/60 bg-background/40 p-1'>
            <Input
                key={label}
                defaultValue={label}
                spellCheck={false}
                aria-label={`Legend ${slot}`}
                onBlur={(event) => commitLabel(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                className='h-7 px-1 text-center text-xs'
            />
            <div className='flex items-center gap-1'>
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type='button'
                            aria-label={`Legend ${slot} color`}
                            className='size-6 shrink-0 rounded-[4px] border border-border'
                            style={{ backgroundColor: effectiveColor }}
                        />
                    </PopoverTrigger>
                    <PopoverContent align='start' className='flex w-52 flex-col gap-2'>
                        <HexColorInput
                            value={effectiveColor}
                            onCommit={(hex) => onUpdateSelected((key) => ({ ...key, textColor: setLabelSlot(key.textColor, slot, hex) }))}
                        />
                        {slotColor !== null && (
                            <Button
                                type='button'
                                variant='ghost'
                                size='xs'
                                className='w-full text-2xs font-normal text-muted-foreground'
                                onClick={() => onUpdateSelected((key) => ({ ...key, textColor: setLabelSlot(key.textColor, slot, null) }))}>
                                Reset to default
                            </Button>
                        )}
                    </PopoverContent>
                </Popover>
                <Select
                    value={slotSize === null ? INHERIT_VALUE : String(slotSize)}
                    onValueChange={(next) =>
                        onUpdateSelected((key) => ({
                            ...key,
                            textSize: setLabelSlot(key.textSize, slot, next === INHERIT_VALUE ? null : Number(next)),
                        }))
                    }>
                    <SelectTrigger size='sm' className='h-6 flex-1 gap-0.5 px-1.5 text-2xs [&_svg]:size-3'>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={INHERIT_VALUE} className='text-xs'>
                            Auto
                        </SelectItem>
                        {SIZE_OPTIONS.map((size) => (
                            <SelectItem key={size} value={String(size)} className='text-xs'>
                                {size}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}

type KeyLegendGridProps = {
    kleKey: KleKey
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

export const KeyLegendGrid: FC<KeyLegendGridProps> = ({ kleKey, onUpdateSelected }) => {
    const clearFace = (slots: number[]) =>
        onUpdateSelected((key) => {
            let labels = key.labels
            let textColor = key.textColor
            let textSize = key.textSize
            for (const slot of slots) {
                labels = setLabelSlot(labels, slot, null)
                textColor = setLabelSlot(textColor, slot, null)
                textSize = setLabelSlot(textSize, slot, null)
            }
            return { ...key, labels, textColor, textSize }
        })

    return (
        <div className='flex flex-col gap-3'>
            <div className='flex flex-col gap-2'>
                <div className='flex items-center justify-between'>
                    <span className='text-2xs font-medium text-muted-foreground'>Top face</span>
                    <Button
                        type='button'
                        variant='ghost'
                        size='xs'
                        className='px-1 text-2xs font-normal text-muted-foreground'
                        onClick={() => clearFace(TOP_FACE_SLOTS)}>
                        Clear all
                    </Button>
                </div>
                <div className='grid grid-cols-3 gap-1.5'>
                    {TOP_FACE_SLOTS.map((slot) => (
                        <LegendCell key={slot} kleKey={kleKey} slot={slot} onUpdateSelected={onUpdateSelected} />
                    ))}
                </div>
            </div>
            <div className='flex flex-col gap-2'>
                <div className='flex items-center justify-between'>
                    <span className='text-2xs font-medium text-muted-foreground'>Front face</span>
                    <Button
                        type='button'
                        variant='ghost'
                        size='xs'
                        className='px-1 text-2xs font-normal text-muted-foreground'
                        onClick={() => clearFace(FRONT_FACE_SLOTS)}>
                        Clear all
                    </Button>
                </div>
                <div className='grid grid-cols-3 gap-1.5'>
                    {FRONT_FACE_SLOTS.map((slot) => (
                        <LegendCell key={slot} kleKey={kleKey} slot={slot} onUpdateSelected={onUpdateSelected} />
                    ))}
                </div>
            </div>
        </div>
    )
}
