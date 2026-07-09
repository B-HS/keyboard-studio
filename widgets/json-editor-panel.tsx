'use client'

import { useState, type FC } from 'react'
import CodeMirror, { Decoration, EditorView, RangeSetBuilder, ViewPlugin, type BasicSetupOptions, type ViewUpdate } from '@uiw/react-codemirror'
import { json, jsonLanguage } from '@codemirror/lang-json'
import { Braces } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { formatKleJson, tryParseKleRows } from '@entities/kle/format'
import { getKeyboardBoundsU } from '@entities/kle/geometry'
import type { KleKeyboard } from '@entities/kle/types'
import { cn } from '@lib/utils'
import { Button } from '@ui/button'
import { Skeleton } from '@ui/skeleton'

const EDITOR_THEME_STYLE = {
    '&': {
        backgroundColor: 'transparent',
        color: 'var(--foreground)',
        fontSize: '12.5px',
        height: '100%',
    },
    '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.7',
    },
    '.cm-content': {
        caretColor: 'var(--foreground)',
        padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--foreground)',
    },
    '&.cm-focused': {
        outline: 'none',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'color-mix(in oklab, var(--muted-foreground) 65%, transparent)',
        border: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 12px 0 8px',
    },
    '.cm-activeLine': {
        backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)',
        color: 'var(--foreground)',
    },
    '.cm-selectionBackground': {
        backgroundColor: 'color-mix(in oklab, var(--muted-foreground) 26%, transparent)',
    },
    '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'color-mix(in oklab, var(--muted-foreground) 34%, transparent)',
    },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: 'color-mix(in oklab, var(--muted-foreground) 24%, transparent)',
        color: 'inherit',
        outline: 'none',
    },
}

const TOKEN_PALETTE_LIGHT = {
    '.cm-json-property': { color: '#0369a1' },
    '.cm-json-string': { color: '#047857' },
    '.cm-json-number': { color: '#b45309' },
    '.cm-json-atom': { color: '#7c3aed' },
    '.cm-json-punctuation': { color: 'var(--muted-foreground)' },
}

const TOKEN_PALETTE_DARK = {
    '.cm-json-property': { color: '#7dd3fc' },
    '.cm-json-string': { color: '#6ee7b7' },
    '.cm-json-number': { color: '#fbbf24' },
    '.cm-json-atom': { color: '#c4b5fd' },
    '.cm-json-punctuation': { color: 'var(--muted-foreground)' },
}

const LIGHT_EDITOR_THEME = EditorView.theme({ ...EDITOR_THEME_STYLE, ...TOKEN_PALETTE_LIGHT }, { dark: false })
const DARK_EDITOR_THEME = EditorView.theme({ ...EDITOR_THEME_STYLE, ...TOKEN_PALETTE_DARK }, { dark: true })

const JSON_TOKEN_CLASS: Record<string, string> = {
    'PropertyName': 'cm-json-property',
    'String': 'cm-json-string',
    'Number': 'cm-json-number',
    'True': 'cm-json-atom',
    'False': 'cm-json-atom',
    'Null': 'cm-json-atom',
    '{': 'cm-json-punctuation',
    '}': 'cm-json-punctuation',
    '[': 'cm-json-punctuation',
    ']': 'cm-json-punctuation',
    ',': 'cm-json-punctuation',
    ':': 'cm-json-punctuation',
}

const TOKEN_MARK_CACHE: Record<string, Decoration> = {}

const markForClass = (className: string) => {
    const cached = TOKEN_MARK_CACHE[className]
    if (cached) return cached
    const mark = Decoration.mark({ class: className })
    TOKEN_MARK_CACHE[className] = mark
    return mark
}

const buildJsonDecorations = (view: EditorView) => {
    const builder = new RangeSetBuilder<Decoration>()
    const tree = jsonLanguage.parser.parse(view.state.doc.toString())
    tree.iterate({
        enter: (node: { name: string; from: number; to: number }) => {
            const className = JSON_TOKEN_CLASS[node.name]
            if (className) builder.add(node.from, node.to, markForClass(className))
        },
    })
    return builder.finish()
}

