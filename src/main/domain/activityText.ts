// İşlem günlüğü (Onay Kutusu > İşlem günlüğü): `activity_log` kayıtlarını gruplara toplar ve her grubu birkaç kısa
// cümleye çevirir ("Görev eklendi: Menü müziğini kırp", "12 commit eklendi"). Saf fonksiyonlar; DB'yi `db/inbox.ts` okur.

export type ActivityActor = 'taha' | 'ai' | 'scan' | 'system'
export type ActivityAction = 'create' | 'update' | 'delete' | 'restore'

export type ActivityRow = {
  id: string
  actor: ActivityActor
  action: ActivityAction
  targetTable: string
  targetId: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  groupId: string | null
  undone: boolean
  /** Unix ms. */
  at: number
}

export type ActivityGroup = {
  /** Grup kimliği; grupsuz kayıtta kaydın kendi kimliği. */
  key: string
  groupId: string | null
  actor: ActivityActor
  /** Grubun en yeni kaydının zamanı. */
  at: number
  rows: ActivityRow[]
}

/** Geri alma işleminin kendi grubu (`db/undo.ts`): `undo:<geri alınan grup>`. */
export const UNDO_GROUP_PREFIX = 'undo:'
export const isUndoGroup = (groupId: string | null): boolean =>
  !!groupId && groupId.startsWith(UNDO_GROUP_PREFIX)

const NOUN: Record<string, string> = {
  tasks: 'Görev',
  notes: 'Not',
  ideas: 'Fikir',
  reminders: 'Hatırlatma',
  routines: 'Rutin',
  schedule_blocks: 'Akış bloğu',
  checkins: 'Günlük kayıt',
  dump_items: 'Döküm',
  collections: 'Koleksiyon',
  tags: 'Etiket',
  projects: 'Proje',
  project_folders: 'Proje klasörü',
  sessions: 'Oturum',
  parking: 'Park notu',
  milestones: 'Kilometre taşı',
  playtest_feedback: 'Playtest',
  playtest_clusters: 'Playtest kümesi',
  playtest_points: 'Playtest notu',
  commits: 'Commit',
  code_todos: 'Kod notu',
  scan_snapshots: 'Tarama',
  project_docs: 'Doküman',
  project_shots: 'Kare',
  project_log_notes: 'Günlük notu',
  assets: 'Varlık',
  media: 'Dosya',
  terms: 'Dönem',
  courses: 'Ders',
  course_slots: 'Ders saati',
  course_weeks: 'Hafta',
  instructors: 'Hoca',
  instructor_notes: 'Hoca notu',
  topics: 'Konu',
  grade_components: 'Not bileşeni',
  exams: 'Sınav',
  exam_topics: 'Sınav konusu',
  study_blocks: 'Çalışma bloğu',
  assignments: 'Ödev',
  attendance: 'Yoklama',
  course_materials: 'Materyal',
  note_flags: 'İşaret',
}

/** Güncellemede değişen alanların adı (bilinmeyenler yazılmaz). */
const FIELD: Record<string, string> = {
  title: 'başlık',
  name: 'ad',
  bodyMd: 'metin',
  text: 'metin',
  nextStep: 'sıradaki adım',
  status: 'durum',
  dueDate: 'tarih',
  day: 'gün',
  at: 'zaman',
  doneAt: 'tamamlandı',
  estimateMin: 'süre',
  collectionId: 'koleksiyon',
  projectId: 'proje',
  courseId: 'ders',
  milestoneId: 'kilometre taşı',
  score: 'not',
  pinned: 'sabitleme',
}

const TITLE_KEYS = ['title', 'name', 'text', 'content', 'message', 'summary'] as const
const TITLE_MAX = 80

export const nounFor = (table: string): string => NOUN[table] ?? table

