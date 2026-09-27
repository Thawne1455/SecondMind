import type { DumpKind } from '@shared/schemas/dump'

// Media deposunun saf kuralları: dosya adı, uzantı, tür. Electron'a bağımsız.

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
}

const EXT_RE = /^[a-z0-9]{1,8}$/

/** Uzantı önce orijinal addan, yoksa MIME türünden; hiçbiri yoksa `bin`. */
export function mediaExtension(originalName: string, mime: string): string {
  const dot = originalName.lastIndexOf('.')
  if (dot > 0) {
    const ext = originalName.slice(dot + 1).toLowerCase()
    if (EXT_RE.test(ext)) return ext === 'jpeg' ? 'jpg' : ext
  }
  return MIME_EXT[mime.toLowerCase()] ?? 'bin'
}

/** `media/` içindeki dosya adı: içerik hash'i (sha256, hex) + uzantı. */
export function mediaFileName(hash: string, originalName: string, mime: string): string {
  return `${hash}.${mediaExtension(originalName, mime)}`
}

const FILE_NAME_RE = /^[a-f0-9]{64}\.[a-z0-9]{1,8}$/

/** `sm-media://` isteklerinde yol kaçışını engeller: sadece depo biçimindeki adlar geçer. */
export function isMediaFileName(name: string): boolean {
  return FILE_NAME_RE.test(name)
}

/** Dökümün türü: ek yoksa metin, varsa ilk ekin türü. */
export function dumpKind(mimes: readonly string[]): DumpKind {
  const [first] = mimes
  if (first === undefined) return 'text'
  return first.startsWith('image/') ? 'image' : 'file'
}
