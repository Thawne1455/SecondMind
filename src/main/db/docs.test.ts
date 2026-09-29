import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import {
  applyDocTemplate,
  createDoc,
  deleteDoc,
  gddMarkdown,
  getDoc,
  linkDocFile,
  linkedFilePath,
  listDocs,
  moveDoc,
  restoreDoc,
  searchDocs,
  updateDoc,
} from './docs'
import { createProject } from './projects'
import { suggestDocFiles } from '../scan/docs'
import { linkedPaths, projectFolderPaths } from './docs'
import * as schema from './schema'

let db: Db
let dir: string
let unity: string
let general: string

const at = (day: number) => new Date(2026, 8, day, 12)

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  dir = mkdtempSync(join(tmpdir(), 'sm-docs-'))
  mkdirSync(join(dir, 'Assets', 'Notlar'), { recursive: true })
  writeFileSync(
    join(dir, 'Assets', 'Notlar', 'GDD_Runika.md'),
    '# Runika\n\n| İçerik | Sayı |\n| --- | --- |\n| Silah | 8 |',
  )
  writeFileSync(join(dir, 'Assets', 'Notlar', 'Sesler.md'), '- menü')
  unity = createProject(
    db,
    { name: 'Runika', kind: 'unity', color: '#3BE08F', folderPath: dir },
    at(1),
  )
  general = createProject(
    db,
    { name: 'Genel', kind: 'general', color: '#FF8A3D', folderPath: null },
    at(1),
  )
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('şablon ve sayfalar', () => {
  it('Unity şablonu GDD ağacı ve Kararlar kurar; ikinci kez çalışmaz', () => {
    const docs = applyDocTemplate(db, unity, at(2))
    const roots = docs.filter((d) => d.parentId === null)
    expect(roots.map((d) => d.title)).toEqual(['Tasarım dokümanı (GDD)', 'Kararlar'])
    expect(docs.filter((d) => d.parentId === roots[0]!.id)).toHaveLength(11)
    expect(() => applyDocTemplate(db, unity, at(2))).toThrow('zaten')
  })

  it('Genel türde tek sayfayla başlar', () => {
    expect(applyDocTemplate(db, general, at(2)).map((d) => d.title)).toEqual(['Genel bakış'])
  })

  it('ADR Kararlar sayfasının altına, şablon gövdeyle açılır; Kararlar yoksa oluşur', () => {
    const adr = createDoc(db, { projectId: general, title: 'Kayıt SQLite', kind: 'adr' }, at(3))
    const parent = listDocs(db, general).find((d) => d.id === adr.parentId)!
    expect(parent.title).toBe('Kararlar')
    expect(getDoc(db, adr.id).bodyMd).toContain('## Karar')
    const second = createDoc(db, { projectId: general, title: 'İkinci', kind: 'adr' }, at(3))
    expect(second.parentId).toBe(parent.id)
  })

  it('tek GDD: yenisi işaretlenince eskisi sayfa olur', () => {
    const [gdd] = applyDocTemplate(db, unity, at(2))
    const other = createDoc(db, { projectId: unity, title: 'Yeni GDD' }, at(3))
    updateDoc(db, { id: other.id, kind: 'gdd' }, at(3))
    const docs = listDocs(db, unity)
    expect(docs.find((d) => d.id === gdd!.id)!.kind).toBe('page')
    expect(docs.find((d) => d.id === other.id)!.kind).toBe('gdd')
  })

  it('taşıma sırayı yeniden numaralar, kendi altına taşımaz', () => {
    const a = createDoc(db, { projectId: general, title: 'A' }, at(2))
    const b = createDoc(db, { projectId: general, title: 'B' }, at(2))
    const c = createDoc(db, { projectId: general, title: 'C' }, at(2))
    moveDoc(db, { id: c.id, parentId: null, index: 0 }, at(3))
    expect(listDocs(db, general).map((d) => d.title)).toEqual(['C', 'A', 'B'])
    moveDoc(db, { id: b.id, parentId: a.id, index: 0 }, at(3))
    expect(listDocs(db, general).find((d) => d.id === b.id)!.parentId).toBe(a.id)
    expect(() => moveDoc(db, { id: a.id, parentId: b.id, index: 0 }, at(3))).toThrow('kendi altına')
  })

  it('silme alt sayfalarla gider, geri alma hepsini döndürür', () => {
    const a = createDoc(db, { projectId: general, title: 'A' }, at(2))
    createDoc(db, { projectId: general, title: 'A1', parentId: a.id }, at(2))
    deleteDoc(db, a.id, at(3))
    expect(listDocs(db, general)).toHaveLength(0)
    restoreDoc(db, a.id, at(3))
    expect(listDocs(db, general).map((d) => d.title)).toEqual(['A', 'A1'])
  })

  it('arama başlık ve gövdede bulur, silineni bulmaz', () => {
    const a = createDoc(db, { projectId: general, title: 'Ses mimarisi' }, at(2))
    updateDoc(db, { id: a.id, bodyMd: 'AudioMixer snapshot kullanılacak' }, at(2))
    expect(searchDocs(db, 'snapshot').map((r) => r.id)).toEqual([a.id])
    expect(searchDocs(db, 'mimari', general)[0]!.title).toBe('Ses mimarisi')
    deleteDoc(db, a.id, at(3))
    expect(searchDocs(db, 'snapshot')).toEqual([])
  })
})

describe('bağlı dosyalar', () => {
  it('öneri bağlanmamış .md dosyalarını GDD önce verir; bağlanınca düşer', async () => {
    const list = await suggestDocFiles(projectFolderPaths(db, unity), linkedPaths(db, unity))
    expect(list.map((s) => s.relative)).toEqual([
      'Assets/Notlar/GDD_Runika.md',
      'Assets/Notlar/Sesler.md',
    ])
    const doc = linkDocFile(db, unity, list[0]!.path, at(2))
    expect(doc.kind).toBe('gdd')
    expect(doc.title).toBe('GDD Runika')
    expect(doc.linkedPath).toBe('Assets/Notlar/GDD_Runika.md')
    const after = await suggestDocFiles(projectFolderPaths(db, unity), linkedPaths(db, unity))
    expect(after.map((s) => s.relative)).toEqual(['Assets/Notlar/Sesler.md'])
  })

  it('bağlı dosya diskten okunur, salt okunurdur; klasör dışı reddedilir', () => {
    const doc = linkDocFile(db, unity, join(dir, 'Assets', 'Notlar', 'Sesler.md'), at(2))
    const full = getDoc(db, doc.id)
    expect(full).toMatchObject({ bodyMd: '- menü', readOnly: true, missing: false })
    expect(() => updateDoc(db, { id: doc.id, bodyMd: 'x' })).toThrow('salt okunur')
    expect(linkedFilePath(db, doc.id)).toBe(join(dir, 'Assets', 'Notlar', 'Sesler.md'))
    expect(() => linkDocFile(db, unity, join(tmpdir(), 'dis.md'), at(2))).toThrow(
      'klasöründe değil',
    )
    rmSync(join(dir, 'Assets', 'Notlar', 'Sesler.md'))
    expect(getDoc(db, doc.id).missing).toBe(true)
  })

  it("GDD markdown'ı sayfa ve alt sayfalarından birleşir", () => {
    applyDocTemplate(db, unity, at(2))
    const g = gddMarkdown(db, unity)!
    expect(g.markdown).toContain('## Oyun özeti')
    expect(g.markdown).toContain('| Düşman tipi |')
    expect(gddMarkdown(db, general)).toBeNull()
  })
})
