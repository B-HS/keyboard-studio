import { useEffect, useState, type FC } from 'react'
import type { KleKey } from '@entities/kle/types'
import { normalizeHexColor, sharedValue } from '@lib/kle-field'
import { cn } from '@lib/utils'
import { Input } from '@ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'

const DEFAULT_PICKER_COLOR = '#000000'
const TEXT_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

type HexColorInputProps = {
    value: string
    placeholder?: string
    onCommit: (hex: string) => void
    className?: string
}

export const HexColorInput: FC<HexColorInputProps> = ({ value, placeholder, onCommit, className }) => {
    const [text, setText] = useState(value)
    const nativeValue = normalizeHexColor(value) ?? DEFAULT_PICKER_COLOR

    const commit = () => {
        const normalized = normalizeHexColor(text)
        if (!normalized) {
            setText(value)
            return
        }
        if (normalized !== value) onCommit(normalized)
    }

    useEffect(() => setText(value), [value])

    return (
        <div className={cn('flex items-center gap-1.5', className)}>
            <input
                type='color'
                value={nativeValue}
                aria-label='Color picker'
                onChange={(event) => onCommit(event.target.value)}
                className='h-7 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5'
            />
            <Input
                value={text}
                placeholder={placeholder}
                spellCheck={false}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                className='h-7 flex-1 px-2 font-mono text-xs'
            />
        </div>
    )
}

type KeyAppearanceFieldsProps = {
    selectedKeys: KleKey[]
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

export const KeyAppearanceFields: FC<KeyAppearanceFieldsProps> = ({ selectedKeys, onUpdateSelected }) => {
    const color = sharedValue(selectedKeys.map((key) => key.color))
    const defaultTextColor = sharedValue(selectedKeys.map((key) => key.defaults.textColor))
    const defaultTextSize = sharedValue(selectedKeys.map((key) => key.defaults.textSize))
    const profile = sharedValue(selectedKeys.map((key) => key.profile))

    const commitProfile = (raw: string) => {
        const next = raw.trim()
        if (next !== (profile ?? '')) onUpdateSelected((key) => ({ ...key, profile: next }))
    }

    return (
        <div className='flex flex-col gap-2'>
            <label className='flex flex-col gap-1'>
                <span className='text-2xs font-medium text-muted-foreground'>Key color</span>
                <HexColorInput
                    value={color ?? ''}
                    placeholder={color === null ? 'mixed' : undefined}
                    onCommit={(hex) => onUpdateSelected((key) => ({ ...key, color: hex }))}
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-2xs font-medium text-muted-foreground'>Default text color</span>
                <HexColorInput
                    value={defaultTextColor ?? ''}
                    placeholder={defaultTextColor === null ? 'mixed' : undefined}
                    onCommit={(hex) => onUpdateSelected((key) => ({ ...key, defaults: { ...key.defaults, textColor: hex } }))}
                />
            </label>
            <div className='grid grid-cols-2 gap-2'>
                <label className='flex flex-col gap-1'>
                    <span className='text-2xs font-medium text-muted-foreground'>Default text size</span>
                    <Select
                        value={defaultTextSize === null ? '' : String(defaultTextSize)}
                        onValueChange={(next) => onUpdateSelected((key) => ({ ...key, defaults: { ...key.defaults, textSize: Number(next) } }))}>
                        <SelectTrigger size='sm' className='h-7 w-full text-xs'>
                            <SelectValue placeholder='mixed' />
                        </SelectTrigger>
                        <SelectContent>
                            {TEXT_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)} className='text-xs'>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
                <label className='flex flex-col gap-1'>
                    <span className='text-2xs font-medium text-muted-foreground'>Profile</span>
                    <Input
                        key={profile ?? 'mixed'}
                        defaultValue={profile ?? ''}
                        placeholder={profile === null ? 'mixed' : 'e.g. DSA'}
                        spellCheck={false}
                        onBlur={(event) => commitProfile(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                        className='h-7 px-2 text-xs'
                    />
                </label>
            </div>
        </div>
    )
}
