import { format } from 'date-fns'
import { tr } from 'date-fns/locale'

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

/** 1_258_291 → "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`
  return `${nf.format(bytes / (1024 * 1024))} MB`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Geçen süre, kısa: "az önce", "14 dk önce", "3 sa önce", "dün", "4 gün önce", sonra "3 Eyl". */
export function formatAgo(at: number, now: number): string {
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return 'az önce'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} dk önce`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} sa önce`
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'dün'
  if (days < 7) return `${days} gün önce`
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear()
  return format(at, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: tr })
}
