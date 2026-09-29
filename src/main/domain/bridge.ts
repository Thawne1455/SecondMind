// Claude Code köprüsü (PROJELER.md > Claude Code köprüsü, 5e): saf metin işlemleri. Dosyaya yazmaz.
// - Projenin CLAUDE.md'sine eklenen bölüm işaretler arasında durur; kaldırma sadece o bölümü siler.
// - .gitignore satırı da işaretli yorumla eklenir.
// - Oturum raporu: frontmatter + başlıklara göre basit ayrıştırma (AI yok).
// - BAGLAM.md: sıradaki adımlar, taş, görevler, hatalar, kararlar; en fazla ~1.500 token.

export const BRIDGE_DIR = '.secondmind'
export const CONTEXT_FILE = 'BAGLAM.md'
export const REPORTS_DIR = 'oturumlar'
export const PROCESSED_DIR = 'islendi'
export const SHOTS_DIR = 'goruntuler'
export const DOCS_DIR = 'dokumanlar'
export const EDITOR_SCRIPT = 'Assets/Editor/SecondMindSnapshot.cs'

const BLOCK_START = '<!-- secondmind:başla -->'
const BLOCK_END = '<!-- secondmind:bitir -->'
const GITIGNORE_MARK = '# SecondMind köprüsü'

const nl = (s: string) => s.replace(/\r\n?/g, '\n')

/** CLAUDE.md'ye köprü bölümü var mı. */
export const hasClaudeBlock = (text: string) => nl(text).includes(BLOCK_START)

/** CLAUDE.md'nin sonuna işaretli bölümü ekler (varsa yerine koyar). */
export function addClaudeBlock(text: string, addendum: string): string {
  const base = removeClaudeBlock(text).trimEnd()
  const block = `${BLOCK_START}\n${nl(addendum).trim()}\n${BLOCK_END}\n`
  return base ? `${base}\n\n${block}` : block
}

/** İşaretli bölümü siler; dosyanın geri kalanına dokunmaz. */
export function removeClaudeBlock(text: string): string {
  const t = nl(text)
  const start = t.indexOf(BLOCK_START)
  if (start < 0) return t
  const endAt = t.indexOf(BLOCK_END, start)
  const end = endAt < 0 ? t.length : endAt + BLOCK_END.length
  const before = t.slice(0, start).replace(/\n+$/, '')
  const after = t.slice(end).replace(/^\n+/, '')
  if (!before) return after
  if (!after) return `${before}\n`
  return `${before}\n\n${after}`
}

export const hasGitignoreLine = (text: string) =>
  nl(text)
    .split('\n')
    .some((l) => l.trim() === `${BRIDGE_DIR}/` || l.trim() === BRIDGE_DIR)

export function addGitignoreLine(text: string): string {
  if (hasGitignoreLine(text)) return nl(text)
  const base = nl(text).replace(/\n*$/, '')
  return `${base ? `${base}\n\n` : ''}${GITIGNORE_MARK}\n${BRIDGE_DIR}/\n`
}

/** Sadece köprünün eklediği iki satırı siler. */
export function removeGitignoreLine(text: string): string {
  const lines = nl(text).split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === GITIGNORE_MARK && lines[i + 1]?.trim() === `${BRIDGE_DIR}/`) {
      i++
      while (out.length && out[out.length - 1] === '') out.pop()
      continue
    }
    out.push(lines[i]!)
  }
  const joined = out.join('\n').replace(/\n*$/, '')
  return joined ? `${joined}\n` : ''
}

// ---------------------------------------------------------------- oturum raporu

export type SessionReport = {
  /** Yerel an (ms); frontmatter'daki `tarih`. */
  startedAt: number | null
  minutes: number | null
  completedTaskIds: string[]
  nextStep: string
  done: string[]
  taskSuggestions: string[]
  later: string[]
  issues: string[]
  decisions: string[]
}

const SECTIONS: Record<
  string,
  keyof Pick<SessionReport, 'done' | 'taskSuggestions' | 'later' | 'issues' | 'decisions'>
> = {
  yapılanlar: 'done',
  'yeni görev önerileri': 'taskSuggestions',
  sonra: 'later',
  'açık sorunlar': 'issues',
  kararlar: 'decisions',
}

function unquote(v: string): string {
  const t = v.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1)
  return t
}

/** "2026-09-27T14:30" → yerel an. */
function parseLocal(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(v.trim())
  if (!m) return null
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  )
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

