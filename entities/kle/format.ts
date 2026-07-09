const KLE_ROW_INDENT = '    '

export const formatKleJson = (rows: unknown[]) => `[\n${rows.map((row) => `${KLE_ROW_INDENT}${JSON.stringify(row)}`).join(',\n')}\n]`

export const tryParseKleRows = (text: string) => {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        try {
            parsed = JSON.parse(`[${text}]`)
        } catch {
            return null
        }
    }
    return Array.isArray(parsed) ? parsed : null
}
