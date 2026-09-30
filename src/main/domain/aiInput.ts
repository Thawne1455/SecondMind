import { addDays, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { KnownIds } from './changes'

// AI iş paketinin `girdi.md`'si (MIMARI.md "AI akışı" 1. adım). Saf: veritabanı bilmez, bağlam dışarıdan gelir.
// Döküm öğeleri asla kırpılmaz (iş onlar); bağlam (profil, projeler, dersler, notlar) bütçeyi aşınca sondan düşer.
// Pakette görünmeyen id bilinmez sayılır: model onu kullanırsa doğrulama reddeder. "AI'a kapalı" içerik buraya
// hiç gelmez (sorgu katmanı süzer).

export type AiModel = 'fast' | 'deep'

export type AiContextProject = {
  id: string
  name: string
  nextStep: string
  milestone: { title: string; targetDate: string | null } | null
}
export type AiContextCourse = {
  id: string
  name: string
  code: string
  exams: { title: string; day: string }[]
}
export type AiContextNote = { id: string; title: string; collection: string | null }
export type AiContext = {
  now: Date
  profile: string
  projects: AiContextProject[]
  courses: AiContextCourse[]
  notes: AiContextNote[]
}
export type AiJobDump = {
  id: string
  content: string
  createdAt: Date
  attachments: { fileName: string; originalName: string; mime: string }[]
}

export type JobInput = { markdown: string; known: KnownIds; trimmed: boolean }

/** Bağlam bütçesi (MIMARI: ~3.000 token). */
export const CONTEXT_TOKEN_BUDGET = 3000

/** Kaba token tahmini; Türkçe metinde bir token ortalama 3,5 karakter. */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 3.5)

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
const dayLabel = (d: Date) => `${format(d, 'yyyy-MM-dd')} ${format(d, 'EEEE', { locale: tr })}`

function projectLine(p: AiContextProject): string {
  const parts = [`- ${clip(p.name, 80)} [id: ${p.id}]`]
  if (p.nextStep.trim()) parts.push(`sıradaki adım: ${clip(p.nextStep, 160)}`)
  if (p.milestone)
    parts.push(
      `açık kilometre taşı: ${clip(p.milestone.title, 80)}${p.milestone.targetDate ? ` (hedef ${p.milestone.targetDate})` : ''}`,
    )
  return parts.join(' · ')
}

function courseLine(c: AiContextCourse): string {
  const name = c.code.trim() ? `${clip(c.name, 80)} (${c.code.trim()})` : clip(c.name, 80)
  const exams = c.exams.map((e) => `${clip(e.title, 40)} ${e.day}`).join(', ')
  return `- ${name} [id: ${c.id}]${exams ? ` · yaklaşan sınav: ${exams}` : ''}`
}

function noteLine(n: AiContextNote): string {
  return `- ${clip(n.title || 'Başlıksız', 100)} [id: ${n.id}]${n.collection ? ` · koleksiyon: ${clip(n.collection, 40)}` : ''}`
}

function dumpBlock(d: AiJobDump): string {
  const lines = [
    `### Döküm [id: ${d.id}] · yazıldı: ${dayLabel(d.createdAt)} ${format(d.createdAt, 'HH:mm')}`,
  ]
  const text = d.content.trim()
  lines.push(
    text
      ? text
          .split(/\r?\n/)
          .map((l) => `> ${l}`)
          .join('\n')
      : '> (metin yok)',
  )
  for (const a of d.attachments)
    lines.push(`Ek: media/${a.fileName} (${a.originalName}, ${a.mime})`)
  return lines.join('\n')
}

export function buildJobInput(
  ctx: AiContext,
  dumps: AiJobDump[],
  budgetTokens = CONTEXT_TOKEN_BUDGET,
): JobInput {
  const week = Array.from({ length: 7 }, (_, i) => dayLabel(addDays(ctx.now, i + 1))).join(' · ')
  const head = [
    '# SecondMind iş paketi',
    '',
    `Bugün: ${dayLabel(ctx.now)} ${format(ctx.now, 'HH:mm')}`,
    `Önümüzdeki 7 gün: ${week}`,
  ].join('\n')

  let used = estimateTokens(head)
  let trimmed = false
  const fits = (s: string) => {
    const cost = estimateTokens(s) + 1
    if (used + cost > budgetTokens) {
      trimmed = true
      return false
    }
    used += cost
    return true
  }

  const sections: string[] = [head]
  const profile = ctx.profile.trim()
  if (profile) {
    const block = `## Taha hakkında\n${clip(profile, 1200)}`
    if (fits(block)) sections.push(block)
  }

  const projectIds = new Set<string>()
  const courseIds = new Set<string>()
  const noteIds = new Set<string>()
  // Sıra önceliktir: projeler ve dersler döküm yerleştirmede notlardan daha çok işe yarar.
  const lists: [string, { id: string; line: string }[], Set<string>][] = [
    [
      '## Aktif projeler',
      ctx.projects.map((p) => ({ id: p.id, line: projectLine(p) })),
      projectIds,
    ],
    [
      '## Bu dönemin dersleri',
      ctx.courses.map((c) => ({ id: c.id, line: courseLine(c) })),
      courseIds,
    ],
    [
      '## Son notlar (ekleme yapılabilir)',
      ctx.notes.map((n) => ({ id: n.id, line: noteLine(n) })),
      noteIds,
    ],
  ]
  for (const [title, items, ids] of lists) {
    const lines: string[] = []
    for (const item of items) {
      if (!fits(item.line)) break
      lines.push(item.line)
      ids.add(item.id)
    }
    sections.push(`${title}\n${lines.length ? lines.join('\n') : '(yok)'}`)
  }

  sections.push(
    `## İşlenecek döküm öğeleri (${dumps.length})\n\n${dumps.map(dumpBlock).join('\n\n')}`,
  )

  return {
    markdown: `${sections.join('\n\n')}\n`,
    known: { dumpIds: new Set(dumps.map((d) => d.id)), projectIds, courseIds, noteIds },
    trimmed,
  }
}

/**
 * Hangi döküm hangi çalıştırıcıya gider (docs/YEREL-LLM.md): yerel model görüntü/PDF okuyamaz, eki olan döküm
 * HIZLI seçilse de DERİN'e gider. Boş gruplar dönmez.
 */
export function splitByModel<T extends { attachments: unknown[] }>(
  dumps: T[],
  requested: AiModel,
): { model: AiModel; dumps: T[] }[] {
  if (requested === 'deep') return dumps.length ? [{ model: 'deep', dumps }] : []
  const fast = dumps.filter((d) => !d.attachments.length)
  const deep = dumps.filter((d) => d.attachments.length)
  return [
    ...(fast.length ? [{ model: 'fast' as const, dumps: fast }] : []),
    ...(deep.length ? [{ model: 'deep' as const, dumps: deep }] : []),
  ]
}

export function inputSummary(dumps: AiJobDump[]): string {
  const files = dumps.reduce((n, d) => n + d.attachments.length, 0)
  return `${dumps.length} döküm${files ? ` · ${files} ek` : ''}`
}