/** Raporu ayrıştırır; frontmatter yoksa ya da bozuksa alanlar boş kalır, bölümler yine okunur. */
export function parseSessionReport(text: string): SessionReport {
  const t = nl(text)
  const report: SessionReport = {
    startedAt: null,
    minutes: null,
    completedTaskIds: [],
    nextStep: '',
    done: [],
    taskSuggestions: [],
    later: [],
    issues: [],
    decisions: [],
  }
  let body = t
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(t)
  if (fm) {
    body = t.slice(fm[0].length)
    for (const line of fm[1]!.split('\n')) {
      const m = /^([\p{L}_]+)\s*:\s*(.*)$/u.exec(line.replace(/\s+#.*$/, ''))
      if (!m) continue
      const key = m[1]!.toLocaleLowerCase('tr-TR')
      const value = m[2]!
      if (key === 'tarih') report.startedAt = parseLocal(unquote(value))
      else if (key === 'sure_dk') {
        const n = Number.parseInt(value, 10)
        report.minutes = Number.isFinite(n) && n > 0 ? n : null
      } else if (key === 'tamamlanan_gorevler') {
        report.completedTaskIds = value
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((x) => unquote(x))
          .filter(Boolean)
      } else if (key === 'sonraki_adim') report.nextStep = unquote(value)
    }
  }
  let field: (typeof SECTIONS)[string] | undefined
  for (const line of body.split('\n')) {
    const h = /^#{1,3}\s+(.+?)\s*$/.exec(line)
    if (h) {
      field = SECTIONS[h[1]!.toLocaleLowerCase('tr-TR')]
      continue
    }
    if (!field) continue
    const item = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/.exec(line)
    if (item && item[1] !== '...') report[field].push(item[1]!)
  }
  return report
}

// ---------------------------------------------------------------- BAGLAM.md

export type ContextInput = {
  projectName: string
  generatedAt: string
  steps: { title: string; reason: string; taskId?: string }[]
  milestone: {
    title: string
    targetDate: string | null
    daysLeft: number | null
    criteria: { text: string; done: boolean }[]
  } | null
  doing: { id: string; title: string }[]
  todo: { id: string; title: string; kind: string }[]
  criticalBugs: { id: string; title: string; playtest: number }[]
  decisions: { title: string; summary: string }[]
  leftOff: string | null
  uncommitted: number | null
  openDocs: string[]
}

/** BAGLAM.md için karakter bütçesi (~1.500 token). */
export const CONTEXT_MAX_CHARS = 6000

export function buildContext(c: ContextInput): string {
  const lines: string[] = [
    `# ${c.projectName} · bağlam`,
    '',
    `SecondMind üretti (${c.generatedAt}). Elle değiştirme; her Güncelle'de ve Başla'da yeniden yazılır.`,
  ]
  const section = (title: string, items: string[]) => {
    if (!items.length) return
    lines.push('', `## ${title}`, ...items)
  }
  section(
    'Sıradaki adımlar',
    c.steps
      .slice(0, 3)
      .map((s, i) => `${i + 1}. ${s.title}${s.taskId ? ` (${s.taskId})` : ''} — ${s.reason}`),
  )
  if (c.milestone) {
    const m = c.milestone
    const when = m.targetDate
      ? ` · hedef ${m.targetDate}${m.daysLeft !== null ? `, ${m.daysLeft} gün` : ''}`
      : ''
    section(
      `Aktif kilometre taşı: ${m.title}${when}`,
      m.criteria.map((k) => `- [${k.done ? 'x' : ' '}] ${k.text}`),
    )
  }
  section(
    'Yapılıyor',
    c.doing.map((t) => `- ${t.id} · ${t.title}`),
  )
  section(
    'Yapılacak (öncelik sırasıyla)',
    c.todo.slice(0, 10).map((t) => `- ${t.id} · ${t.title}${t.kind === 'bug' ? ' (hata)' : ''}`),
  )
  section(
    'Açık kritik hatalar',
    c.criticalBugs.map(
      (b) => `- ${b.id} · ${b.title}${b.playtest ? ` · ${b.playtest} test eden bildirdi` : ''}`,
    ),
  )
  section(
    'Son kararlar',
    c.decisions.slice(0, 5).map((d) => `- ${d.title}${d.summary ? `: ${d.summary}` : ''}`),
  )
  if (c.leftOff) section('Son oturumda nerede kalındı', [c.leftOff])
  if (c.uncommitted) section("Commit'lenmemiş", [`${c.uncommitted} dosya`])
  section(
    'Açık dokümanlar',
    c.openDocs.map((p) => `- ${p}`),
  )

  let out = lines.join('\n') + '\n'
  if (out.length > CONTEXT_MAX_CHARS)
    out = out.slice(0, CONTEXT_MAX_CHARS - 2).replace(/\n[^\n]*$/, '') + '\n…\n'
  return out
}

/** ADR gövdesinden tek cümle: "## Karar" bölümünün ilk dolu satırı. */
export function decisionSummary(bodyMd: string): string {
  const lines = nl(bodyMd).split('\n')
  const i = lines.findIndex((l) => /^#{1,3}\s+karar\s*$/i.test(l.trim()))
  if (i < 0) return ''
  for (const l of lines.slice(i + 1)) {
    if (/^#{1,3}\s/.test(l)) break
    const t = l.trim()
    if (t) return t.length > 160 ? `${t.slice(0, 157)}…` : t
  }
  return ''
}
