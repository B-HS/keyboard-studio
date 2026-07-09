'use client'

import dynamic from 'next/dynamic'
import { Loader2, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@ui/button'

const ThemeToggle = () => {
    const { resolvedTheme, setTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    return (
        <Button
            variant='ghost'
            size='icon-sm'
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}>
            {isDark ? <Sun className='size-4' /> : <Moon className='size-4' />}
        </Button>
    )
}

const ThemeChangerFallback = () => (
    <Button variant='ghost' size='icon-sm' disabled aria-label='Loading theme toggle'>
        <Loader2 className='size-4 animate-spin' />
    </Button>
)

export const ThemeChanger = dynamic(() => Promise.resolve(ThemeToggle), {
    ssr: false,
    loading: () => <ThemeChangerFallback />,
})