const jsonHighlightPlugin = ViewPlugin.define(
    (view: EditorView) => {
        const plugin = {
            decorations: buildJsonDecorations(view),
            update: (viewUpdate: ViewUpdate) => {
                if (viewUpdate.docChanged) plugin.decorations = buildJsonDecorations(viewUpdate.view)
            },
        }
        return plugin
    },
    { decorations: (plugin) => plugin.decorations },
)

const EDITOR_EXTENSIONS = [json(), jsonHighlightPlugin]
const EDITOR_BASIC_SETUP: BasicSetupOptions = {
    lineNumbers: true,
    foldGutter: false,
    highlightActiveLine: true,
    highlightActiveLineGutter: true,
    bracketMatching: true,
    autocompletion: false,
    highlightSelectionMatches: false,
    syntaxHighlighting: false,
}

const EDITOR_SKELETON_LINES = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3', 'w-3/5', 'w-1/2', 'w-2/5', 'w-4/6', 'w-1/2']

const EditorSkeleton = () => (
    <div className='pointer-events-none absolute inset-0 flex gap-3 px-3 py-2'>
        <div className='flex w-6 flex-col gap-2 pt-0.5'>
            {EDITOR_SKELETON_LINES.map((_, index) => (
                <Skeleton key={index} className='h-3.5 w-full opacity-60' />
            ))}
        </div>
        <div className='flex flex-1 flex-col gap-2 pt-0.5'>
            {EDITOR_SKELETON_LINES.map((width, index) => (
                <Skeleton key={index} className={cn('h-3.5 opacity-60', width)} />
            ))}
        </div>
    </div>
)

type JsonEditorPanelProps = {
    value: string
    onChange: (next: string) => void
    keyboard: KleKeyboard | null
    error: string | null
}

export const JsonEditorPanel: FC<JsonEditorPanelProps> = ({ value, onChange, keyboard, error }) => {
    const [editorReady, setEditorReady] = useState(false)

    const { resolvedTheme } = useTheme()

    const handleFormat = () => {
        const rows = tryParseKleRows(value)
        if (!rows) {
            toast.error('Cannot format invalid JSON')
            return
        }
        onChange(formatKleJson(rows))
    }

    const editorTheme = resolvedTheme === 'dark' ? DARK_EDITOR_THEME : LIGHT_EDITOR_THEME
    const keyCount = keyboard?.keys.length ?? 0
    const bounds = keyboard ? getKeyboardBoundsU(keyboard.keys) : null
    const keyboardName = keyboard?.meta.name || 'Untitled layout'

    return (
        <div className='flex h-full min-h-0 flex-col bg-card'>
            <div className='flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3'>
                <span className='text-2xs font-medium uppercase tracking-wide text-muted-foreground'>Layout JSON</span>
                <div className='flex items-center gap-2'>
                    <Button variant='ghost' size='xs' onClick={handleFormat}>
                        <Braces className='size-3' />
                        Format
                    </Button>
                    <span className='flex items-center gap-1.5 font-mono text-2xs tabular-nums'>
                        <span className={cn('size-1.5 rounded-full', error ? 'bg-destructive' : 'bg-emerald-500')} />
                        <span className={cn(error ? 'text-destructive' : 'text-muted-foreground')}>{error ? 'Invalid' : `${keyCount} keys`}</span>
                    </span>
                </div>
            </div>

            <div className='relative min-h-0 flex-1 overflow-hidden'>
                {!editorReady && <EditorSkeleton />}
                <CodeMirror
                    value={value}
                    onChange={onChange}
                    onCreateEditor={() => setEditorReady(true)}
                    theme={editorTheme}
                    extensions={EDITOR_EXTENSIONS}
                    basicSetup={EDITOR_BASIC_SETUP}
                    height='100%'
                    className='h-full'
                />
            </div>

            <div className='flex h-8 shrink-0 items-center gap-2 border-t border-border px-3 text-2xs'>
                {error ? (
                    <span title={error} className='truncate font-mono text-destructive'>
                        {error}
                    </span>
                ) : (
                    <>
                        <span className='truncate font-medium text-foreground/80'>{keyboardName}</span>
                        <span className='text-muted-foreground/50'>·</span>
                        <span className='shrink-0 font-mono tabular-nums text-muted-foreground'>
                            {(bounds?.width ?? 0).toFixed(2)} × {(bounds?.height ?? 0).toFixed(2)} u
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}
