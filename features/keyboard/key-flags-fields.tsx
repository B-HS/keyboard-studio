import type { FC } from 'react'
import { ROTARY_ENCODER_SM } from '@entities/kle/encoder'
import type { KleKey } from '@entities/kle/types'
import { sharedValue } from '@lib/kle-field'
import { Label } from '@ui/label'
import { Switch } from '@ui/switch'

const FLAG_FIELDS = [
    { id: 'ghost', label: 'Ghost', get: (key: KleKey) => key.ghost, set: (key: KleKey, value: boolean) => ({ ...key, ghost: value }) },
    { id: 'stepped', label: 'Stepped', get: (key: KleKey) => key.stepped, set: (key: KleKey, value: boolean) => ({ ...key, stepped: value }) },
    { id: 'nub', label: 'Homing nub', get: (key: KleKey) => key.nub, set: (key: KleKey, value: boolean) => ({ ...key, nub: value }) },
    { id: 'decal', label: 'Decal', get: (key: KleKey) => key.decal, set: (key: KleKey, value: boolean) => ({ ...key, decal: value }) },
    {
        id: 'encoder',
        label: 'Rotary encoder',
        get: (key: KleKey) => key.sm === ROTARY_ENCODER_SM,
        set: (key: KleKey, value: boolean) => ({ ...key, sm: value ? ROTARY_ENCODER_SM : '' }),
    },
] as const

type KeyFlagsFieldsProps = {
    selectedKeys: KleKey[]
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

export const KeyFlagsFields: FC<KeyFlagsFieldsProps> = ({ selectedKeys, onUpdateSelected }) => (
    <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
        {FLAG_FIELDS.map((field) => {
            const shared = sharedValue(selectedKeys.map(field.get))
            return (
                <div key={field.id} className='flex items-center justify-between gap-2'>
                    <Label className='gap-1.5 text-xs font-normal'>
                        {field.label}
                        {shared === null && <span className='text-2xs text-muted-foreground'>mixed</span>}
                    </Label>
                    <Switch size='sm' checked={shared === true} onCheckedChange={(next) => onUpdateSelected((key) => field.set(key, next))} />
                </div>
            )
        })}
    </div>
)
