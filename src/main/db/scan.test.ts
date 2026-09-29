import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FoundTodo, ParsedCommit } from '../domain/scan'
import { runScan } from '../scan'
import type { Db } from './client'
import {
  closeSession,
  createProject,
  deleteProject,
  discardSession,
  listProjects,
  listSessions,
  startSession,
} from './projects'
import {
  knownCommits,
  lastSnapshot,
  recordFolderScan,
  scanTargets,
  SNAPSHOT_KEEP,
  type FolderScanInput,
} from './scan'
import * as schema from './schema'

let db: Db

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
})

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)
// Testler gerçek ~/.claude kayıtlarını okumasın.
const NO_CLAUDE = { claudeRoot: join(tmpdir(), 'sm-yok-claude') }

const commit = (
  hash: string,
  day: number,
  files = ['Assets/a.cs'],
): ParsedCommit & {
  areas: Record<string, number>
} => ({
  hash,
  author: 'Taha',
  committedAt: at(day),
  message: `commit ${hash}`,
  files: files.map((path) => ({ path, added: 1, deleted: 0 })),
  areas: { Kod: files.length },
})

const todo = (text: string, line = 1, path = 'Assets/a.cs'): FoundTodo => ({
  path,
  line,
  tag: 'TODO',
  text,
})

function input(overrides: Partial<FolderScanInput> = {}): FolderScanInput {
  const target = scanTargets(db)[0]!
  return {
    target,
    commits: [],
    todos: [],
    inventory: null,
    summary: { git: true, uncommitted: null, unity: null, inventoryFiles: null, latestMtime: null },
    filesChanged: 0,
    ...overrides,
  }
}

describe('recordFolderScan', () => {
  beforeEach(() => {
    createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: 'C:\\ajanda\\Runika' },
      at(1),
    )
  })

  it('ilk tarama: commit, not, anlık görüntü, son tarama, tek log satırı', () => {
    const r = recordFolderScan(
      db,
      input({ commits: [commit('a', 2), commit('b', 3)], todos: [todo('kamera')] }),
      at(10),
    )
    expect(r).toEqual({
      firstScan: true,
      newCommits: 2,
      uncommitted: 0,
      todosAdded: 1,
      todosResolved: 0,
      filesChanged: 0,
      claudeSessions: 0,
    })
    const target = scanTargets(db)[0]!
    expect(target.lastScanAt).toEqual(at(10))
    expect(knownCommits(db, target.folderId).latest).toEqual(at(3))
    expect(lastSnapshot(db, target.folderId)?.summary.todosOpen).toBe(1)
    const logs = db
      .select()
      .from(schema.activityLog)
      .all()
      .filter((l) => l.actor === 'scan')
    expect(logs).toHaveLength(1)
  })

  it('ikinci tarama: tekrar eden commit sayılmaz, notlar eklenir / çözülür / satırı güncellenir', () => {
    recordFolderScan(
      db,
      input({ commits: [commit('a', 2)], todos: [todo('kamera'), todo('ses', 5)] }),
      at(10),
    )
    const r = recordFolderScan(
      db,
      input({
        commits: [commit('a', 2), commit('c', 11)],
        todos: [todo('kamera', 40), todo('menü')],
      }),
      at(12),
    )
    expect(r).toMatchObject({ firstScan: false, newCommits: 1, todosAdded: 1, todosResolved: 1 })
    const rows = db.select().from(schema.codeTodos).all()
    expect(rows.find((t) => t.text === 'kamera')?.line).toBe(40)
    expect(rows.find((t) => t.text === 'ses')?.resolvedAt).toEqual(at(12))
    expect(rows.find((t) => t.text === 'kamera')?.firstSeenAt).toEqual(at(10))
  })

  it('çözülen not yeniden görünürse açılır ve yeni sayılır', () => {
    recordFolderScan(db, input({ todos: [todo('ses')] }), at(10))
    recordFolderScan(db, input({ todos: [] }), at(11))
    const r = recordFolderScan(db, input({ todos: [todo('ses')] }), at(12))
    expect(r.todosAdded).toBe(1)
    expect(db.select().from(schema.codeTodos).all()[0]!.resolvedAt).toBeNull()
  })

  it('not taranmayan türde (null) mevcut notlara dokunulmaz', () => {
    recordFolderScan(db, input({ todos: [todo('ses')] }), at(10))
    const r = recordFolderScan(db, input({ todos: null }), at(11))
    expect(r.todosResolved).toBe(0)
    expect(db.select().from(schema.codeTodos).all()[0]!.resolvedAt).toBeNull()
  })

  it(`en fazla ${SNAPSHOT_KEEP} anlık görüntü tutulur`, () => {
    for (let i = 0; i < SNAPSHOT_KEEP + 5; i++)
      recordFolderScan(db, input(), new Date(at(10).getTime() + i * 60_000))
    expect(db.select().from(schema.scanSnapshots).all()).toHaveLength(SNAPSHOT_KEEP)
  })

  it("git'siz klasörde ilk envanter fark sayılmaz", () => {
    expect(recordFolderScan(db, input({ filesChanged: 7 }), at(10)).filesChanged).toBe(0)
    expect(recordFolderScan(db, input({ filesChanged: 7 }), at(11)).filesChanged).toBe(7)
  })
})

