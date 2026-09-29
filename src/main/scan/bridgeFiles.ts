import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  addClaudeBlock,
  addGitignoreLine,
  BRIDGE_DIR,
  CONTEXT_FILE,
  DOCS_DIR,
  EDITOR_SCRIPT,
  hasClaudeBlock,
  hasGitignoreLine,
  PROCESSED_DIR,
  removeClaudeBlock,
  removeGitignoreLine,
  REPORTS_DIR,
  SHOTS_DIR,
} from '../domain/bridge'

// Claude Code köprüsünün dosya işlemleri (5e). Proje klasörüne sadece köprü kurulumuyla ve Taha'nın seçtikleriyle
// yazar: `.secondmind/`, CLAUDE.md'nin işaretli bölümü, Unity'de `Assets/Editor/SecondMindSnapshot.cs`,
// isterse `.gitignore` satırı. Kaldırma sadece bunları geri alır; oturum raporları ve kareler (Taha'nın verisi) kalır.

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

export type BridgeFileStatus = {
  dir: boolean
  claudeMd: boolean
  script: boolean
  gitignore: boolean
  git: boolean
  pendingReports: number
}

export function bridgeFileStatus(root: string): BridgeFileStatus {
  return {
    dir: existsSync(join(root, BRIDGE_DIR)),
    claudeMd: hasClaudeBlock(read(join(root, 'CLAUDE.md'))),
    script: existsSync(join(root, EDITOR_SCRIPT)),
    gitignore: hasGitignoreLine(read(join(root, '.gitignore'))),
    git: existsSync(join(root, '.git')),
    pendingReports: reportFiles(root).length,
  }
}

export type InstallOptions = {
  claudeMd: boolean
  script: boolean
  gitignore: boolean
  addendum: string
  scriptText: string
}

export function installBridgeFiles(root: string, o: InstallOptions): void {
  if (!existsSync(root)) throw new Error(`Klasör bulunamadı: ${root}`)
  mkdirSync(join(root, BRIDGE_DIR, REPORTS_DIR), { recursive: true })
  mkdirSync(join(root, BRIDGE_DIR, SHOTS_DIR), { recursive: true })
  if (o.claudeMd) {
    const path = join(root, 'CLAUDE.md')
    writeFileSync(path, addClaudeBlock(read(path), o.addendum))
  }
  if (o.script) {
    const path = join(root, EDITOR_SCRIPT)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, o.scriptText)
  }
  if (o.gitignore) {
    const path = join(root, '.gitignore')
    writeFileSync(path, addGitignoreLine(read(path)))
  }
}

export function uninstallBridgeFiles(root: string): void {
  if (!existsSync(root)) return
  const claude = join(root, 'CLAUDE.md')
  if (existsSync(claude)) {
    const next = removeClaudeBlock(read(claude))
    // Dosyayı köprü açtıysa ve içinde başka bir şey kalmadıysa silinir.
    if (next.trim()) writeFileSync(claude, next)
    else rmSync(claude)
  }
  for (const f of [EDITOR_SCRIPT, `${EDITOR_SCRIPT}.meta`]) rmSync(join(root, f), { force: true })
  const ignore = join(root, '.gitignore')
  if (existsSync(ignore)) writeFileSync(ignore, removeGitignoreLine(read(ignore)))
  rmSync(join(root, BRIDGE_DIR, CONTEXT_FILE), { force: true })
  rmSync(join(root, BRIDGE_DIR, DOCS_DIR), { recursive: true, force: true })
}

/** BAGLAM.md ve Claude Code'a açık dokümanların kopyası (`.secondmind/dokumanlar/`, her seferinde baştan). */
export function writeContextFiles(
  root: string,
  context: string,
  docs: readonly { name: string; body: string }[],
): void {
  const dir = join(root, BRIDGE_DIR)
  if (!existsSync(dir)) return
  writeFileSync(join(dir, CONTEXT_FILE), context)
  const docsDir = join(dir, DOCS_DIR)
  rmSync(docsDir, { recursive: true, force: true })
  if (docs.length) {
    mkdirSync(docsDir, { recursive: true })
    for (const d of docs) writeFileSync(join(docsDir, d.name), d.body)
  }
}

/** İşlenmemiş oturum raporları (`oturumlar/*.md`), eskiden yeniye. */
export function reportFiles(root: string): string[] {
  const dir = join(root, BRIDGE_DIR, REPORTS_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.md') && statSync(join(dir, n)).isFile())
    .sort()
}

export const readReport = (root: string, name: string) =>
  readFileSync(join(root, BRIDGE_DIR, REPORTS_DIR, name), 'utf8')

/** İşlenen raporu `oturumlar/islendi/` altına taşır. */
export function markReportProcessed(root: string, name: string): void {
  const dir = join(root, BRIDGE_DIR, REPORTS_DIR)
  mkdirSync(join(dir, PROCESSED_DIR), { recursive: true })
  renameSync(join(dir, name), join(dir, PROCESSED_DIR, name))
}
