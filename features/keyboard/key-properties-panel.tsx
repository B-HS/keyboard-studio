'use client'

import type { FC, ReactNode } from 'react'
import type { KleKey } from '@entities/kle/types'
import { KeyAppearanceFields } from './key-appearance-fields'
import { KeyFlagsFields } from './key-flags-fields'
import { KeyLegendGrid } from './key-legend-grid'
import { KeyManufacturingFields } from './key-manufacturing-fields'
import { KeyPositionFields } from './key-position-fields'
import { KeyRotationFields } from './key-rotation-fields'

export type KeyPropertiesPanelProps = {
    selectedKeys: KleKey[]
    onUpdateSelected: (updater: (key: KleKey) => KleKey) => void
}

type PanelSectionProps = {
    title: string
    children: ReactNode
}

const PanelSection: FC<PanelSectionProps> = ({ title, children }) => (
    <section className='flex flex-col gap-2'>
        <h3 className='text-2xs font-semibold uppercase tracking-wide text-muted-foreground'>{title}</h3>
        {children}
    </section>
)

export const KeyPropertiesPanel: FC<KeyPropertiesPanelProps> = ({ selectedKeys, onUpdateSelected }) => {
    if (selectedKeys.length === 0) return null

    const singleKey = selectedKeys.length === 1 ? selectedKeys[0] : null

    return (
        <div className='flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3 text-xs'>
            {!singleKey && <div className='text-2xs font-medium text-muted-foreground'>{selectedKeys.length} keys selected</div>}
            {singleKey && (
                <PanelSection title='Position & size'>
                    <KeyPositionFields kleKey={singleKey} onUpdateSelected={onUpdateSelected} />
                </PanelSection>
            )}
            {singleKey && (
                <PanelSection title='Rotation'>
                    <KeyRotationFields kleKey={singleKey} onUpdateSelected={onUpdateSelected} />
                </PanelSection>
            )}
            {singleKey && (
                <PanelSection title='Legends'>
                    <KeyLegendGrid kleKey={singleKey} onUpdateSelected={onUpdateSelected} />
                </PanelSection>
            )}
            <PanelSection title='Appearance'>
                <KeyAppearanceFields selectedKeys={selectedKeys} onUpdateSelected={onUpdateSelected} />
            </PanelSection>
            <PanelSection title='Flags'>
                <KeyFlagsFields selectedKeys={selectedKeys} onUpdateSelected={onUpdateSelected} />
            </PanelSection>
            <PanelSection title='Manufacturing'>
                <KeyManufacturingFields selectedKeys={selectedKeys} onUpdateSelected={onUpdateSelected} />
            </PanelSection>
        </div>
    )
}
