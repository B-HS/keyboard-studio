'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { formatKleJson, tryParseKleRows } from '@entities/kle/format'
import { getKeyboardBoundsU, KEY_UNIT_MM } from '@entities/kle/geometry'
import { parseKle, parseKleText } from '@entities/kle/parse'
import { KLE_PRESETS } from '@entities/kle/presets'
import { serializeKle, sortKleKeys } from '@entities/kle/serialize'
import { decodeShareFragment, SHARE_FRAGMENT_PREFIX } from '@entities/kle/share-link'
import type { KleKey, KleKeyboard, KleMetadata } from '@entities/kle/types'
import { getUsableKeys } from '@entities/plate/generate'
import { assignMatrix } from '@entities/pcb/matrix'
import { useDebounce } from '@lib/hooks/use-debounce'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/tabs'
import { BuildPanel } from '@widgets/build-panel'
import { JsonEditorPanel } from '@widgets/json-editor-panel'
import { LayoutPanel } from '@widgets/layout-panel'
import { PcbPanel } from '@widgets/pcb-panel'
import { PlatePanel } from '@widgets/plate-panel'
import { StudioHeader } from '@widgets/studio-header'

const PARSE_DEBOUNCE_MS = 250
const NARROW_VIEWPORT_QUERY = '(max-width: 1023px)'
const EDITOR_SIZE_WIDE = 32
const EDITOR_SIZE_NARROW = 40
const EDITOR_MIN_WIDE = 24
const EDITOR_MIN_NARROW = 25
const HISTORY_LIMIT = 100
const MIN_KEY_SIZE_U = 0.25
const CLIPBOARD_OFFSET_U = 0.25
const LABEL_COUNT = 12

const STUDIO_TABS = [
    { value: 'keyboard', label: 'Keyboard' },
    { value: 'plate', label: 'Plate' },
    { value: 'pcb', label: 'PCB' },
    { value: 'build', label: 'Build' },
] as const

type StudioTab = (typeof STUDIO_TABS)[number]['value']

const ANSI_60_PRESET = KLE_PRESETS.find((preset) => preset.id === 'ansi-60') ?? KLE_PRESETS[0]
const INITIAL_JSON = formatKleJson(ANSI_60_PRESET.raw)

const DEFAULT_META: KleMetadata = {
    author: '',
    backcolor: '#eeeeee',
    background: null,
    name: '',
    notes: '',
    radii: '',
    switchBrand: '',
    switchMount: '',
    switchType: '',
}

const emptyLabelSlots = () => new Array(LABEL_COUNT).fill(null)

const cloneKey = (key: KleKey): KleKey => ({
    ...key,
    labels: [...key.labels],
    textColor: [...key.textColor],
    textSize: [...key.textSize],
    defaults: { ...key.defaults },
})

const offsetKey = (key: KleKey, deltaX: number, deltaY: number): KleKey => ({
    ...key,
    x: key.x + deltaX,
    y: key.y + deltaY,
    rotationX: key.rotationAngle !== 0 ? key.rotationX + deltaX : key.rotationX,
    rotationY: key.rotationAngle !== 0 ? key.rotationY + deltaY : key.rotationY,
})

const translateSelection = (keys: KleKey[], indices: number[], deltaX: number, deltaY: number) => {
    const selected = new Set(indices)
    return keys.map((key, index) => (selected.has(index) ? offsetKey(key, deltaX, deltaY) : key))
}

const resizeSelection = (keys: KleKey[], indices: number[], deltaWidth: number, deltaHeight: number) => {
    const selected = new Set(indices)
    return keys.map((key, index) => {
        if (!selected.has(index)) return key
        const width = Math.max(MIN_KEY_SIZE_U, key.width + deltaWidth)
        const height = Math.max(MIN_KEY_SIZE_U, key.height + deltaHeight)
        return {
            ...key,
            width,
            height,
            width2: key.width2 === key.width ? width : key.width2,
            height2: key.height2 === key.height ? height : key.height2,
        }
    })
}

const makeInheritedKey = (anchor: KleKey): KleKey => ({
    ...cloneKey(anchor),
    x: anchor.x + anchor.width,
    width: 1,
    height: 1,
    x2: 0,
    y2: 0,
    width2: 1,
    height2: 1,
    labels: emptyLabelSlots(),
    textColor: emptyLabelSlots(),
    textSize: emptyLabelSlots(),
    decal: false,
    stepped: false,
    nub: false,
})

const makeDefaultKey = (): KleKey => ({
    color: '#cccccc',
    labels: emptyLabelSlots(),
    textColor: emptyLabelSlots(),
    textSize: emptyLabelSlots(),
    defaults: { textColor: '#000000', textSize: 3 },
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    x2: 0,
    y2: 0,
    width2: 1,
    height2: 1,
    rotationX: 0,
    rotationY: 0,
    rotationAngle: 0,
    decal: false,
    ghost: false,
    stepped: false,
    nub: false,
    profile: '',
    sm: '',
    sb: '',
    st: '',
    switchRotation: 0,
    stabRotation: 0,
})

