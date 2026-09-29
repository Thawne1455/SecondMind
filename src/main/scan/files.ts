import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fg from 'fast-glob'
import {
  codeExtensions,
  findTodos,
  IGNORE_GLOBS,
  parseBuildScenes,
  needsHash,
  type FoundTodo,
  type Inventory,
  type ScanKind,
  type SnapshotSummary,
} from '../domain/scan'
import { parseUnityVersion } from '../domain/projects'

// Klasör okuma (Aşama 5b): koddaki notlar, Unity bilgisi, git'siz envanter. Proje klasörüne asla yazmaz.

/** Not taramasında bu boyuttan büyük dosya okunmaz (üretilmiş / gömülü kod). */
const TODO_MAX_BYTES = 512 * 1024
const TODO_MAX_FILES = 5000
/** Envanterde bundan büyük dosyanın hash'i alınmaz; boyut/mtime yeter. */
const HASH_MAX_BYTES = 256 * 1024 * 1024
const INVENTORY_MAX_FILES = 20000

const GLOB_OPTIONS = {
  ignore: IGNORE_GLOBS,
  dot: false,
  onlyFiles: true,
  suppressErrors: true,
  followSymbolicLinks: false,
  caseSensitiveMatch: false,
}

const glob = (cwd: string, patterns: string[]) => fg(patterns, { cwd, ...GLOB_OPTIONS })

/** Boyut ve mtime ile birlikte. */
const globStats = (cwd: string, patterns: string[]) =>
  fg(patterns, { cwd, ...GLOB_OPTIONS, stats: true, objectMode: true })

/** Unity'de sadece `.cs`; Yazılım'da kaynak uzantıları. Diğer türlerde not taranmaz (null). */
export async function readTodos(root: string, kind: ScanKind): Promise<FoundTodo[] | null> {
  if (kind !== 'unity' && kind !== 'software') return null
  const patterns = kind === 'unity' ? ['Assets/**/*.cs'] : [`**/*.{${codeExtensions().join(',')}}`]
  const entries = await globStats(root, patterns)
  const files = entries
    .filter((e) => (e.stats?.size ?? 0) <= TODO_MAX_BYTES)
    .slice(0, TODO_MAX_FILES)
  const found: FoundTodo[] = []
  for (const f of files) {
    const content = await readFile(join(root, f.path), 'utf8').catch(() => null)
    if (content && /TODO|FIXME|HACK/.test(content)) found.push(...findTodos(f.path, content))
  }
  return found.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
}

/** Unity sürümü, sahneler, yapıdaki sahne sırası, script sayısı ve kabaca satır sayısı. */
export async function readUnity(root: string): Promise<NonNullable<SnapshotSummary['unity']>> {
  const versionText = await readFile(
    join(root, 'ProjectSettings', 'ProjectVersion.txt'),
    'utf8',
  ).catch(() => '')
  const buildText = await readFile(
    join(root, 'ProjectSettings', 'EditorBuildSettings.asset'),
    'utf8',
  ).catch(() => '')
  const scenes = (await glob(root, ['Assets/**/*.unity'])).sort()
  const scripts = await glob(root, ['Assets/**/*.cs'])
  let scriptLines = 0
  for (const s of scripts) {
    const content = await readFile(join(root, s), 'utf8').catch(() => '')
    if (content) scriptLines += content.split('\n').length
  }
  return {
    version: parseUnityVersion(versionText),
    scenes,
    buildScenes: parseBuildScenes(buildText),
    scripts: scripts.length,
    scriptLines,
  }
}

function hashFile(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const h = createHash('sha1')
    createReadStream(path)
      .on('data', (chunk) => h.update(chunk))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', () => resolve(null))
  })
}

/**
 * Git'siz klasör envanteri: yol → boyut, mtime, hash. Hash sadece önceden bilinen bir dosyanın boyutu ya da
 * mtime'ı değişince hesaplanır (yeni dosya zaten "yeni"; ilk taramada hiç hash yok).
 */
export async function readInventory(root: string, prev: Inventory | null): Promise<Inventory> {
  const entries = (await globStats(root, ['**/*'])).slice(0, INVENTORY_MAX_FILES)
  const inv: Inventory = {}
  for (const e of entries) {
    const size = e.stats?.size ?? 0
    const mtime = Math.round(e.stats?.mtimeMs ?? 0)
    const before = prev?.[e.path]
    const hash = needsHash(before, size, mtime)
      ? size <= HASH_MAX_BYTES
        ? await hashFile(join(root, e.path))
        : null
      : (before?.hash ?? null)
    inv[e.path] = { size, mtime, hash }
  }
  return inv
}

export const isGitRepo = (root: string): boolean => existsSync(join(root, '.git'))
export const isUnityProject = (root: string): boolean =>
  existsSync(join(root, 'ProjectSettings', 'ProjectVersion.txt'))
