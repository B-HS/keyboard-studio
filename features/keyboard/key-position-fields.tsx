import { useState, type FC } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { isEncoderKey } from '@entities/kle/encoder'
import type { KleKey } from '@entities/kle/types'
import { clampToRange, formatNumeric, parseNumericInput } from '@lib/kle-field'
import { Button } from '@ui/button'
import { Input } from '@ui/input'

const SIZE_MIN = 0.25
const POSITION_STEP = 0.25

type NumberFieldProps = {
    label: string
    value: number
    step: number
    min?: number
    max?: number
    disabled?: boolean
    onCommit: (value: number) => void
}

export const NumberField: FC<NumberFieldProps> = ({ label, value, step, min, max, disabled, onCommit }) => {
    const [text, setText] = useState(formatNumeric(value))

    const commit = () => {
        const parsed = parseNumericInput(text)
        if (parsed === null) {
            setText(formatNumeric(value))
            return
        }
        const clamped = clampToRange(parsed, min, max)
        setText(formatNumeric(clamped))
        if (clamped !== value) onCommit(clamped)
    }

    return (
        <label className='flex flex-col gap-1'>
            <span className='text-2xs font-medium text-muted-foreground'>{label}</span>
            <Input
                value={text}
                inputMode='decimal'
                step={step}
                spellCheck={false}
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                className='h-7 px-2 text-xs tabular-nums'
            />
        </label>
    )
}

type KeyPositionFieldsProps = {
    kleKey: KleKey
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

export const KeyPositionFields: FC<KeyPositionFieldsProps> = ({ kleKey, onUpdateSelected }) => {
    const [showAdvanced, setShowAdvanced] = useState(false)

    const isEncoder = isEncoderKey(kleKey)
    const update = (patch: Partial<KleKey>) => onUpdateSelected((key) => ({ ...key, ...patch }))

    return (
        <div className='flex flex-col gap-2'>
            <div className='grid grid-cols-2 gap-2'>
                <NumberField
                    key={`x-${formatNumeric(kleKey.x)}`}
                    label='X'
                    value={kleKey.x}
                    step={POSITION_STEP}
                    onCommit={(value) => update({ x: value })}
                />
                <NumberField
                    key={`y-${formatNumeric(kleKey.y)}`}
                    label='Y'
                    value={kleKey.y}
                    step={POSITION_STEP}
                    onCommit={(value) => update({ y: value })}
                />
                <NumberField
                    key={`w-${formatNumeric(kleKey.width)}`}
                    label='Width'
                    value={kleKey.width}
                    step={POSITION_STEP}
                    min={SIZE_MIN}
                    onCommit={(value) => update({ width: value })}
                />
                <NumberField
                    key={`h-${formatNumeric(kleKey.height)}`}
                    label='Height'
                    value={kleKey.height}
                    step={POSITION_STEP}
                    min={SIZE_MIN}
                    disabled={isEncoder}
                    onCommit={(value) => update({ height: value })}
                />
            </div>
            <Button
                type='button'
                variant='ghost'
                size='xs'
                className='w-fit gap-1 px-1 text-2xs font-normal text-muted-foreground'
                onClick={() => setShowAdvanced((previous) => !previous)}>
                {showAdvanced ? <ChevronDownIcon /> : <ChevronRightIcon />}
                Advanced size
            </Button>
            {showAdvanced && (
                <div className='grid grid-cols-2 gap-2'>
                    <NumberField
                        key={`x2-${formatNumeric(kleKey.x2)}`}
                        label='X2'
                        value={kleKey.x2}
                        step={POSITION_STEP}
                        onCommit={(value) => update({ x2: value })}
                    />
                    <NumberField
                        key={`y2-${formatNumeric(kleKey.y2)}`}
                        label='Y2'
                        value={kleKey.y2}
                        step={POSITION_STEP}
                        onCommit={(value) => update({ y2: value })}
                    />
                    <NumberField
                        key={`w2-${formatNumeric(kleKey.width2)}`}
                        label='Width2'
                        value={kleKey.width2}
                        step={POSITION_STEP}
                        min={SIZE_MIN}
                        onCommit={(value) => update({ width2: value })}
                    />
                    <NumberField
                        key={`h2-${formatNumeric(kleKey.height2)}`}
                        label='Height2'
                        value={kleKey.height2}
                        step={POSITION_STEP}
                        min={SIZE_MIN}
                        onCommit={(value) => update({ height2: value })}
                    />
                </div>
            )}
        </div>
    )
}