const parseFragmentKeys = (text: string) => {
    const rows = tryParseKleRows(text)
    if (!rows) return null
    const attempt = (data: unknown[]) => {
        try {
            return parseKle(data).keys
        } catch {
            return null
        }
    }
    return attempt(rows) ?? attempt([rows])
}

const parseInitialKeyboard = () => {
    const result = parseKleText(INITIAL_JSON)
    return result.ok ? result.keyboard : null
}

const describeTabStats = (tab: StudioTab, keyboard: KleKeyboard | null) => {
    if (!keyboard) return ''
    const bounds = getKeyboardBoundsU(keyboard.keys)
    const keyCount = keyboard.keys.length
    if (tab === 'plate') {
        const cutouts = getUsableKeys(keyboard.keys).length
        return `${cutouts} cutouts · ${(bounds.width * KEY_UNIT_MM).toFixed(1)} × ${(bounds.height * KEY_UNIT_MM).toFixed(1)} mm`
    }
    if (tab === 'pcb') {
        const matrix = assignMatrix(keyboard.keys)
        return `${matrix.rows} × ${matrix.cols} matrix · ${keyCount} keys`
    }
    if (tab === 'build') {
        const matrix = assignMatrix(keyboard.keys)
        return `${keyCount} keys · ${matrix.rows} × ${matrix.cols} matrix`
    }
    return `${keyCount} keys · ${bounds.width.toFixed(2)} × ${bounds.height.toFixed(2)} u`
}

const WaitingState = () => <div className='flex h-full items-center justify-center text-2xs text-muted-foreground'>Waiting for a valid layout</div>

