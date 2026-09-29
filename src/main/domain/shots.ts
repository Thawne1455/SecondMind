// Zaman makinesi ve varlıklar (PROJELER.md > 6. Varlıklar, 5d-4): saf kurallar. Electron'a bağımsız.

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'] as const
export const AUDIO_EXTS = ['wav', 'mp3', 'ogg', 'flac', 'm4a'] as const

/** Köprünün Editor betiğinin kareleri (5e); varsa her zaman okunur. */
export const EDITOR_SHOTS_DIR = '.secondmind/goruntuler'

/** Klasörden alınan bir görüntünün en büyük boyutu. */
export const SHOT_MAX_BYTES = 20 * 1024 * 1024

const ext = (name: string) => (name.split('.').pop() ?? '').toLowerCase()

export const isImagePath = (name: string) => (IMAGE_EXTS as readonly string[]).includes(ext(name))
export const isAudioPath = (name: string) => (AUDIO_EXTS as readonly string[]).includes(ext(name))

export type AssetKind = 'image' | 'audio' | 'pdf' | 'other'

/** Varlığın türü: önce MIME, yoksa uzantı. */
export function assetKind(name: string, mime = ''): AssetKind {
  const m = mime.toLowerCase()
  if (m.startsWith('image/') || isImagePath(name)) return 'image'
  if (m.startsWith('audio/') || isAudioPath(name)) return 'audio'
  if (m === 'application/pdf' || ext(name) === 'pdf') return 'pdf'
  return 'other'
}

/** Uzantıdan MIME (klasörden okunan dosyalar için). */
export function mimeOf(name: string): string {
  const e = ext(name)
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png' || e === 'webp') return `image/${e}`
  if (e === 'mp3') return 'audio/mpeg'
  if (e === 'wav' || e === 'ogg' || e === 'flac') return `audio/${e}`
  if (e === 'm4a') return 'audio/mp4'
  if (e === 'pdf') return 'application/pdf'
  return 'application/octet-stream'
}

const SHOT_DIR_NAME = /screenshot|capture|ekran|g[öo]r[üu]nt[üu]|shots?$|kareler/i

/**
 * Görüntü biriken klasör önerileri: adı ekran görüntüsünü andıran ve içinde resim olan klasörler, çok resimli
 * önce. Bağlı olanlar ve Editor betiği klasörü önerilmez.
 */
export function suggestImageDirs(
  dirs: readonly { path: string; images: number }[],
  bound: readonly string[],
): { path: string; images: number }[] {
  const taken = new Set(bound.map((b) => b.toLowerCase()))
  return dirs
    .filter(
      (d) =>
        d.images > 0 &&
        !taken.has(d.path.toLowerCase()) &&
        d.path.toLowerCase() !== EDITOR_SHOTS_DIR &&
        SHOT_DIR_NAME.test(d.path.split('/').pop() ?? ''),
    )
    .sort((a, b) => b.images - a.images || a.path.localeCompare(b.path))
}

/** O günün en çok dosya değiştiren alanı (commit alanlarının toplamı); commit yoksa null. */
export function topArea(areas: readonly Record<string, number>[]): string | null {
  const sum = new Map<string, number>()
  for (const a of areas) for (const [k, n] of Object.entries(a)) sum.set(k, (sum.get(k) ?? 0) + n)
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of sum)
    if (n > bestN || (n === bestN && best !== null && k.localeCompare(best) < 0)) {
      best = k
      bestN = n
    }
  return best
}
