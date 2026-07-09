import { readFile } from 'node:fs/promises'
import { ARTIFACT_CONTENT_TYPES, artifactFilePath } from '@lib/server/kicad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const notFound = () => new Response('Artifact not found', { status: 404 })

export const GET = async (_request: Request, { params }: { params: Promise<{ id: string; name: string }> }) => {
    const { id, name } = await params
    if (!UUID_V4_PATTERN.test(id) || !Object.hasOwn(ARTIFACT_CONTENT_TYPES, name)) return notFound()

    let data
    try {
        data = await readFile(artifactFilePath(id, name))
    } catch {
        return notFound()
    }

    return new Response(new Uint8Array(data), {
        headers: {
            'content-type': ARTIFACT_CONTENT_TYPES[name],
            'cache-control': 'no-store',
        },
    })
}
