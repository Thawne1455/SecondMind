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

const SHORT_DAYS = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function dayDiff(at: Date, now: Date): number {
  const a = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((a - b) / DAY)
}

/** Yakın gün adı: "Bugün", "Yarın", "Dün", bu hafta "Cuma" (date-fns tr büyük harfle), sonra "5 Eki". */
export function formatDayName(at: Date, now: Date): string {
  const diff = dayDiff(at, now)
  if (diff === 0) return 'Bugün'
  if (diff === 1) return 'Yarın'
  if (diff === -1) return 'Dün'
  if (diff > 1 && diff < 7) return format(at, 'EEEE', { locale: tr })
  const sameYear = at.getFullYear() === now.getFullYear()
  return format(at, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: tr })
}

/** Hatırlatma zamanı, kısa: bugün "20:00", yarın "Yarın 10:00", bu hafta "Sal 23:59", sonra "5 Eki 10:00". */
export function formatReminderAt(at: number, now: number): string {
  const d = new Date(at)
  const time = format(d, 'HH:mm')
  const diff = dayDiff(d, new Date(now))
  if (diff === 0) return time
  if (diff === 1) return `Yarın ${time}`
  if (diff > 1 && diff < 7) return `${SHORT_DAYS[Number(format(d, 'i'))]} ${time}`
  return `${format(d, 'd MMM', { locale: tr })} ${time}`
}

/** Tekrar kuralı: "Her gün", "Hafta içi", "Pzt, Çar", "Her ay 14'ünde"… (saat hariç). */
export function formatRule(
  rule:
    | { kind: 'weekly'; days: number[] }
    | { kind: 'monthly'; day: number }
    | { kind: 'yearly'; month: number; day: number },
): string {
  switch (rule.kind) {
    case 'weekly': {
      const days = [...rule.days].sort((a, b) => a - b).join(',')
      if (days === '1,2,3,4,5,6,7') return 'Her gün'
      if (days === '1,2,3,4,5') return 'Hafta içi'
      if (days === '6,7') return 'Hafta sonu'
      return rule.days.map((d) => SHORT_DAYS[d]).join(', ')
    }
    case 'monthly':
      return `Her ay ${rule.day}.`
    case 'yearly':
      return `Her yıl ${format(new Date(2024, rule.month - 1, rule.day), 'd MMM', { locale: tr })}`
  }
}

/** Dakika: 45 → "45 dk", 90 → "1 sa 30 dk", 120 → "2 sa". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} dk`
  return m ? `${h} sa ${m} dk` : `${h} sa`
}
