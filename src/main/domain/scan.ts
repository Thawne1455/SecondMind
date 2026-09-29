import picomatch from 'picomatch'

// Proje klasörü taraması (Aşama 5b): saf ayrıştırıcılar ve farklar. Dosya sistemi ve git çağrıları src/main/scan/'da.
// Yollar klasöre göre göreli ve ileri eğik çizgili ("Assets/Scripts/Boss.cs").

export type ScanKind = 'unity' | 'software' | 'creative' | 'general'

/** Alan kuralı: bir alan adı ve onu tanımlayan glob'lar. İlk eşleşen kural kazanır. */
export type AreaRule = { area: string; globs: string[] }

export const OTHER_AREA = 'Diğer'

/** Her taramada yok sayılanlar (PROJELER.md > Tarama). */
export const IGNORE_GLOBS = [
  '**/.git/**',
  '**/Library/**',
  '**/Temp/**',
  '**/Logs/**',
  '**/obj/**',
  '**/Build/**',
  '**/Builds/**',
  '**/UserSettings/**',
  '**/_Recovery/**',
  '**/*.meta',
  '**/node_modules/**',
  '**/out/**',
  '**/dist/**',
  '**/.secondmind/**',
]

const UNITY_RULES: AreaRule[] = [
  { area: 'Kod', globs: ['Assets/**/*.cs'] },
  { area: 'Sahneler', globs: ['Assets/**/*.unity'] },
  { area: 'Prefab', globs: ['Assets/**/*.prefab'] },
  {
    area: 'Ses',
    globs: ['Assets/**/{Audio,Sound,Sounds,Music,SFX}/**', '**/*.{wav,mp3,ogg}'],
  },
  {
    area: 'Görsel',
    globs: ['Assets/**/*.{png,psd,jpg,aseprite}', 'Assets/**/{Art,Sprites,Textures,Models}/**'],
  },
  { area: 'Animasyon', globs: ['Assets/**/*.{anim,controller}'] },
  { area: 'Veri', globs: ['Assets/**/*.asset'] },
  { area: 'Doküman', globs: ['**/*.md'] },
  { area: 'Ayarlar', globs: ['ProjectSettings/**', 'Packages/manifest.json'] },
]

const SOFTWARE_RULES: AreaRule[] = [
  { area: 'Test', globs: ['**/*.{test,spec}.*', '**/{test,tests,__tests__}/**'] },
  { area: 'Doküman', globs: ['**/*.md', 'docs/**'] },
  {
    area: 'Ayarlar',
    globs: [
      '*.{json,yaml,yml,toml}',
      '*.config.*',
      '.*rc*',
      '**/package-lock.json',
      '**/migrations/**',
    ],
  },
  { area: 'Görsel', globs: ['**/*.{png,jpg,jpeg,gif,svg,webp,ico,psd}'] },
  { area: 'Kod', globs: [`**/*.{${codeExtensions().join(',')}}`] },
]

const CREATIVE_RULES: AreaRule[] = [
  { area: 'Ses', globs: ['**/*.{wav,mp3,ogg,flac,aif,aiff,m4a,als,flp,logicx,ptx,mid,midi}'] },
  { area: 'Görsel', globs: ['**/*.{png,jpg,jpeg,gif,webp,psd,kra,clip,aseprite,ai,svg,tif,tiff}'] },
  { area: 'Video', globs: ['**/*.{mp4,mov,mkv,webm,prproj,drp}'] },
  { area: 'Metin', globs: ['**/*.{md,txt,docx,odt,pdf,fountain}'] },
]

/** Türün varsayılan alan kuralları; `project_folders.area_rules_json` null ise bunlar. */
export function defaultAreaRules(kind: ScanKind): AreaRule[] {
  if (kind === 'unity') return UNITY_RULES
  if (kind === 'software') return SOFTWARE_RULES
  return CREATIVE_RULES
}

/** Kod notu taranan kaynak uzantıları (Yazılım türü). Unity'de sadece `.cs`. */
export function codeExtensions(): string[] {
  return [
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'py',
    'cs',
    'go',
    'rs',
    'java',
    'kt',
    'c',
    'h',
    'cpp',
    'hpp',
    'swift',
    'lua',
    'gd',
    'shader',
    'hlsl',
  ]
}

