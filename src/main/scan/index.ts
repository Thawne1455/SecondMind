import { existsSync } from 'node:fs'
import type { ScanReport } from '@shared/ipc'
import type { Db } from '../db/client'
import {
  knownCommits,
  lastSnapshot,
  recordFolderScan,
  scanTargets,
  type ScanTarget,
} from '../db/scan'
import {
  areaClassifier,
  countAreas,
  defaultAreaRules,
  diffInventory,
  scanToastText,
  summarizeUncommitted,
  type FolderScanResult,
} from '../domain/scan'
import { isGitRepo, isUnityProject, readInventory, readTodos, readUnity } from './files'
import { readClaudeSpans } from './claude'
import { readCommits, readUncommitted } from './git'

// Güncelle (Aşama 5b): bağlı klasörleri sırayla tarar. Arka plan yok; sadece Taha bastığında çalışır.
// Klasörler sadece okunur. Bir klasörün hatası diğerlerini durdurmaz.

async function scanFolder(
  db: Db,
  target: ScanTarget,
  options: ScanOptions,
): Promise<FolderScanResult> {
  const root = target.path
  if (!existsSync(root)) throw new Error(`Klasör bulunamadı: ${root}`)
  const classify = areaClassifier(target.areaRules ?? defaultAreaRules(target.kind))
  const git = isGitRepo(root)
  const unity = target.kind === 'unity' || isUnityProject(root)

  const known = git ? knownCommits(db, target.folderId) : null
  const [commits, uncommittedFiles, todos, unityInfo, spans] = await Promise.all([
    known ? readCommits(root, known) : Promise.resolve([]),
    git ? readUncommitted(root) : Promise.resolve(null),
    readTodos(root, unity ? 'unity' : target.kind),
    unity ? readUnity(root) : Promise.resolve(null),
    readClaudeSpans(root, target.lastScanAt, options.claudeRoot),
  ])

  // Git'siz klasör: envanter ve önceki anlık görüntüyle fark.
  let inventory = null
  let filesChanged = 0
  if (!git) {
    const prev = lastSnapshot(db, target.folderId)?.inventory ?? null
    inventory = await readInventory(root, prev)
    if (prev) {
      const d = diffInventory(prev, inventory)
      filesChanged = d.added.length + d.changed.length + d.removed.length
    }
  }

  const uncommitted = uncommittedFiles ? summarizeUncommitted(uncommittedFiles, classify) : null
  const mtimes = [
    ...(uncommittedFiles ?? []).map((f) => f.mtime),
    ...Object.values(inventory ?? {}).map((e) => e.mtime),
  ].filter((t): t is number => t !== null)

  return recordFolderScan(db, {
    target,
    commits: commits.map((c) => ({
      ...c,
      areas: countAreas(
        c.files.map((f) => f.path),
        classify,
      ),
    })),
    todos,
    inventory,
    summary: {
      git,
      uncommitted,
      unity: unityInfo,
      inventoryFiles: inventory ? Object.keys(inventory).length : null,
      latestMtime: mtimes.length ? Math.max(...mtimes) : null,
    },
    filesChanged,
    claudeSpans: spans?.map((sp) => ({
      ...sp,
      files: sp.files.map((path) => ({ path, area: classify(path) })),
    })),
  })
}

/** Tüm projeler (arşiv hariç) ya da tek proje. Proje başına sonuçlar birleştirilir. */
export type ScanOptions = {
  /** Claude Code kayıt klasörü; testlerde değiştirilir. */
  claudeRoot?: string
}

export async function runScan(
  db: Db,
  projectId?: string,
  options: ScanOptions = {},
): Promise<ScanReport> {
  const targets = scanTargets(db, projectId)
  const byProject = new Map<string, ScanReport['projects'][number]>()
  for (const target of targets) {
    const entry = byProject.get(target.projectId) ?? {
      projectId: target.projectId,
      name: target.projectName,
      firstScan: false,
      newCommits: 0,
      uncommitted: 0,
      todosAdded: 0,
      todosResolved: 0,
      filesChanged: 0,
      claudeSessions: 0,
      errors: [],
    }
    byProject.set(target.projectId, entry)
    try {
      const r = await scanFolder(db, target, options)
      entry.firstScan ||= r.firstScan
      entry.newCommits += r.newCommits
      entry.uncommitted += r.uncommitted
      entry.todosAdded += r.todosAdded
      entry.todosResolved += r.todosResolved
      entry.filesChanged += r.filesChanged
      entry.claudeSessions += r.claudeSessions
    } catch (e) {
      entry.errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  const projects = [...byProject.values()]
  return {
    folders: targets.length,
    projects,
    toast: scanToastText(projects.map((p) => ({ name: p.name, result: p }))),
  }
}
