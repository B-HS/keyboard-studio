import { cleanupStaleJobs, createRenderJob, resolveKicadCli } from '@lib/server/kicad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_TOTAL_BYTES = 8 * 1024 * 1024

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status })

export const POST = async (request: Request) => {
    const cli = await resolveKicadCli()
    if (!cli) return jsonError('kicad-cli was not found. Install KiCad or set the KICAD_CLI environment variable.', 503)

    let body: { pcb?: unknown; sch?: unknown; pro?: unknown; includeSwitchModels?: unknown }
    try {
        body = (await request.json()) as { pcb?: unknown; sch?: unknown; pro?: unknown; includeSwitchModels?: unknown }
    } catch {
        return jsonError('Request body must be valid JSON.', 400)
    }

    const { pcb, sch, pro, includeSwitchModels } = body
    if (typeof pcb !== 'string' || pcb.trim().length === 0) return jsonError('Field "pcb" is required and must be a non-empty string.', 400)
    if (sch !== undefined && typeof sch !== 'string') return jsonError('Field "sch" must be a string.', 400)
    if (pro !== undefined && typeof pro !== 'string') return jsonError('Field "pro" must be a string.', 400)
    if (includeSwitchModels !== undefined && typeof includeSwitchModels !== 'boolean')
        return jsonError('Field "includeSwitchModels" must be a boolean.', 400)

    const totalBytes =
        Buffer.byteLength(pcb) + (typeof sch === 'string' ? Buffer.byteLength(sch) : 0) + (typeof pro === 'string' ? Buffer.byteLength(pro) : 0)
    if (totalBytes > MAX_TOTAL_BYTES) return jsonError('Payload exceeds the 8MB limit.', 413)

    await cleanupStaleJobs()
    const manifest = await createRenderJob({ pcb, sch, pro, includeSwitchModels: includeSwitchModels === true })
    return Response.json(manifest)
}