/** Glob'ları bir kez derleyen sınıflandırıcı. Büyük/küçük harf duyarsız (Windows). */
export function areaClassifier(rules: readonly AreaRule[]): (path: string) => string {
  const matchers = rules.map((r) => ({
    area: r.area,
    test: picomatch(r.globs, { nocase: true, dot: true }),
  }))
  return (path) => matchers.find((m) => m.test(path))?.area ?? OTHER_AREA
}

/** Alan → dosya sayısı; en kalabalık alan önce. */
export function countAreas(
  paths: readonly string[],
  classify: (path: string) => string,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const p of paths) {
    const a = classify(p)
    counts[a] = (counts[a] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]))
}

// ---------------------------------------------------------------- git log

export type CommitFile = { path: string; added: number; deleted: number }
export type ParsedCommit = {
  hash: string
  author: string
  committedAt: Date
  message: string
  files: CommitFile[]
}

/** `git log` için biçim: kayıt ayracı 0x1e, alan ayracı 0x1f, ardından `--numstat` satırları. */
export const GIT_LOG_FORMAT = '%x1e%H%x1f%an%x1f%ct%x1f%s'

/** numstat'taki yeniden adlandırma: `src/{eski => yeni}/a.ts` ya da `eski.ts => yeni.ts` → yeni yol. */
export function renamedPath(raw: string): string {
  const braced = raw.match(/^(.*)\{(.*) => (.*)\}(.*)$/)
  if (braced) {
    const [, pre, , to, post] = braced
    return `${pre}${to}${post}`.replace(/\/{2,}/g, '/')
  }
  const plain = raw.split(' => ')
  return plain.length === 2 ? plain[1]! : raw
}

export function parseGitLog(raw: string): ParsedCommit[] {
  const commits: ParsedCommit[] = []
  for (const record of raw.split('\x1e')) {
    const lines = record.split('\n')
    const header = lines[0]?.split('\x1f')
    if (!header || header.length < 4) continue
    const [hash, author, ts, ...rest] = header
    const files: CommitFile[] = []
    for (const line of lines.slice(1)) {
      const m = line.match(/^(-|\d+)\t(-|\d+)\t(.+)$/)
      if (!m) continue
      files.push({
        path: renamedPath(m[3]!),
        // İkili dosyada git "-" yazar: satır sayısı yok.
        added: m[1] === '-' ? 0 : Number(m[1]),
        deleted: m[2] === '-' ? 0 : Number(m[2]),
      })
    }
    commits.push({
      hash: hash!,
      author: author!,
      committedAt: new Date(Number(ts) * 1000),
      message: rest.join('\x1f').trim(),
      files,
    })
  }
  return commits
}

// ---------------------------------------------------------------- git status

export type StatusEntry = { path: string; code: string }

/** `git status --porcelain=v1 -z`: "XY yol\0"; yeniden adlandırmada ardından eski yol gelir (atlanır). */
export function parsePorcelainZ(raw: string): StatusEntry[] {
  const parts = raw.split('\0')
  const out: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part.length < 4) continue
    const code = part.slice(0, 2)
    out.push({ path: part.slice(3), code: code.trim() || code })
    if (code[0] === 'R' || code[0] === 'C') i++
  }
  return out
}

export type UncommittedSummary = {
  count: number
  areas: Record<string, number>
  /** En eski değişikliğin mtime'ı (Unix ms); silinmiş dosyaların mtime'ı yok. */
  oldestAt: number | null
  files: { path: string; mtime: number | null }[]
}

export function summarizeUncommitted(
  files: readonly { path: string; mtime: number | null }[],
  classify: (path: string) => string,
): UncommittedSummary {
  const times = files.map((f) => f.mtime).filter((t): t is number => t !== null)
  return {
    count: files.length,
    areas: countAreas(
      files.map((f) => f.path),
      classify,
    ),
    oldestAt: times.length ? Math.min(...times) : null,
    // Anlık görüntü şişmesin: en eski 50 dosya.
    files: [...files].sort((a, b) => (a.mtime ?? 0) - (b.mtime ?? 0)).slice(0, 50),
  }
}

// ---------------------------------------------------------------- koddaki notlar

