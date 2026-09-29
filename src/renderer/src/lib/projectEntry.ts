import type { DayKey } from '@shared/ipc'
import { parseQuickEntry } from './quickEntry'

// Proje görevi hızlı girişi: hızlı girişin (süre, "!", gün, "son <gün>") üstüne projeye özel işaretler.
//   "!hata zıplama takılıyor"       → tür hata
//   "!kritik kayıt bozuluyor"       → hata + kritik (önemli / küçük da olur)
//   "!araştırma shader seçenekleri" → tür araştırma
//   "@dikey ses ayarları 30dk"      → adı "dikey" ile başlayan kilometre taşı ("Dikey kesit")
// Saat tanınmaz: "10:00" başlıkta kalır. Eşleşmeyen "@kelime" de başlıkta kalır.

export type ProjectEntry = {
  title: string
  estimateMin: number | null
  priority: 3 | null
  kind: 'task' | 'bug' | 'research'
  severity: 'critical' | 'major' | 'minor' | null
  milestoneId: string | null
  dueDate: DayKey | null
  date: DayKey | null
}

export const PROJECT_ENTRY_HINT = 'Görev yaz · !hata !kritik @taş 30dk'

const SEVERITY: Record<string, 'critical' | 'major' | 'minor'> = {
  '!kritik': 'critical',
  '!önemli': 'major',
  '!küçük': 'minor',
}

const squash = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, '')

export function parseProjectEntry(
  text: string,
  now: Date,
  milestones: { id: string; title: string }[],
): ProjectEntry {
  let bug = false
  let research = false
  let severity: ProjectEntry['severity'] = null
  let milestoneId: string | null = null

  const kept: string[] = []
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const w = word.toLocaleLowerCase('tr-TR')
    if (w === '!hata') {
      bug = true
      continue
    }
    if (w in SEVERITY) {
      bug = true
      severity = SEVERITY[w]!
      continue
    }
    if (w === '!araştırma') {
      research = true
      continue
    }
    if (milestoneId === null && w.length > 1 && w.startsWith('@')) {
      const prefix = w.slice(1)
      const hit = milestones.find((m) => squash(m.title).startsWith(prefix))
      if (hit) {
        milestoneId = hit.id
        continue
      }
    }
    kept.push(word)
  }

  const quick = parseQuickEntry(kept.join(' '), now)
  return {
    title: quick.title,
    estimateMin: quick.estimateMin,
    priority: quick.priority,
    kind: bug ? 'bug' : research ? 'research' : 'task',
    severity,
    milestoneId,
    dueDate: quick.dueDate,
    date: quick.date,
  }
}
