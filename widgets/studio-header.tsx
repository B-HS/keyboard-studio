'use client'

import { useRef, useState, type ChangeEvent, type FC } from 'react'
import { ChevronDown, Copy, Download, Link2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { formatKleJson } from '@entities/kle/format'
import { parseKleText } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { encodeShareFragment, SHARE_FRAGMENT_PREFIX } from '@entities/kle/share-link'
import { downloadTextFile } from '@lib/download'
import { Button } from '@ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/select'
import { Separator } from '@ui/separator'
import { ThemeChanger } from '@features/theme/theme-changer'

const LAYOUT_FILE_NAME = 'layout.json'
const LAYOUT_MIME_TYPE = 'application/json'

type StudioHeaderProps = {
    rawJson: string
    onLoadRaw: (nextJson: string) => void
}

export const StudioHeader: FC<StudioHeaderProps> = ({ rawJson, onLoadRaw }) => {
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [presetId, setPresetId] = useState('')

    const handleSelectPreset = (id: string) => {
        const preset = KLE_PRESETS.find((entry) => entry.id === id)
        if (!preset) return
        onLoadRaw(formatKleJson(preset.raw))
        setPresetId('')
        toast.success('Preset loaded', { description: preset.name })
    }

    const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const text = await file.text()
        onLoadRaw(text)
        toast.success('Layout imported', { description: file.name })
    }

    const handleDownloadJson = () => {
        downloadTextFile(LAYOUT_FILE_NAME, rawJson, LAYOUT_MIME_TYPE)
        toast.success('Downloaded', { description: LAYOUT_FILE_NAME })
    }

    const handleCopyJson = async () => {
        try {
            await navigator.clipboard.writeText(rawJson)
            toast.success('Copied JSON to clipboard')
        } catch {
            toast.error('Clipboard is unavailable')
        }
    }

    const handleCopyShareLink = async () => {
        const parsed = parseKleText(rawJson)
        if (!parsed.ok) {
            toast.error('Cannot share an invalid layout')
            return
        }
        const shareUrl = `${window.location.origin}${window.location.pathname}${SHARE_FRAGMENT_PREFIX}${encodeShareFragment(parsed.keyboard)}`
        try {
            await navigator.clipboard.writeText(shareUrl)
            toast.success('Copied share link to clipboard')
        } catch {
            toast.error('Clipboard is unavailable')
        }
    }

    return (
        <header className='flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4'>
            <div className='flex min-w-0 items-center'>
                <span className='truncate text-sm font-semibold tracking-tight'>Keyboard Studio</span>
            </div>

            <div className='flex shrink-0 items-center gap-2'>
                <Select value={presetId} onValueChange={handleSelectPreset}>
                    <SelectTrigger size='sm' className='w-36'>
                        <SelectValue placeholder='Load preset...' />
                    </SelectTrigger>
                    <SelectContent align='end'>
                        {KLE_PRESETS.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                                {preset.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <input ref={fileInputRef} type='file' accept='.json,application/json' className='hidden' onChange={handleImportFile} />
                <Button variant='outline' size='sm' onClick={() => fileInputRef.current?.click()}>
                    <Upload className='size-4' />
                    <span className='hidden sm:inline'>Import</span>
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant='outline' size='sm'>
                            <Download className='size-4' />
                            <span className='hidden sm:inline'>Export</span>
                            <ChevronDown className='size-3.5 text-muted-foreground' />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='min-w-52'>
                        <DropdownMenuItem onSelect={handleDownloadJson}>
                            <Download className='size-4' />
                            Download layout .json
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleCopyJson}>
                            <Copy className='size-4' />
                            Copy JSON to clipboard
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleCopyShareLink}>
                            <Link2 className='size-4' />
                            Copy share link
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Separator orientation='vertical' className='h-6' />
                <ThemeChanger />
            </div>
        </header>
    )
}