describe('listProjects ile tarama', () => {
  it('sessizlik son commit ve klasördeki son dokunuşu da sayar; son tarama zamanı', () => {
    createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: 'C:\\r' },
      at(1),
    )
    recordFolderScan(db, input({ commits: [commit('a', 20)] }), at(25))
    const p = listProjects(db, at(28))[0]!
    expect(p.lastActivityAt).toBe(at(20).getTime())
    expect(p.silentDays).toBe(8)
    expect(p.lastScanAt).toBe(at(25).getTime())

    recordFolderScan(
      db,
      input({
        summary: {
          git: true,
          uncommitted: null,
          unity: null,
          inventoryFiles: null,
          latestMtime: at(27).getTime(),
        },
      }),
      at(28),
    )
    expect(listProjects(db, at(28))[0]!.silentDays).toBe(1)
  })

  it("arşivdeki proje Güncelle'de taranmaz, tek proje taramasında taranır", () => {
    const id = createProject(
      db,
      { name: 'Eski', kind: 'software', color: '#FF8A3D', folderPath: 'C:\\e' },
      at(1),
    )
    db.update(schema.projects).set({ status: 'archived' }).run()
    expect(scanTargets(db)).toHaveLength(0)
    expect(scanTargets(db, id)).toHaveLength(1)
  })

  it("çöp kutusundaki projenin klasörü yeni projeye geçince commit'leri de geçer", () => {
    const old = createProject(
      db,
      { name: 'Eski', kind: 'unity', color: '#3BE08F', folderPath: 'C:\\r' },
      at(1),
    )
    recordFolderScan(db, input({ commits: [commit('a', 2)] }), at(3))
    deleteProject(db, old, at(4))
    const fresh = createProject(
      db,
      { name: 'Yeni', kind: 'unity', color: '#3BE08F', folderPath: 'c:\\R' },
      at(5),
    )
    expect(db.select().from(schema.commits).all()[0]!.projectId).toBe(fresh)
  })
})

// ---------------------------------------------------------------- uçtan uca: gerçek klasör ve git