function titleOf(row: ActivityRow): string {
  const source = row.after ?? row.before
  if (!source) return ''
  for (const key of TITLE_KEYS) {
    const value = source[key]
    if (typeof value !== 'string') continue
    const line = value
      .split('\n')
      .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
      .find(Boolean)
    if (line) return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
  }
  return ''
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Kaydın fiili: soft delete ve geri yükleme 'update' olarak loglanabilir. */
function verbOf(row: ActivityRow): string {
  if (row.action === 'create') return 'eklendi'
  if (row.action === 'delete') return 'silindi'
  if (row.action === 'restore') return 'geri yüklendi'
  const was = row.before?.deletedAt ?? null
  const is = row.after?.deletedAt ?? null
  if (!was && is) return 'silindi'
  if (was && !is) return 'geri yüklendi'
  return 'güncellendi'
}

function changedFields(row: ActivityRow): string[] {
  if (row.action !== 'update' || !row.before || !row.after) return []
  const out: string[] = []
  for (const [key, label] of Object.entries(FIELD))
    if (key in row.after && !same(row.before[key], row.after[key]) && !out.includes(label))
      out.push(label)
  return out
}

/** Tek kaydın cümlesi: "Görev eklendi: Menü müziğini kırp", "Proje güncellendi: Runika (sıradaki adım)". */
export function describeRow(row: ActivityRow): string {
  const verb = verbOf(row)
  const title = titleOf(row)
  const fields = verb === 'güncellendi' ? changedFields(row) : []
  const tail = fields.length ? ` (${fields.join(', ')})` : ''
  return `${nounFor(row.targetTable)} ${verb}${title ? `: ${title}` : ''}${tail}`
}

/**
 * Grubun cümleleri. Aynı tür ve fiildeki kayıtlar birleşir ("12 commit eklendi"); en fazla `max` cümle,
 * kalanı `more`.
 */
export function describeGroup(rows: ActivityRow[], max = 3): { lines: string[]; more: number } {
  const buckets: { key: string; rows: ActivityRow[] }[] = []
  for (const row of rows) {
    const key = `${row.targetTable}|${verbOf(row)}`
    const bucket = buckets.find((b) => b.key === key)
    if (bucket) bucket.rows.push(row)
    else buckets.push({ key, rows: [row] })
  }
  const lines = buckets.map(({ rows: [first, ...rest] }) =>
    rest.length
      ? `${rest.length + 1} ${nounFor(first!.targetTable).toLocaleLowerCase('tr-TR')} ${verbOf(first!)}`
      : describeRow(first!),
  )
  return { lines: lines.slice(0, max), more: Math.max(0, lines.length - max) }
}

/**
 * Kayıtları (yeniden eskiye) gruplara toplar: aynı `groupId` tek grup, grupsuz kayıt kendi başına.
 * Grup sırası en yeni kaydına göre; grup içindeki kayıtlar oluşma sırasında (eskiden yeniye).
 */
export function groupActivity(rows: ActivityRow[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>()
  for (const row of rows) {
    const key = row.groupId ?? row.id
    const group = groups.get(key)
    if (group) {
      group.rows.push(row)
      group.at = Math.max(group.at, row.at)
    } else groups.set(key, { key, groupId: row.groupId, actor: row.actor, at: row.at, rows: [row] })
  }
  for (const g of groups.values()) g.rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return [...groups.values()]
}

/**
 * Günlükte `Geri al` gösterilir mi: sadece AI'ın ve Taha'nın gruplu işlemleri (tekil düzenlemeler değil), geri
 * alınmamışsa, kendisi bir geri alma değilse ve içinde geri alınabilir (ekleme/güncelleme) kayıt varsa.
 */
export function canUndoGroup(group: ActivityGroup): boolean {
  if (!group.groupId || isUndoGroup(group.groupId)) return false
  if (group.actor !== 'ai' && group.actor !== 'taha') return false
  if (group.rows.some((r) => r.undone)) return false
  return group.rows.some((r) => r.action === 'create' || r.action === 'update')
}
