import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import type { Operation } from '@shared/schemas/ai'
import type { ProposalGroup } from '@shared/ipc'
import { formatDayName } from '../../lib/format'

// Onay Kutusu metinleri: işlem türü etiketi, önerinin tek cümlesi, grup başlığı. Tarihler hep gün adı + tarihle
// yazılır ("Cuma 9 Eki"): AI'ın göreli tarih hatası tek bakışta görülsün.

/** İşlem türü etiketi (TASARIM.md: "+ Yeni görev, Not güncelleme, Hatırlatma, Proje durumu"). */
export const OP_TAG: Record<Operation['op'], string> = {
  create_task: '+ Görev',
  create_note: '+ Not',
  append_to_note: 'Not güncelleme',
  create_reminder: '+ Hatırlatma',
  create_idea: '+ Fikir',
  create_exam: '+ Sınav',
  set_project_next_step: 'Proje durumu',
  add_instructor_note: '+ Hoca notu',
}

const TASK_KIND: Record<'task' | 'bug' | 'research', string> = {
  task: 'Görev',
  bug: 'Hata',
  research: 'Araştırma',
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

/** "Bugün", "Yarın", "Dün", yoksa "Cuma 9 Eki" (başka yılda "Cuma 9 Eki 2027"). */
export function dayText(day: Date, now: Date): string {
  const near = formatDayName(day, now)
  if (near === 'Bugün' || near === 'Yarın' || near === 'Dün') return near
  const sameYear = day.getFullYear() === now.getFullYear()
  return format(day, sameYear ? 'EEEE d MMM' : 'EEEE d MMM yyyy', { locale: tr })
}

/** "2026-10-09T09:00" → "Cuma 9 Eki 09:00". */
function dateTimeText(value: string, now: Date): string {
  const [day, time] = value.split('T') as [string, string]
  return `${dayText(parseDay(day), now)} ${time}`
}

function firstLine(md: string | null | undefined, max = 90): string | null {
  const line = md
    ?.split('\n')
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .find(Boolean)
  if (!line) return null
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Önerinin tek cümlesi: kalın başlık + " · " ile ayrılan ayrıntılar. */
export function proposalLine(op: Operation, now: Date): { title: string; meta: string[] } {
  switch (op.op) {
    case 'create_task':
      return {
        title: op.title,
        meta: [
          op.dueDate ? dayText(parseDay(op.dueDate), now) : null,
          op.estimateMin ? `${op.estimateMin} dk` : null,
          op.kind && op.kind !== 'task' ? TASK_KIND[op.kind] : null,
        ].filter((m): m is string => !!m),
      }
    case 'create_note':
      return {
        title: op.title,
        meta: [firstLine(op.bodyMd)].filter((m): m is string => !!m),
      }
    case 'append_to_note':
      return { title: firstLine(op.appendMd) ?? 'Nota ekleme', meta: [] }
    case 'create_reminder':
      return { title: op.title, meta: [dateTimeText(op.at, now)] }
    case 'create_idea':
      return { title: op.title, meta: [firstLine(op.note)].filter((m): m is string => !!m) }
    case 'create_exam':
      return {
        title: op.title,
        meta: [
          `${dayText(parseDay(op.date), now)}${op.time ? ` ${op.time}` : ''}`,
          op.weekFrom && op.weekTo
            ? `${op.weekFrom}–${op.weekTo}. haftalar`
            : op.weekFrom
              ? `${op.weekFrom}. haftadan`
              : null,
        ].filter((m): m is string => !!m),
      }
    case 'set_project_next_step':
      return { title: op.text, meta: [] }
    case 'add_instructor_note':
      return { title: firstLine(op.text, 160) ?? op.text, meta: [] }
  }
}

const SOURCE: Record<ProposalGroup['kind'], string> = {
  dump: "Döküm'den",
  weekly_review: 'Haftalık değerlendirme',
  schedule_import: 'Ders programından',
}

/** "Döküm'den · bugün 10:12 · 4 öneri". */
export function groupHeading(
  group: Pick<ProposalGroup, 'kind' | 'startedAt' | 'proposals'>,
  now: Date,
): string {
  const at = new Date(group.startedAt)
  const near = formatDayName(at, now)
  const day =
    near === 'Bugün' || near === 'Dün'
      ? near.toLocaleLowerCase('tr-TR')
      : format(at, at.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: tr })
  return [
    SOURCE[group.kind],
    `${day} ${format(at, 'HH:mm')}`,
    `${group.proposals.length} öneri`,
  ].join(' · ')
}
