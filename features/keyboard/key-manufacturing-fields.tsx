import type { FC } from 'react'
import type { KleKey } from '@entities/kle/types'
import { sharedValue } from '@lib/kle-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'

const ORIENTATION_OPTIONS = [0, 90, 180, 270]

const MANUFACTURING_FIELDS = [
    {
        id: 'switchRotation',
        label: 'Switch orientation',
        get: (key: KleKey) => key.switchRotation,
        set: (key: KleKey, value: number) => ({ ...key, switchRotation: value }),
    },
    {
        id: 'stabRotation',
        label: 'Stabilizer orientation',
        get: (key: KleKey) => key.stabRotation,
        set: (key: KleKey, value: number) => ({ ...key, stabRotation: value }),
    },
] as const

type KeyManufacturingFieldsProps = {
    selectedKeys: KleKey[]
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

export const KeyManufacturingFields: FC<KeyManufacturingFieldsProps> = ({ selectedKeys, onUpdateSelected }) => (
    <div className='grid grid-cols-2 gap-2'>
        {MANUFACTURING_FIELDS.map((field) => {
            const shared = sharedValue(selectedKeys.map(field.get))
            return (
                <label key={field.id} className='flex flex-col gap-1'>
                    <span className='text-2xs font-medium text-muted-foreground'>{field.label}</span>
                    <Select
                        value={shared === null ? '' : String(shared)}
                        onValueChange={(next) => onUpdateSelected((key) => field.set(key, Number(next)))}>
                        <SelectTrigger size='sm' className='h-7 w-full text-xs'>
                            <SelectValue placeholder='mixed' />
                        </SelectTrigger>
                        <SelectContent>
                            {ORIENTATION_OPTIONS.map((option) => (
                                <SelectItem key={option} value={String(option)} className='text-xs'>
                                    {option} deg
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </label>
            )
        })}
    </div>
)
