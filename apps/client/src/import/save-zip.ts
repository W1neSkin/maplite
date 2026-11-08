export async function saveZip(filename: string, bytes: Uint8Array): Promise<void> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  await saveFile(new File([copy], filename, { type: "application/zip" }))
}

export async function saveText(filename: string, text: string, type: string): Promise<void> {
  await saveFile(new File([text], filename, { type }))
}

async function saveFile(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}