describe('runScan (geçici klasör)', () => {
  let dir: string
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Taha', '-c', 'user.email=t@x', ...args], {
      cwd: join(dir, 'oyun'),
      stdio: 'pipe',
    })
  const write = (rel: string, content: string) => {
    const file = join(dir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, content)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sm-scan-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("Unity + git: commit'ler, commit'lenmemişler, notlar, sahneler; ikinci taramada fark", async () => {
    write('oyun/ProjectSettings/ProjectVersion.txt', 'm_EditorVersion: 6000.3.18f1\n')
    write(
      'oyun/ProjectSettings/EditorBuildSettings.asset',
      'EditorBuildSettings:\n  m_Scenes:\n  - enabled: 1\n    path: Assets/Scenes/Menü.unity\n',
    )
    write('oyun/Assets/Scenes/Menü.unity', 'x')
    write('oyun/Assets/Scripts/Boss.cs', 'class Boss {\n  // TODO: faz 2 müziği\n}\n')
    write('oyun/Library/cache.cs', '// TODO kütüphane, sayılmaz')
    git('init', '-q')
    git('add', '-A')
    git('commit', '-q', '-m', 'İlk: menü sahnesi')
    write('oyun/Assets/Music/boss.wav', 'ses')

    const id = createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: join(dir, 'oyun') },
      new Date(),
    )
    const first = await runScan(db, undefined, NO_CLAUDE)
    expect(first.projects[0]).toMatchObject({
      projectId: id,
      firstScan: true,
      newCommits: 1,
      uncommitted: 1,
      todosAdded: 1,
      errors: [],
    })
    expect(first.toast).toBe('Runika ilk kez tarandı: 1 commit, 1 kod notu')

    const c = db.select().from(schema.commits).all()[0]!
    expect(c.message).toBe('İlk: menü sahnesi')
    expect(JSON.parse(c.areasJson)).toMatchObject({ Kod: 1, Sahneler: 1, Ayarlar: 2 })
    const folderId = scanTargets(db)[0]!.folderId
    const snap = lastSnapshot(db, folderId)!.summary
    expect(snap.unity).toMatchObject({
      version: '6000.3.18f1',
      scenes: ['Assets/Scenes/Menü.unity'],
      buildScenes: [{ path: 'Assets/Scenes/Menü.unity', enabled: true }],
      scripts: 1,
    })
    expect(snap.uncommitted).toMatchObject({ count: 1, areas: { Ses: 1 } })

    write('oyun/Assets/Scripts/Boss.cs', 'class Boss {\n  // FIXME geçişte ses patlıyor\n}\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'Boss müziği')
    const second = await runScan(db, undefined, NO_CLAUDE)
    expect(second.projects[0]).toMatchObject({
      firstScan: false,
      newCommits: 1,
      uncommitted: 0,
      todosAdded: 1,
      todosResolved: 1,
    })
    expect(second.toast).toBe('Runika: 1 yeni commit, 1 yeni kod notu, 1 kod notu çözüldü')
  })

  it("git'siz klasör: envanter farkı; olmayan klasör hata verir ama tarama sürer", async () => {
    write('albüm/demo1.wav', 'aaaa')
    write('albüm/kapak.png', 'p')
    createProject(
      db,
      { name: 'Albüm', kind: 'creative', color: '#F59BE6', folderPath: join(dir, 'albüm') },
      new Date(),
    )
    createProject(
      db,
      { name: 'Kayıp', kind: 'software', color: '#FF8A3D', folderPath: join(dir, 'yok') },
      new Date(),
    )

    const first = await runScan(db, undefined, NO_CLAUDE)
    expect(first.projects.find((p) => p.name === 'Kayıp')!.errors[0]).toContain('Klasör bulunamadı')
    expect(first.projects.find((p) => p.name === 'Albüm')).toMatchObject({
      firstScan: true,
      filesChanged: 0,
    })

    write('albüm/demo1.wav', 'bbbbbb')
    write('albüm/demo2.wav', 'c')
    // Sadece dokunulmuş, içeriği aynı dosya: ilk kez hash alınır, değişmiş sayılır; sonra sayılmaz.
    const t = new Date(Date.now() + 5000)
    utimesSync(join(dir, 'albüm/kapak.png'), t, t)
    const second = await runScan(db, undefined, NO_CLAUDE)
    expect(second.projects.find((p) => p.name === 'Albüm')!.filesChanged).toBe(3)

    const third = await runScan(db, undefined, NO_CLAUDE)
    expect(third.projects.find((p) => p.name === 'Albüm')!.filesChanged).toBe(0)
  })
})

// ---------------------------------------------------------------- Claude Code oturumları

describe('Claude Code oturumları', () => {
  const span = (startDay: number, startHour: number, minutes: number, files: string[] = []) => {
    const start = at(startDay, startHour).getTime()
    return {
      externalId: `s:${start}`,
      sessionId: 's',
      start,
      end: start + minutes * 60_000,
      files: files.map((path) => ({ path, area: 'Kod' })),
    }
  }
  let projectId: string

  beforeEach(() => {
    projectId = createProject(
      db,
      { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: 'C:\\ajanda\\Runika' },
      at(1),
    )
  })

  it('kesişmeyen aralık otomatik oturum olur; tekrar taramada uzar, çoğalmaz', () => {
    const r = recordFolderScan(
      db,
      input({ claudeSpans: [span(5, 20, 90, ['Assets/a.cs'])] }),
      at(6),
    )
    expect(r.claudeSessions).toBe(1)
    const again = recordFolderScan(
      db,
      input({ claudeSpans: [{ ...span(5, 20, 120, ['Assets/b.cs']) }] }),
      at(7),
    )
    expect(again.claudeSessions).toBe(0)
    const [s] = listSessions(db, projectId, 10)
    expect(s).toMatchObject({
      source: 'claude_code',
      startedAt: at(5, 20).getTime(),
      endedAt: at(5, 20).getTime() + 120 * 60_000,
      files: [
        { path: 'Assets/a.cs', area: 'Kod' },
        { path: 'Assets/b.cs', area: 'Kod' },
      ],
    })
    expect(
      db
        .select()
        .from(schema.activityLog)
        .all()
        .filter((l) => l.targetTable === 'sessions'),
    ).toHaveLength(1)
  })

  it('elle oturumla kesişen aralık ayrı kayıt olmaz, dosyaları elle oturuma eklenir', () => {
    const s = startSession(db, { projectId }, at(5, 20))
    closeSession(db, { id: s.id, leftOff: 'boss', nextStep: 'müzik' }, at(5, 22))
    const r = recordFolderScan(
      db,
      input({ claudeSpans: [span(5, 21, 90, ['Assets/Boss.cs']), span(5, 21, 90, ['x.cs'])] }),
      at(6),
    )
    expect(r.claudeSessions).toBe(0)
    const list = listSessions(db, projectId, 10)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ source: 'taha', leftOff: 'boss' })
    expect(list[0]!.files.map((f) => f.path)).toEqual(['Assets/Boss.cs', 'x.cs'])
  })

  it('çöp kutusuna atılan otomatik oturum geri gelmez', () => {
    recordFolderScan(db, input({ claudeSpans: [span(5, 20, 60)] }), at(6))
    discardSession(db, listSessions(db, projectId, 10)[0]!.id, at(6))
    const r = recordFolderScan(db, input({ claudeSpans: [span(5, 20, 60)] }), at(7))
    expect(r.claudeSessions).toBe(0)
    expect(listSessions(db, projectId, 10)).toHaveLength(0)
  })

  it('otomatik oturum projenin sıradaki adımını değiştirmez, sessizliği bitirir', () => {
    recordFolderScan(db, input({ claudeSpans: [span(20, 20, 60)] }), at(21))
    const p = listProjects(db, at(28))[0]!
    expect(p.nextStep).toBe('')
    expect(p.silentDays).toBe(8)
    expect(p.lastSession?.source).toBe('claude_code')
  })
})

