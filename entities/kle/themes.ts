import type { KleKey } from './types'

export type ColorTheme = {
    id: string
    name: string
    alpha: { cap: string; text: string }
    modifier: { cap: string; text: string }
    accent: { cap: string; text: string }
}

export const COLOR_THEMES: ColorTheme[] = [
    {
        id: 'graphite',
        name: 'Graphite',
        alpha: { cap: '#3a3f44', text: '#e8eaed' },
        modifier: { cap: '#26292d', text: '#c3c7cc' },
        accent: { cap: '#d98c3f', text: '#1b1d20' },
    },
    {
        id: 'cream',
        name: 'Cream',
        alpha: { cap: '#f4ecdf', text: '#40382c' },
        modifier: { cap: '#d9cdb4', text: '#40382c' },
        accent: { cap: '#c05f4b', text: '#f8f2e8' },
    },
    {
        id: 'navy',
        name: 'Navy',
        alpha: { cap: '#33507a', text: '#eef2f8' },
        modifier: { cap: '#22354f', text: '#cdd7e6' },
        accent: { cap: '#e2b24a', text: '#16233a' },
    },
    {
        id: 'olive',
        name: 'Olive',
        alpha: { cap: '#6b7250', text: '#f3f4ea' },
        modifier: { cap: '#4c5238', text: '#dfe2cf' },
        accent: { cap: '#c96f3a', text: '#f3f4ea' },
    },
    {
        id: 'blossom',
        name: 'Blossom',
        alpha: { cap: '#f2d4de', text: '#4a2f3a' },
        modifier: { cap: '#d99bb0', text: '#40222c' },
        accent: { cap: '#5b7d8c', text: '#f5e8ed' },
    },
    {
        id: 'terminal',
        name: 'Terminal',
        alpha: { cap: '#1b1b1b', text: '#33ff66' },
        modifier: { cap: '#101010', text: '#22cc55' },
        accent: { cap: '#33ff66', text: '#101010' },
    },
]

const ACCENT_LEGENDS = new Set(['esc', 'enter'])

const primaryLegend = (key: KleKey) => {
    for (const label of key.labels) {
        if (label != null) return label
    }
    return null
}

const classifyKey = (key: KleKey) => {
    const trimmed = primaryLegend(key)?.trim() ?? ''
    if (ACCENT_LEGENDS.has(trimmed.toLowerCase())) return 'accent'
    if (trimmed.length === 1) return 'alpha'
    return 'modifier'
}

export const applyColorTheme = (keys: KleKey[], theme: ColorTheme): KleKey[] =>
    keys.map((key) => {
        if (key.decal || key.ghost) return key
        const swatch = theme[classifyKey(key)]
        return {
            ...key,
            color: swatch.cap,
            labels: [...key.labels],
            textColor: [...key.textColor],
            textSize: [...key.textSize],
            defaults: { ...key.defaults, textColor: swatch.text },
        }
    })
