import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import { setBridgeEnabled } from '../db/bridge'
import { createDoc, updateDoc } from '../db/docs'
import { createTask } from '../db/planning'
import { listLog } from '../db/projectLog'
import { createProject } from '../db/projects'
import * as schema from '../db/schema'
import { processReports, refreshContext } from './bridge'
import { bridgeFileStatus, installBridgeFiles, uninstallBridgeFiles } from './bridgeFiles'

let db: Db
let dir: string
let id: string
let folderId: string

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)
const OWN_CLAUDE = '# Runika\n\nKendi kurallarım.\n'

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  dir = mkdtempSync(join(tmpdir(), 'sm-bridge-'))
  writeFileSync(join(dir, 'CLAUDE.md'), OWN_CLAUDE)
  writeFileSync(join(dir, '.gitignore'), 'Library/\n')
  mkdirSync(join(dir, 'Assets'))
  id = createProject(
    db,
    { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: dir },
    at(1),
  )
  folderId = db.select().from(schema.projectFolders).get()!.id
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const install = () => {
  installBridgeFiles(dir, {
    claudeMd: true,
    script: true,
    gitignore: true,
    addendum: '## SecondMind köprüsü\n\nOku.',
    scriptText: '// betik',
  })
  setBridgeEnabled(db, folderId, true, at(2))
}

describe('köprü', () => {
  it('kurulum: klasörler, CLAUDE.md bölümü, betik, .gitignore; kaldırma hepsini geri alır, raporlar kalır', () => {
    install()
    expect(bridgeFileStatus(dir)).toMatchObject({
      dir: true,
      claudeMd: true,
      script: true,
      gitignore: true,
    })
    writeFileSync(join(dir, '.secondmind', 'oturumlar', 'kalsin.md'), 'x')
    uninstallBridgeFiles(dir)
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe(OWN_CLAUDE)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('Library/\n')
    expect(existsSync(join(dir, 'Assets', 'Editor', 'SecondMindSnapshot.cs'))).toBe(false)
    expect(existsSync(join(dir, '.secondmind', 'oturumlar', 'kalsin.md'))).toBe(true)
  })

  it("BAGLAM.md: görevler id'leriyle, kararlar, açık dokümanlar dışa verilir", () => {
    install()
    const t = createTask(
      db,
      { title: 'Ölüm paneli tuşları', projectId: id, kind: 'bug', severity: 'critical' },
      at(2),
    )
    const adr = createDoc(db, { projectId: id, title: 'AudioMixer snapshot', kind: 'adr' }, at(2))
    updateDoc(db, { id: adr.id, bodyMd: '## Karar\n\nGeçişler snapshot ile.' }, at(2))
    const page = createDoc(db, { projectId: id, title: 'Mimari' }, at(2))
    updateDoc(db, { id: page.id, bodyMd: 'Katmanlar', aiOpen: true }, at(2))
    refreshContext(db, id, at(3))
    const ctx = readFileSync(join(dir, '.secondmind', 'BAGLAM.md'), 'utf8')
    expect(ctx).toContain(`${t.id} · Ölüm paneli tuşları`)
    expect(ctx).toContain('## Açık kritik hatalar')
    expect(ctx).toContain('- AudioMixer snapshot: Geçişler snapshot ile.')
    expect(ctx).toMatch(/\.secondmind\/dokumanlar\/mimari-[a-z0-9]{4}\.md/)
  })

  it("oturum raporu: Günlük'e girer, Claude Code oturumu açılır, dosya islendi/'ye taşınır; ikinci kez işlenmez", () => {
    install()
    const report = [
      '---',
      'tarih: 2026-09-27T14:30',
      'sure_dk: 95',
      'sonraki_adim: "Boss fazı 2 müziğini hızlandır"',
      '---',
      '## Yapılanlar',
      '- Menü sahnesinde ses geçişleri eklendi',
      '## Yeni görev önerileri',
      '- [ ] Ses kaydırıcıları',
    ].join('\n')
    writeFileSync(join(dir, '.secondmind', 'oturumlar', '2026-09-27-1430.md'), report)
    expect(processReports(db, id, dir, at(28))).toBe(1)
    expect(existsSync(join(dir, '.secondmind', 'oturumlar', 'islendi', '2026-09-27-1430.md'))).toBe(
      true,
    )
    const session = db.select().from(schema.sessions).get()!
    expect(session).toMatchObject({
      source: 'claude_code',
      leftOff: 'Menü sahnesinde ses geçişleri eklendi',
      nextStep: 'Boss fazı 2 müziğini hızlandır',
    })
    expect(session.endedAt!.getTime() - session.startedAt.getTime()).toBe(95 * 60_000)
    const day = listLog(db, id, '2026-09-27', at(28)).days[0]!
    expect(day.items.map((i) => i.kind).sort()).toEqual(['report', 'session'])
    const item = day.items.find((i) => i.kind === 'report')!
    expect(item).toMatchObject({ taskSuggestions: ['Ses kaydırıcıları'], minutes: 95 })

    // Aynı rapor yeniden gelirse (elle geri kopyalandı) tekrar uygulanmaz.
    writeFileSync(join(dir, '.secondmind', 'oturumlar', '2026-09-27-1430.md'), report)
    expect(processReports(db, id, dir, at(28))).toBe(0)
  })
})
