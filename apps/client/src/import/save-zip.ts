/** Share the zip on the phone. A browser without sharing downloads it. */
export async function saveZip(filename: string, bytes: Uint8Array): Promise<void> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const file = new File([copy], filename, { type: "application/zip" })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