export type TodoTag = 'TODO' | 'FIXME' | 'HACK'
export type FoundTodo = { path: string; line: number; tag: TodoTag; text: string }

// Yorum işaretinin hemen ardından gelen büyük harf etiket (`//`, `#`, `/*`, satır başı `*`, `<!--`, `--`, `;`).
// Satırın geri kalanını yutmaz: tırnak içindeki ilk eşleşme atlanınca sonraki denenebilsin.
const TODO_RE = /(?:\/\/+|#|\/\*+|^\s*\*|<!--|--|;)\s*(TODO|FIXME|HACK)\b[\s:(\-–]*/g

/** Satırın bu noktası bir metin (string) içinde mi: öncesinde kapanmamış tırnak var mı. */
function insideString(prefix: string): boolean {
  let open: string | null = null
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i]!
    if (ch === '\\') {
      i++
      continue
    }
    if (open) {
      if (ch === open) open = null
    } else if (ch === '"' || ch === "'" || ch === '`') {
      open = ch
    }
  }
  return open !== null
}

/** Tırnak içindeki yorum işaretleri (test verisi, örnek metin) not sayılmaz. */
export function findTodos(path: string, content: string): FoundTodo[] {
  const out: FoundTodo[] = []
  const lines = content.split(/\r?\n/)
  lines.forEach((line, i) => {
    const m = [...line.matchAll(TODO_RE)].find((x) => !insideString(line.slice(0, x.index)))
    if (!m) return
    const text = line
      .slice(m.index + m[0].length)
      .replace(/\*\/\s*$|-->\s*$/, '')
      .replace(/^\)\s*:?\s*/, '')
      .trim()
    out.push({ path, line: i + 1, tag: m[1] as TodoTag, text: text.slice(0, 300) })
  })
  return out
}

/**
 * Notun kimliği: yol + etiket + metin (satır numarası kod kaydıkça değişir).
 * Aynı dosyada aynı metinli iki not sırayla #2, #3 alır.
 */
export function todoKeys(todos: readonly FoundTodo[]): string[] {
  const seen = new Map<string, number>()
  return todos.map((t) => {
    const base = `${t.path.toLowerCase()}|${t.tag}|${t.text.replace(/\s+/g, ' ').toLowerCase()}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}#${n}`
  })
}

export type KeyDiff = { added: string[]; resolved: string[]; kept: string[] }

/** Önceki ve şimdiki anahtar kümeleri: yeniler eklendi, kaybolanlar çözüldü. */
export function diffKeys(previous: Iterable<string>, current: Iterable<string>): KeyDiff {
  const prev = new Set(previous)
  const cur = new Set(current)
  return {
    added: [...cur].filter((k) => !prev.has(k)),
    resolved: [...prev].filter((k) => !cur.has(k)),
    kept: [...cur].filter((k) => prev.has(k)),
  }
}

// ---------------------------------------------------------------- Unity

export type BuildScene = { path: string; enabled: boolean }

/** `ProjectSettings/EditorBuildSettings.asset` (YAML) → yapıdaki sahneler, sırayla. */
export function parseBuildScenes(yaml: string): BuildScene[] {
  const out: BuildScene[] = []
  let inScenes = false
  for (const line of yaml.split(/\r?\n/)) {
    if (!inScenes) {
      inScenes = /^\s*m_Scenes:\s*$/.test(line)
      continue
    }
    const item = line.match(/^\s*-\s+(\w+):\s*(.*)$/)
    if (item) {
      out.push({ path: '', enabled: true })
      setField(item[1]!, item[2]!)
      continue
    }
    const field = line.match(/^\s{3,}(\w+):\s*(.*)$/)
    if (field && out.length) {
      setField(field[1]!, field[2]!)
      continue
    }
    break
  }
  return out.filter((s) => s.path)

  function setField(key: string, value: string) {
    const scene = out[out.length - 1]!
    if (key === 'enabled') scene.enabled = value.trim() !== '0'
    if (key === 'path') scene.path = value.trim()
  }
}

// ---------------------------------------------------------------- git'siz envanter

export type InventoryEntry = { size: number; mtime: number; hash: string | null }
export type Inventory = Record<string, InventoryEntry>

