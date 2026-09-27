const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

/** 1_258_291 → "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`
  return `${nf.format(bytes / (1024 * 1024))} MB`
}
