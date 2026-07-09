import type { FC } from 'react'
import type { KleKey } from '@entities/kle/types'
import { formatNumeric } from '@lib/kle-field'
import { NumberField } from './key-position-fields'

const ROTATION_STEP = 1
const ROTATION_MIN = -180
const ROTATION_MAX = 180
const ORIGIN_STEP = 0.25

type KeyRotationFieldsProps = {
    kleKey: KleKey
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

export const KeyRotationFields: FC<KeyRotationFieldsProps> = ({ kleKey, onUpdateSelected }) => {
    const update = (patch: Partial<KleKey>) => onUpdateSelected((key) => ({ ...key, ...patch }))

    return (
        <div className='grid grid-cols-3 gap-2'>
            <NumberField
                key={`angle-${formatNumeric(kleKey.rotationAngle)}`}
                label='Angle'
                value={kleKey.rotationAngle}
                step={ROTATION_STEP}
                min={ROTATION_MIN}
                max={ROTATION_MAX}
                onCommit={(value) => update({ rotationAngle: value })}
            />
            <NumberField
                key={`rx-${formatNumeric(kleKey.rotationX)}`}
                label='Origin X'
                value={kleKey.rotationX}
                step={ORIGIN_STEP}
                onCommit={(value) => update({ rotationX: value })}
            />
            <NumberField
                key={`ry-${formatNumeric(kleKey.rotationY)}`}
                label='Origin Y'
                value={kleKey.rotationY}
                step={ORIGIN_STEP}
                onCommit={(value) => update({ rotationY: value })}
            />
        </div>
    )
}
