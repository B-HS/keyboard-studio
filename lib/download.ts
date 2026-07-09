const triggerDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(url)
}

export const downloadTextFile = (fileName: string, text: string, mimeType = 'text/plain') =>
    triggerDownload(new Blob([text], { type: mimeType }), fileName)

export const downloadBinaryFile = (fileName: string, buffers: ArrayBuffer[], mimeType = 'application/octet-stream') =>
    triggerDownload(new Blob(buffers, { type: mimeType }), fileName)
