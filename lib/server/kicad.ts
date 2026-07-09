import { execFile } from 'node:child_process'
import { access, cp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_CLI_PATH = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
const CLI_BINARY_NAME = 'kicad-cli'
const WORK_BASE = path.join(tmpdir(), 'keebforge-kicad')
const JOB_MAX_AGE_MS = 60 * 60 * 1000
const RENDER_TIMEOUT_MS = 120_000
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

const PCB_FRONT = 'pcb-front.svg'
const PCB_BACK = 'pcb-back.svg'
const SCHEMATIC = 'schematic.svg'
const BOARD_GLB = 'board.glb'

export const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
    [PCB_FRONT]: 'image/svg+xml',
    [PCB_BACK]: 'image/svg+xml',
    [SCHEMATIC]: 'image/svg+xml',
    [BOARD_GLB]: 'model/gltf-binary',
}

export const artifactFilePath = (id: string, name: string) => path.join(WORK_BASE, id, name)

const exists = async (candidate: string) => {
    try {
        await access(candidate)
        return true
    } catch {
        return false
    }
}

export const resolveKicadCli = async () => {
    const fromEnv = process.env.KICAD_CLI
    if (fromEnv && (await exists(fromEnv))) return fromEnv
    if (await exists(DEFAULT_CLI_PATH)) return DEFAULT_CLI_PATH
    const pathEntries = (process.env.PATH ?? '').split(path.delimiter)
    for (const directory of pathEntries) {
        if (!directory) continue
        const candidate = path.join(directory, CLI_BINARY_NAME)
        if (await exists(candidate)) return candidate
    }
    return null
}

export const cleanupStaleJobs = async () => {
    let entries
    try {
        entries = await readdir(WORK_BASE, { withFileTypes: true })
    } catch {
        return
    }
    const now = Date.now()
    await Promise.all(
        entries.map(async (entry) => {
            if (!entry.isDirectory()) return
            const jobDir = path.join(WORK_BASE, entry.name)
            try {
                const info = await stat(jobDir)
                if (now - info.mtimeMs > JOB_MAX_AGE_MS) await rm(jobDir, { recursive: true, force: true })
            } catch {}
        }),
    )
}

const sharedModelDir = (cliPath: string) => path.resolve(path.dirname(cliPath), '..', 'SharedSupport', '3dmodels')

const errorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message
    return String(error)
}

type RenderJobInput = {
    pcb: string
    sch?: string
    pro?: string
    includeSwitchModels?: boolean
}

type RenderArtifact = {
    name: string
    ok: boolean
    error?: string
}

export const createRenderJob = async ({ pcb, sch, pro, includeSwitchModels = false }: RenderJobInput) => {
    const cli = await resolveKicadCli()
    if (!cli) throw new Error('kicad-cli not found')

    const id = randomUUID()
    const jobDir = path.join(WORK_BASE, id)
    await mkdir(jobDir, { recursive: true })

    const pcbPath = path.join(jobDir, 'keyboard.kicad_pcb')
    const schPath = path.join(jobDir, 'keyboard.kicad_sch')
    const proPath = path.join(jobDir, 'keyboard.kicad_pro')
    await writeFile(pcbPath, pcb, 'utf8')
    if (sch) await writeFile(schPath, sch, 'utf8')
    if (pro) await writeFile(proPath, pro, 'utf8')

    if (includeSwitchModels) {
        const modelsSource = path.join(process.cwd(), 'vendor', '3dmodels')
        if (await exists(modelsSource)) {
            try {
                await cp(modelsSource, path.join(jobDir, '3dmodels'), { recursive: true })
            } catch {}
        }
    }

    const artifacts: RenderArtifact[] = []

    const runExport = async (name: string, args: string[], produced: string) => {
        try {
            await execFileAsync(cli, args, { cwd: jobDir, timeout: RENDER_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES })
            if (!(await exists(produced))) throw new Error('export produced no output')
            artifacts.push({ name, ok: true })
        } catch (error) {
            artifacts.push({ name, ok: false, error: errorMessage(error) })
        }
    }

    await runExport(
        PCB_FRONT,
        [
            'pcb',
            'export',
            'svg',
            '--layers',
            'F.Cu,F.SilkS,F.Mask,Edge.Cuts',
            '--exclude-drawing-sheet',
            '--page-size-mode',
            '2',
            '--mode-single',
            '-o',
            path.join(jobDir, PCB_FRONT),
            pcbPath,
        ],
        path.join(jobDir, PCB_FRONT),
    )

    await runExport(
        PCB_BACK,
        [
            'pcb',
            'export',
            'svg',
            '--layers',
            'B.Cu,B.SilkS,B.Mask,Edge.Cuts',
            '--exclude-drawing-sheet',
            '--page-size-mode',
            '2',
            '--mode-single',
            '-o',
            path.join(jobDir, PCB_BACK),
            pcbPath,
        ],
        path.join(jobDir, PCB_BACK),
    )

    if (sch) {
        try {
            const schOutDir = path.join(jobDir, 'sch')
            await mkdir(schOutDir, { recursive: true })
            await execFileAsync(cli, ['sch', 'export', 'svg', '-o', schOutDir, schPath], {
                cwd: jobDir,
                timeout: RENDER_TIMEOUT_MS,
                maxBuffer: MAX_BUFFER_BYTES,
            })
            const produced = (await readdir(schOutDir)).find((file) => file.endsWith('.svg'))
            if (!produced) throw new Error('schematic export produced no svg')
            await rename(path.join(schOutDir, produced), path.join(jobDir, SCHEMATIC))
            artifacts.push({ name: SCHEMATIC, ok: true })
        } catch (error) {
            artifacts.push({ name: SCHEMATIC, ok: false, error: errorMessage(error) })
        }
    } else {
        artifacts.push({ name: SCHEMATIC, ok: false, error: 'no schematic source provided' })
    }

    const modelDir = sharedModelDir(cli)
    const glbDefineVar = includeSwitchModels && (await exists(modelDir)) ? ['-D', `KICAD9_3DMODEL_DIR=${modelDir}`] : []
    const glbModelFlags = includeSwitchModels ? ['--subst-models'] : []
    await runExport(
        BOARD_GLB,
        ['pcb', 'export', 'glb', ...glbModelFlags, '--force', ...glbDefineVar, '-o', path.join(jobDir, BOARD_GLB), pcbPath],
        path.join(jobDir, BOARD_GLB),
    )

    return { id, artifacts }
}
