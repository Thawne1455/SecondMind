// Devlog taslağı (PROJELER.md > 5. Günlük, 5d-3). Haftanın verisinden şablonla metin; AI yok.
// Biçimler: Markdown (Discord / itch.io) ve Steam BBCode.

export type DevlogInput = {
  projectName: string
  /** ISO hafta numarası. */
  week: number
  sessions: number
  minutes: number
  milestones: string[]
  /** Biten görevler, en yeni önce. */
  tasks: { title: string; kind: 'task' | 'bug' | 'research' }[]
  /** Commit mesajları, en yeni önce (ilk satır). */
  commits: string[]
  /** Sıradaki adım motorunun ilk 3'ü. */
  next: string[]
  /** Görsellerin adresi (haftanın ilk ve son zaman makinesi karesi, yıldızlılar önce). */
  images: string[]
}

export type Devlog = {
  title: string
  summary: string
  newItems: string[]
  fixed: string[]
  next: string[]
  images: string[]
  /** Hiç girdi yok: boş durum gösterilir. */
  empty: boolean
}

/** Anlamsız kısa commit mesajları: taslağa girmez. */
const NOISE =
  /^(wip|fix typo|typo|fix|fixes|update|updates|minor|misc|temp|test|cleanup|format|\.+)$/i

/** İlk satır; merge ve gürültü mesajları null. */
export function cleanCommit(message: string): string | null {
  const line = message.split('\n')[0]!.trim()
  if (!line) return null
  if (/^merge\b/i.test(line)) return null
  if (NOISE.test(line)) return null
  if (line.split(/\s+/).length < 2) return null
  return line
}

/** Aynı başlangıçlı mesajlar tek maddede: iki noktadan önceki kısım (≤ 30 harf) ya da ilk 3 kelime. */
function commitKey(line: string): string {
  const colon = line.indexOf(':')
  const head =
    colon > 0 && colon <= 30 ? line.slice(0, colon) : line.split(/\s+/).slice(0, 3).join(' ')
  return head.toLocaleLowerCase('tr-TR')
}

/** Commit maddeleri: temizlenir, aynı başlangıçlılar birleşir ("… (3 commit)"). Sıra korunur. */
export function commitItems(messages: readonly string[]): string[] {
  const groups = new Map<string, { text: string; n: number }>()
  for (const m of messages) {
    const line = cleanCommit(m)
    if (!line) continue
    const key = commitKey(line)
    const g = groups.get(key)
    if (g) g.n++
    else groups.set(key, { text: line, n: 1 })
  }
  return [...groups.values()].map((g) => (g.n > 1 ? `${g.text} (${g.n} commit)` : g.text))
}

/** "11 saat", "1,5 saat", "45 dk". */
export function hoursText(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`
  const h = Math.round(minutes / 6) / 10
  return `${String(h).replace('.', ',')} saat`
}

export function buildDevlog(input: DevlogInput): Devlog {
  const done = input.tasks.length
  const fixed = input.tasks.filter((t) => t.kind === 'bug').map((t) => t.title)
  const newItems = [
    ...input.milestones.map((m) => `Kilometre taşı tamam: ${m}`),
    ...input.tasks.filter((t) => t.kind !== 'bug').map((t) => t.title),
  ]
  // Görevlerde zaten geçen commit'ler tekrar yazılmaz.
  const known = new Set([...newItems, ...fixed].map((t) => t.toLocaleLowerCase('tr-TR')))
  for (const c of commitItems(input.commits))
    if (!known.has(c.toLocaleLowerCase('tr-TR'))) newItems.push(c)

  const parts: string[] = []
  if (input.sessions) parts.push(`${input.sessions} oturum, ${hoursText(input.minutes)}`)
  if (done) parts.push(`${done} iş bitti`)
  else if (input.commits.length) parts.push(`${input.commits.length} commit`)
  const summary = parts.length ? `Bu hafta ${parts.join('; ')}.` : ''

  return {
    title: `${input.projectName} · Hafta ${input.week}`,
    summary,
    newItems,
    fixed,
    next: input.next.slice(0, 3),
    images: input.images,
    empty: !input.sessions && !done && !newItems.length && !input.milestones.length,
  }
}

function section(title: string, items: readonly string[], item: (s: string) => string): string[] {
  return items.length ? ['', title, ...items.map(item)] : []
}

export function devlogMarkdown(d: Devlog): string {
  return [
    `# ${d.title}`,
    ...(d.summary ? ['', d.summary] : []),
    ...section('## Yeni', d.newItems, (s) => `- ${s}`),
    ...section('## Düzeltilen hatalar', d.fixed, (s) => `- ${s}`),
    ...section('## Sırada', d.next, (s) => `- ${s}`),
    ...(d.images.length ? ['', ...d.images.map((u) => `![](${u})`)] : []),
  ].join('\n')
}

export function devlogBbcode(d: Devlog): string {
  const list = (title: string, items: readonly string[]) =>
    items.length
      ? ['', `[h2]${title}[/h2]`, '[list]', ...items.map((s) => `[*]${s}`), '[/list]']
      : []
  return [
    `[h1]${d.title}[/h1]`,
    ...(d.summary ? ['', d.summary] : []),
    ...list('Yeni', d.newItems),
    ...list('Düzeltilen hatalar', d.fixed),
    ...list('Sırada', d.next),
    ...(d.images.length ? ['', ...d.images.map((u) => `[img]${u}[/img]`)] : []),
  ].join('\n')
}