/**
 * Hash sadece önceden bilinen dosyanın boyutu ya da mtime'ı değişince hesaplanır. Yeni dosya zaten "yeni";
 * dokunulmamış dosya önceki hash'ini (ya da hash'sizliğini) korur. Böylece büyük klasör her taramada okunmaz.
 */
export function needsHash(prev: InventoryEntry | undefined, size: number, mtime: number): boolean {
  return prev !== undefined && (prev.size !== size || prev.mtime !== mtime)
}

export type InventoryDiff = { added: string[]; changed: string[]; removed: string[] }

/** Değişen = içerik farklı. Hash yoksa (ilk kez görülen büyük dosya) boyut/mtime'a bakılır. */
export function diffInventory(prev: Inventory, cur: Inventory): InventoryDiff {
  const added: string[] = []
  const changed: string[] = []
  for (const [path, e] of Object.entries(cur)) {
    const p = prev[path]
    if (!p) added.push(path)
    else if (p.hash && e.hash ? p.hash !== e.hash : p.size !== e.size || p.mtime !== e.mtime)
      changed.push(path)
  }
  const removed = Object.keys(prev).filter((path) => !(path in cur))
  return { added, changed, removed }
}

// ---------------------------------------------------------------- tarama özeti

export type FolderScanResult = {
  /** Klasörün ilk taraması: sayılar "yeni" değil, başlangıç envanteri. */
  firstScan: boolean
  newCommits: number
  uncommitted: number
  todosAdded: number
  todosResolved: number
  /** Git'siz klasörde yeni + değişen + silinen dosya (ilk taramada 0). */
  filesChanged: number
  /** Claude Code kayıtlarından yeni eklenen oturumlar (elle oturumu zenginleştirenler sayılmaz). */
  claudeSessions: number
}

/**
 * Toast metni: "Runika: 4 yeni commit · Albüm: 2 dosya değişti". İlk tarama ayrı söylenir
 * ("Runika ilk kez tarandı: 218 commit, 12 kod notu"). Hiçbir şey yoksa null.
 */
export function scanToastText(
  results: readonly { name: string; result: FolderScanResult }[],
): string | null {
  const parts: string[] = []
  for (const { name, result: r } of results) {
    const bits: string[] = []
    if (r.firstScan) {
      if (r.newCommits) bits.push(`${r.newCommits} commit`)
      if (r.todosAdded) bits.push(`${r.todosAdded} kod notu`)
      if (r.claudeSessions) bits.push(`${r.claudeSessions} Claude Code oturumu`)
      parts.push(
        bits.length ? `${name} ilk kez tarandı: ${bits.join(', ')}` : `${name} ilk kez tarandı`,
      )
      continue
    }
    if (r.newCommits) bits.push(`${r.newCommits} yeni commit`)
    if (r.filesChanged) bits.push(`${r.filesChanged} dosya değişti`)
    if (r.todosAdded) bits.push(`${r.todosAdded} yeni kod notu`)
    if (r.todosResolved) bits.push(`${r.todosResolved} kod notu çözüldü`)
    if (r.claudeSessions) bits.push(`${r.claudeSessions} Claude Code oturumu`)
    if (bits.length) parts.push(`${name}: ${bits.join(', ')}`)
  }
  return parts.length ? parts.join(' · ') : null
}

/** Taramanın anlık görüntüsü (`scan_snapshots.summary_json`). Brifing ve Kokpit karoları okur. */
export type SnapshotSummary = {
  git: boolean
  /** Git'li klasörde commit'lenmemiş değişiklikler; git yoksa null. */
  uncommitted: UncommittedSummary | null
  unity: {
    version: string | null
    scenes: string[]
    buildScenes: BuildScene[]
    scripts: number
    scriptLines: number
  } | null
  /** Açık kod notu sayısı; not taranmayan türde null. */
  todosOpen: number | null
  /** Git'siz klasörde dosya sayısı. */
  inventoryFiles: number | null
  /** Klasördeki son dokunuş (commit'lenmemiş ya da envanterdeki en yeni mtime); sessizlik için. */
  latestMtime: number | null
  result: FolderScanResult
}

/** Sessizlik için son dokunuş: oturum, commit ya da dosya değişikliği, hangisi en yeniyse. */
export function lastTouch(...times: (number | null | undefined)[]): number {
  return Math.max(0, ...times.filter((t): t is number => typeof t === 'number'))
}