describe('runScan + Claude Code kayıt klasörü', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sm-claude-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('üst klasörden açılıp proje içinde çalışılan oturum da yakalanır; komşu proje karışmaz', async () => {
    const project = join(dir, 'ajanda', 'Runika')
    mkdirSync(project, { recursive: true })
    const claude = join(dir, 'claude')
    const line = (ts: string, cwd: string, extra: object = {}) =>
      JSON.stringify({ type: 'user', timestamp: ts, cwd, sessionId: 'abc', ...extra })
    const parentDir = join(
      claude,
      `${project.replace(/[^A-Za-z0-9]/g, '-').replace(/-Runika$/, '')}`,
    )
    const ownDir = join(claude, project.replace(/[^A-Za-z0-9]/g, '-'))
    const otherDir = join(claude, `${project.replace(/[^A-Za-z0-9]/g, '-')}2`)
    for (const d of [parentDir, ownDir, otherDir])
      mkdirSync(join(d, 'yan-ajan'), { recursive: true })
    writeFileSync(
      join(parentDir, 'abc.jsonl'),
      [
        line('2026-09-01T10:00:00Z', join(dir, 'ajanda')),
        line('2026-09-01T10:05:00Z', project),
        line('2026-09-01T10:30:00Z', join(project, 'Assets'), {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Write',
                input: { file_path: join(project, 'Assets', 'Boss.cs') },
              },
            ],
          },
        }),
        '{"type":"cost-state","sessionId":"abc"}',
      ].join('\n'),
    )
    writeFileSync(
      join(ownDir, 'def.jsonl'),
      [line('2026-09-02T10:00:00Z', project), line('2026-09-02T10:02:00Z', project)].join('\n'),
    )
    writeFileSync(
      join(otherDir, 'x.jsonl'),
      [
        line('2026-09-03T10:00:00Z', `${project}2`),
        line('2026-09-03T11:00:00Z', `${project}2`),
      ].join('\n'),
    )
    const id = createProject(
      db,
      { name: 'Runika', kind: 'general', color: '#3BE08F', folderPath: project },
      new Date(),
    )

    const report = await runScan(db, undefined, { claudeRoot: claude })
    expect(report.projects[0]).toMatchObject({ claudeSessions: 1, errors: [] })
    expect(report.toast).toBe('Runika ilk kez tarandı: 1 Claude Code oturumu')
    const [s] = listSessions(db, id, 10)
    expect(s).toMatchObject({
      source: 'claude_code',
      startedAt: Date.parse('2026-09-01T10:05:00Z'),
      endedAt: Date.parse('2026-09-01T10:30:00Z'),
      files: [{ path: 'Assets/Boss.cs', area: 'Diğer' }],
    })

    const again = await runScan(db, undefined, { claudeRoot: claude })
    expect(again.projects[0]!.claudeSessions).toBe(0)
    expect(listSessions(db, id, 10)).toHaveLength(1)
  })
})