export const KeebStudio = () => {
    const rawJsonRef = useRef(INITIAL_JSON)
    const keyboardRef = useRef<KleKeyboard | null>(parseInitialKeyboard())
    const selectedIndicesRef = useRef<number[]>([])
    const undoStackRef = useRef<string[]>([])
    const redoStackRef = useRef<string[]>([])

    const [rawJson, setRawJson] = useState(INITIAL_JSON)
    const [selectedIndices, setSelectedIndices] = useState<number[]>([])
    const [activeTab, setActiveTab] = useState<StudioTab>('keyboard')
    const [keyboard, setKeyboard] = useState<KleKeyboard | null>(keyboardRef.current)
    const [error, setError] = useState<string | null>(null)
    const [isNarrow, setIsNarrow] = useState(false)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const [viewResetToken, setViewResetToken] = useState(0)

    const debouncedJson = useDebounce(rawJson, PARSE_DEBOUNCE_MS)
    const orientation = isNarrow ? 'vertical' : 'horizontal'
    const editorSize = isNarrow ? EDITOR_SIZE_NARROW : EDITOR_SIZE_WIDE
    const editorMinSize = isNarrow ? EDITOR_MIN_NARROW : EDITOR_MIN_WIDE
    const quickStats = describeTabStats(activeTab, keyboard)

    const commitRawText = (text: string) => {
        rawJsonRef.current = text
        setRawJson(text)
    }

    const commitKeyboard = (next: KleKeyboard) => {
        keyboardRef.current = next
        setKeyboard(next)
    }

    const commitSelection = (indices: number[]) => {
        selectedIndicesRef.current = indices
        setSelectedIndices(indices)
    }

    const syncHistoryFlags = () => {
        setCanUndo(undoStackRef.current.length > 0)
        setCanRedo(redoStackRef.current.length > 0)
    }

    const pushHistory = () => {
        undoStackRef.current.push(rawJsonRef.current)
        if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift()
        redoStackRef.current = []
        syncHistoryFlags()
    }

    const applyKeysEdit = (nextKeys: KleKey[], nextSelection: number[]) => {
        const current = keyboardRef.current
        if (!current) return
        const rows = serializeKle({ meta: current.meta, keys: nextKeys })
        const parsed = parseKle(rows)
        const positionByKey = new Map<KleKey, number>()
        sortKleKeys(nextKeys).forEach((key, index) => positionByKey.set(key, index))
        const reconciled = nextSelection
            .map((index) => positionByKey.get(nextKeys[index]))
            .filter((value): value is number => value !== undefined)
            .sort((left, right) => left - right)
        pushHistory()
        commitRawText(formatKleJson(rows))
        commitKeyboard(parsed)
        commitSelection(reconciled)
        setError(null)
    }

    const applyMetaEdit = (meta: KleMetadata) => {
        const current = keyboardRef.current
        if (!current) return
        const rows = serializeKle({ meta, keys: current.keys })
        pushHistory()
        commitRawText(formatKleJson(rows))
        commitKeyboard(parseKle(rows))
        setError(null)
    }

    const bumpViewReset = () => setViewResetToken((token) => token + 1)

    const restoreSnapshot = (text: string) => {
        commitRawText(text)
        commitSelection([])
        bumpViewReset()
        const parsed = parseKleText(text)
        if (parsed.ok) {
            commitKeyboard(parsed.keyboard)
            setError(null)
            return
        }
        setError(parsed.error)
    }

    const undo = () => {
        const previous = undoStackRef.current.pop()
        if (previous === undefined) return
        redoStackRef.current.push(rawJsonRef.current)
        restoreSnapshot(previous)
        syncHistoryFlags()
    }

    const redo = () => {
        const next = redoStackRef.current.pop()
        if (next === undefined) return
        undoStackRef.current.push(rawJsonRef.current)
        restoreSnapshot(next)
        syncHistoryFlags()
    }

    const handleLoadRaw = (nextJson: string) => {
        pushHistory()
        commitRawText(nextJson)
        commitSelection([])
        bumpViewReset()
        const parsed = parseKleText(nextJson)
        if (parsed.ok) {
            commitKeyboard(parsed.keyboard)
            setError(null)
            return
        }
        setError(parsed.error)
    }

    const handleEditorChange = (next: string) => commitRawText(next)

    const handleSelectionChange = (indices: number[]) => commitSelection(indices)

    const handleMoveSelection = (deltaX: number, deltaY: number) => {
        const current = keyboardRef.current
        const selection = selectedIndicesRef.current
        if (!current || selection.length === 0 || (deltaX === 0 && deltaY === 0)) return
        applyKeysEdit(translateSelection(current.keys, selection, deltaX, deltaY), selection)
    }

    const handleResizeSelection = (deltaWidth: number, deltaHeight: number) => {
        const current = keyboardRef.current
        const selection = selectedIndicesRef.current
        if (!current || selection.length === 0) return
        applyKeysEdit(resizeSelection(current.keys, selection, deltaWidth, deltaHeight), selection)
    }

    const handleDeleteSelection = () => {
        const current = keyboardRef.current
        const selection = selectedIndicesRef.current
        if (!current || selection.length === 0) return
        const selected = new Set(selection)
        applyKeysEdit(
            current.keys.filter((_, index) => !selected.has(index)),
            [],
        )
    }

    const handleAddKey = () => {
        const current = keyboardRef.current
        if (!current) return
        const selection = selectedIndicesRef.current
        const anchorIndex = selection.length > 0 ? selection[selection.length - 1] : current.keys.length - 1
        const anchor = current.keys[anchorIndex]
        const nextKeys = [...current.keys, anchor ? makeInheritedKey(anchor) : makeDefaultKey()]
        applyKeysEdit(nextKeys, [nextKeys.length - 1])
    }

    const handleDuplicateSelection = () => {
        const current = keyboardRef.current
        const selection = selectedIndicesRef.current
        if (!current || selection.length === 0) return
        const copies = selection.map((index) => offsetKey(cloneKey(current.keys[index]), CLIPBOARD_OFFSET_U, CLIPBOARD_OFFSET_U))
        const nextKeys = [...current.keys, ...copies]
        applyKeysEdit(
            nextKeys,
            copies.map((_, index) => current.keys.length + index),
        )
    }

    const handleCopySelection = () => {
        const current = keyboardRef.current
        const selection = selectedIndicesRef.current
        if (!current || selection.length === 0) return
        const keys = selection.map((index) => current.keys[index])
        const text = formatKleJson(serializeKle({ meta: DEFAULT_META, keys }))
        navigator.clipboard
            .writeText(text)
            .then(() => toast.success(`Copied ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`))
            .catch(() => toast.error('Clipboard is unavailable'))
    }

    const handleCutSelection = () => {
        handleCopySelection()
        handleDeleteSelection()
    }

    const handlePaste = () => {
        navigator.clipboard
            .readText()
            .then((text) => {
                const current = keyboardRef.current
                if (!current) return
                const pasted = parseFragmentKeys(text)
                if (!pasted || pasted.length === 0) {
                    toast.error('Clipboard has no keys to paste')
                    return
                }
                const offsetKeys = pasted.map((key) => offsetKey(key, CLIPBOARD_OFFSET_U, CLIPBOARD_OFFSET_U))
                const nextKeys = [...current.keys, ...offsetKeys]
                applyKeysEdit(
                    nextKeys,
                    offsetKeys.map((_, index) => current.keys.length + index),
                )
            })
            .catch(() => toast.error('Clipboard is unavailable'))
    }

    useEffect(() => {
        const result = parseKleText(debouncedJson)
        if (!result.ok) {
            setError(result.error)
            return
        }
        commitKeyboard(result.keyboard)
        setError(null)
        const clamped = selectedIndicesRef.current.filter((index) => index < result.keyboard.keys.length)
        if (clamped.length !== selectedIndicesRef.current.length) commitSelection(clamped)
    }, [debouncedJson])

    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey)) return
            const active = document.activeElement
            if (active instanceof HTMLElement && (active.isContentEditable || active.closest('.cm-editor'))) return
            if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
            const key = event.key.toLowerCase()
            if (key === 'z') {
                event.preventDefault()
                if (event.shiftKey) redo()
                else undo()
                return
            }
            if (key === 'y') {
                event.preventDefault()
                redo()
            }
        }
        window.addEventListener('keydown', handleGlobalKeyDown)
        return () => window.removeEventListener('keydown', handleGlobalKeyDown)
    }, [])

    useEffect(() => {
        const query = window.matchMedia(NARROW_VIEWPORT_QUERY)
        const sync = () => setIsNarrow(query.matches)
        sync()
        query.addEventListener('change', sync)
        return () => query.removeEventListener('change', sync)
    }, [])

    useEffect(() => {
        const { hash, pathname, search } = window.location
        if (!hash.startsWith(SHARE_FRAGMENT_PREFIX)) return
        window.history.replaceState(null, '', `${pathname}${search}`)
        const decoded = decodeShareFragment(hash.slice(SHARE_FRAGMENT_PREFIX.length))
        if (!decoded.ok) {
            toast.error('Share link could not be loaded', { description: decoded.error })
            return
        }
        restoreSnapshot(formatKleJson(serializeKle(decoded.keyboard)))
        toast.success('Layout loaded from share link')
    }, [])

    return (
        <div className='flex h-dvh flex-col overflow-hidden bg-background text-foreground'>
            <StudioHeader rawJson={rawJson} onLoadRaw={handleLoadRaw} />

            <div className='min-h-0 flex-1'>
                <ResizablePanelGroup key={orientation} orientation={orientation}>
                    <ResizablePanel defaultSize={editorSize} minSize={editorMinSize} className='min-h-0 min-w-0'>
                        <JsonEditorPanel value={rawJson} onChange={handleEditorChange} keyboard={keyboard} error={error} />
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={100 - editorSize} minSize={40} className='min-h-0 min-w-0'>
                        <Tabs
                            value={activeTab}
                            onValueChange={(value) => setActiveTab(value as StudioTab)}
                            className='flex h-full min-h-0 flex-col gap-0 bg-background'>
                            <div className='flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3'>
                                <TabsList className='h-8'>
                                    {STUDIO_TABS.map((tab) => (
                                        <TabsTrigger key={tab.value} value={tab.value} className='px-3 text-xs'>
                                            {tab.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                <span className='truncate font-mono text-2xs tabular-nums text-muted-foreground'>{quickStats}</span>
                            </div>

                            <div className='min-h-0 flex-1'>
                                <TabsContent forceMount value='keyboard' className='h-full data-[state=inactive]:hidden'>
                                    {keyboard ? (
                                        <LayoutPanel
                                            keyboard={keyboard}
                                            selectedIndices={selectedIndices}
                                            resetViewToken={viewResetToken}
                                            canUndo={canUndo}
                                            canRedo={canRedo}
                                            onSelectionChange={handleSelectionChange}
                                            onApplyKeys={applyKeysEdit}
                                            onMoveSelection={handleMoveSelection}
                                            onResizeSelection={handleResizeSelection}
                                            onDeleteSelection={handleDeleteSelection}
                                            onAddKey={handleAddKey}
                                            onDuplicate={handleDuplicateSelection}
                                            onCopySelection={handleCopySelection}
                                            onCutSelection={handleCutSelection}
                                            onPaste={handlePaste}
                                            onUndo={undo}
                                            onRedo={redo}
                                        />
                                    ) : (
                                        <WaitingState />
                                    )}
                                </TabsContent>
                                <TabsContent forceMount value='plate' className='h-full overflow-auto p-4 data-[state=inactive]:hidden'>
                                    {keyboard ? <PlatePanel keyboard={keyboard} /> : <WaitingState />}
                                </TabsContent>
                                <TabsContent forceMount value='pcb' className='h-full overflow-auto p-4 data-[state=inactive]:hidden'>
                                    {keyboard ? <PcbPanel keyboard={keyboard} /> : <WaitingState />}
                                </TabsContent>
                                <TabsContent forceMount value='build' className='h-full overflow-auto p-4 data-[state=inactive]:hidden'>
                                    {keyboard ? <BuildPanel keyboard={keyboard} onApplyMeta={applyMetaEdit} /> : <WaitingState />}
                                </TabsContent>
                            </div>
                        </Tabs>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    )
}
