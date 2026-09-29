import { existsSync, readFileSync, statSync } from 'node:fs'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import type {
  Doc,
  DocCreateInput,
  DocMoveInput,
  DocSearchResult,
  DocSummary,
  DocUpdateInput,
} from '@shared/ipc'
import {
  adrBody,
  DECISIONS_TITLE,
  docTemplate,
  looksLikeGdd,
  relativeInside,
  titleFromPath,
  type TemplateNode,
} from '../domain/docTemplates'
import { ftsQuery, parseSnippet, SNIPPET_CLOSE, SNIPPET_OPEN } from '../domain/knowledge'
import { logActivity, logUpdateMerged } from './activity'
import type { Db, DbTx } from './client'
import { NOTE_LOG_MERGE_MS } from './knowledge'
import { activityLog, projectDocs, projectFolders, projects } from './schema'

// Proje dokümantasyonu (Aşama 5d-1): sayfa ağacı, şablonlar, ADR, bağlı dosya sayfaları, GDD işareti.
// Bağlı dosya proje klasöründen okunur, asla yazılmaz. Her yazım activity_log'a; silme alt ağacı tek grupla atar.

type DocRow = typeof projectDocs.$inferSelect

/** Bağlı dosya sayfasında gösterilecek en büyük dosya. */
const LINKED_MAX_BYTES = 2 * 1024 * 1024

function log(
  db: Db | DbTx,
  action: 'create' | 'update' | 'delete' | 'restore',
  after: { id: string },
  before?: object,
  groupId?: string,
): void {
  logActivity(db, {
    actor: 'taha',
    action,
    targetTable: 'project_docs',
    targetId: after.id,
    before,
    after,
    groupId,
  })
}

function folderPaths(db: Db | DbTx, projectId: string): string[] {
  return db
    .select({ path: projectFolders.path })
    .from(projectFolders)
    .where(eq(projectFolders.projectId, projectId))
    .all()
    .map((f) => f.path)
}

/** Bağlı dosyanın klasöre göre göreli yolu; klasörlerin dışındaysa null. */
function linkedRelative(folders: readonly string[], path: string): string | null {
  for (const f of folders) {
    const rel = relativeInside(f, path)
    if (rel) return rel
  }
  return null
}

function toSummary(r: DocRow, folders: readonly string[]): DocSummary {
  return {
    id: r.id,
    parentId: r.parentId,
    sort: r.sort,
    title: r.title,
    kind: r.kind,
    linkedPath: r.sourcePath ? (linkedRelative(folders, r.sourcePath) ?? r.sourcePath) : null,
    aiOpen: r.aiOpen,
    updatedAt: r.updatedAt.getTime(),
  }
}

function liveProject(db: Db | DbTx, id: string): typeof projects.$inferSelect {
  const row = db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .get()
  if (!row) throw new Error('Proje bulunamadı')
  return row
}

function liveDoc(db: Db | DbTx, id: string): DocRow {
  const row = db
    .select()
    .from(projectDocs)
    .where(and(eq(projectDocs.id, id), isNull(projectDocs.deletedAt)))
    .get()
  if (!row) throw new Error('Sayfa bulunamadı')
  return row
}

function liveDocs(db: Db | DbTx, projectId: string): DocRow[] {
  return db
    .select()
    .from(projectDocs)
    .where(and(eq(projectDocs.projectId, projectId), isNull(projectDocs.deletedAt)))
    .orderBy(asc(projectDocs.sort), asc(projectDocs.id))
    .all()
}

/** Projenin sayfaları, kardeşler arası sıraya göre (ağaç renderer'da kurulur). */
export function listDocs(db: Db, projectId: string): DocSummary[] {
  const folders = folderPaths(db, projectId)
  return liveDocs(db, projectId).map((r) => toSummary(r, folders))
}

/** Sayfa; bağlı dosyada gövde diskten okunur (klasörün içindeyse). */
export function getDoc(db: Db, id: string): Doc {
  const row = liveDoc(db, id)
  const folders = folderPaths(db, row.projectId)
  const base = toSummary(row, folders)
  if (!row.sourcePath) return { ...base, bodyMd: row.bodyMd, readOnly: false, missing: false }
  const inside = linkedRelative(folders, row.sourcePath) !== null
  let body = ''
  let missing = true
  if (inside && existsSync(row.sourcePath)) {
    const size = statSync(row.sourcePath).size
    body =
      size > LINKED_MAX_BYTES
        ? `Dosya çok büyük (${Math.round(size / 1024)} KB); klasörde aç.`
        : readFileSync(row.sourcePath, 'utf8')
    missing = false
  }
  return { ...base, bodyMd: body, readOnly: true, missing }
}

/** Bağlı dosyanın diskteki yolu; klasörün dışındaysa ya da yoksa null. */
export function linkedFilePath(db: Db, id: string): string | null {
  const row = liveDoc(db, id)
  if (!row.sourcePath) return null
  const inside = linkedRelative(folderPaths(db, row.projectId), row.sourcePath) !== null
  return inside && existsSync(row.sourcePath) ? row.sourcePath : null
}

/** GDD sayfası ve alt sayfalarının markdown'ı (karşılaştırma okur); GDD yoksa null. */
export function gddMarkdown(db: Db, projectId: string): { docId: string; markdown: string } | null {
  const docs = liveDocs(db, projectId)
  const gdd = docs.find((d) => d.kind === 'gdd')
  if (!gdd) return null
  const parts: string[] = []
  const walk = (d: DocRow, depth: number) => {
    const body = d.sourcePath ? getDoc(db, d.id).bodyMd : d.bodyMd
    if (depth > 0) parts.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${d.title}`)
    if (body.trim()) parts.push(body)
    for (const c of docs.filter((x) => x.parentId === d.id)) walk(c, depth + 1)
  }
  walk(gdd, 0)
  return { docId: gdd.id, markdown: parts.join('\n\n') }
}

function siblings(db: Db | DbTx, projectId: string, parentId: string | null): DocRow[] {
  return db
    .select()
    .from(projectDocs)
    .where(
      and(
        eq(projectDocs.projectId, projectId),
        parentId === null ? isNull(projectDocs.parentId) : eq(projectDocs.parentId, parentId),
        isNull(projectDocs.deletedAt),
      ),
    )
    .orderBy(asc(projectDocs.sort), asc(projectDocs.id))
    .all()
}

function nextSort(db: Db | DbTx, projectId: string, parentId: string | null): number {
  const list = siblings(db, projectId, parentId)
  return list.length ? list[list.length - 1]!.sort + 1 : 0
}

function insertDoc(
  tx: DbTx,
  values: {
    projectId: string
    parentId: string | null
    title: string
    kind: DocRow['kind']
    bodyMd?: string
    sourcePath?: string | null
  },
  now: Date,
  groupId?: string,
): DocRow {
  const row = tx
    .insert(projectDocs)
    .values({
      id: ulid(),
      ...values,
      bodyMd: values.bodyMd ?? '',
      sourcePath: values.sourcePath ?? null,
      sort: nextSort(tx, values.projectId, values.parentId),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()
  log(tx, 'create', row, undefined, groupId)
  return row
}

/** "Kararlar" kök sayfası; yoksa aynı grupta açılır. */
function decisionsPage(tx: DbTx, projectId: string, now: Date, groupId: string): DocRow {
  const found = siblings(tx, projectId, null).find(
    (d) => d.title === DECISIONS_TITLE && !d.sourcePath,
  )
  return (
    found ??
    insertDoc(tx, { projectId, parentId: null, title: DECISIONS_TITLE, kind: 'page' }, now, groupId)
  )
}

function checkParent(tx: DbTx, projectId: string, parentId: string | null | undefined): void {
  if (!parentId) return
  const parent = liveDoc(tx, parentId)
  if (parent.projectId !== projectId) throw new Error('Üst sayfa bu projede değil')
}

export function createDoc(db: Db, input: DocCreateInput, now = new Date()): DocSummary {
  return db.transaction((tx) => {
    liveProject(tx, input.projectId)
    checkParent(tx, input.projectId, input.parentId)
    const groupId = ulid()
    const kind = input.kind ?? 'page'
    let parentId = input.parentId ?? null
    if (kind === 'adr' && !parentId) parentId = decisionsPage(tx, input.projectId, now, groupId).id
    const row = insertDoc(
      tx,
      {
        projectId: input.projectId,
        parentId,
        title: (input.title ?? '').trim(),
        kind,
        bodyMd: kind === 'adr' ? adrBody(now) : '',
      },
      now,
      groupId,
    )
    return toSummary(row, folderPaths(tx, input.projectId))
  })
}

/** Başlık/gövde otomatik kaydı pencereli loglanır; tür ve Claude Code işareti ayrı kayıt. */
export function updateDoc(db: Db, input: DocUpdateInput, now = new Date()): DocSummary {
  return db.transaction((tx) => {
    const before = liveDoc(tx, input.id)
    if (input.bodyMd !== undefined && before.sourcePath)
      throw new Error('Bağlı dosya salt okunur; klasörde düzenle')
    const contentChanged =
      (input.title !== undefined && input.title !== before.title) ||
      (input.bodyMd !== undefined && input.bodyMd !== before.bodyMd)
    const metaChanged =
      (input.kind !== undefined && input.kind !== before.kind) ||
      (input.aiOpen !== undefined && input.aiOpen !== before.aiOpen)
    const folders = folderPaths(tx, before.projectId)
    if (!contentChanged && !metaChanged) return toSummary(before, folders)

    const groupId = metaChanged ? ulid() : undefined
    if (input.kind === 'gdd') {
      // Projede tek GDD: öncekinin işareti kalkar.
      for (const other of liveDocs(tx, before.projectId).filter(
        (d) => d.kind === 'gdd' && d.id !== before.id,
      )) {
        const after = tx
          .update(projectDocs)
          .set({ kind: 'page', updatedAt: now })
          .where(eq(projectDocs.id, other.id))
          .returning()
          .get()
        log(tx, 'update', after, other, groupId)
      }
    }
    const after = tx
      .update(projectDocs)
      .set({
        title: input.title,
        bodyMd: input.bodyMd,
        kind: input.kind,
        aiOpen: input.aiOpen,
        updatedAt: now,
      })
      .where(eq(projectDocs.id, input.id))
      .returning()
      .get()
    if (metaChanged) log(tx, 'update', after, before, groupId)
    else
      logUpdateMerged(
        tx,
        { actor: 'taha', targetTable: 'project_docs', targetId: after.id, before, after },
        NOTE_LOG_MERGE_MS,
        now,
      )
    return toSummary(after, folders)
  })
}

function descendants(all: readonly DocRow[], id: string): DocRow[] {
  const out: DocRow[] = []
  const walk = (pid: string) => {
    for (const c of all.filter((d) => d.parentId === pid)) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

/** Sayfayı başka üste ve sıraya taşır; kendi alt ağacına taşınamaz. Kardeşler yeniden numaralanır. */
export function moveDoc(db: Db, input: DocMoveInput, now = new Date()): void {
  db.transaction((tx) => {
    const doc = liveDoc(tx, input.id)
    checkParent(tx, doc.projectId, input.parentId)
    const all = liveDocs(tx, doc.projectId)
    if (input.parentId === doc.id || descendants(all, doc.id).some((d) => d.id === input.parentId))
      throw new Error('Sayfa kendi altına taşınamaz')
    const groupId = ulid()
    const list = siblings(tx, doc.projectId, input.parentId).filter((d) => d.id !== doc.id)
    list.splice(Math.min(input.index, list.length), 0, { ...doc, parentId: input.parentId })
    list.forEach((d, sort) => {
      const prev = d.id === doc.id ? doc : d
      if (prev.sort === sort && prev.parentId === input.parentId) return
      const after = tx
        .update(projectDocs)
        .set({ sort, parentId: input.parentId, updatedAt: now })
        .where(eq(projectDocs.id, d.id))
        .returning()
        .get()
      log(tx, 'update', after, prev, groupId)
    })
  })
}

/** Sayfa ve alt sayfaları çöp kutusuna, tek grupla. */
export function deleteDoc(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const doc = liveDoc(tx, id)
    const groupId = ulid()
    for (const d of [doc, ...descendants(liveDocs(tx, doc.projectId), id)]) {
      const after = tx
        .update(projectDocs)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(projectDocs.id, d.id))
        .returning()
        .get()
      log(tx, 'delete', after, d, groupId)
    }
  })
}

/** Silmeyi geri alır: aynı gruptaki alt sayfalar da döner. */
export function restoreDoc(db: Db, id: string, now = new Date()): void {
  db.transaction((tx) => {
    const deletion = tx
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.targetTable, 'project_docs'),
          eq(activityLog.targetId, id),
          eq(activityLog.action, 'delete'),
          isNull(activityLog.undoneAt),
        ),
      )
      .orderBy(desc(activityLog.id))
      .get()
    const ids = deletion?.groupId
      ? tx
          .select({ id: activityLog.targetId })
          .from(activityLog)
          .where(and(eq(activityLog.groupId, deletion.groupId), eq(activityLog.action, 'delete')))
          .all()
          .map((r) => r.id)
      : [id]
    const groupId = ulid()
    for (const docId of ids) {
      const before = tx
        .select()
        .from(projectDocs)
        .where(and(eq(projectDocs.id, docId), isNotNull(projectDocs.deletedAt)))
        .get()
      if (!before) continue
      const after = tx
        .update(projectDocs)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(projectDocs.id, docId))
        .returning()
        .get()
      log(tx, 'restore', after, before, groupId)
    }
    if (deletion?.groupId)
      tx.update(activityLog)
        .set({ undoneAt: now })
        .where(eq(activityLog.groupId, deletion.groupId))
        .run()
  })
}

/** Türün şablonu; projede canlı sayfa varken çalışmaz. Tek grupla. */
export function applyDocTemplate(db: Db, projectId: string, now = new Date()): DocSummary[] {
  return db.transaction((tx) => {
    const project = liveProject(tx, projectId)
    if (liveDocs(tx, projectId).length) throw new Error('Projede zaten sayfa var')
    const groupId = ulid()
    const walk = (nodes: TemplateNode[], parentId: string | null) => {
      for (const n of nodes) {
        const row = insertDoc(
          tx,
          { projectId, parentId, title: n.title, kind: n.kind, bodyMd: n.bodyMd },
          now,
          groupId,
        )
        walk(n.children, row.id)
      }
    }
    const template = docTemplate(project.kind)
    if (template.length) walk(template, null)
    else
      insertDoc(tx, { projectId, parentId: null, title: 'Genel bakış', kind: 'page' }, now, groupId)
    const folders = folderPaths(tx, projectId)
    return liveDocs(tx, projectId).map((r) => toSummary(r, folders))
  })
}

/**
 * Klasördeki markdown dosyasını sayfa olarak bağlar (kopyalamaz). Dosya projenin klasörlerinden birinde olmalı.
 * Adı GDD'yi andırıyorsa ve projede GDD yoksa GDD işaretlenir.
 */
export function linkDocFile(db: Db, projectId: string, path: string, now = new Date()): DocSummary {
  return db.transaction((tx) => {
    liveProject(tx, projectId)
    const folders = folderPaths(tx, projectId)
    if (!linkedRelative(folders, path)) throw new Error('Dosya projenin klasöründe değil')
    if (!/\.(md|markdown)$/i.test(path) || !existsSync(path))
      throw new Error('Markdown dosyası bulunamadı')
    const docs = liveDocs(tx, projectId)
    const key = path.toLocaleLowerCase('en')
    if (docs.some((d) => d.sourcePath?.toLocaleLowerCase('en') === key))
      throw new Error('Bu dosya zaten bağlı')
    const gdd = looksLikeGdd(path) && !docs.some((d) => d.kind === 'gdd')
    const row = insertDoc(
      tx,
      {
        projectId,
        parentId: null,
        title: titleFromPath(path),
        kind: gdd ? 'gdd' : 'page',
        sourcePath: path,
      },
      now,
    )
    return toSummary(row, folders)
  })
}

/** Bağlanmış dosya yolları (öneri listesinden düşülür). */
export function linkedPaths(db: Db, projectId: string): Set<string> {
  return new Set(
    liveDocs(db, projectId).flatMap((d) =>
      d.sourcePath ? [d.sourcePath.toLocaleLowerCase('en')] : [],
    ),
  )
}

export { folderPaths as projectFolderPaths }

/** Doküman araması (FTS); proje verilirse sadece o proje. Bağlı dosyaların sadece başlığı aranır. */
export function searchDocs(db: Db, query: string, projectId?: string): DocSearchResult[] {
  const match = ftsQuery(query)
  if (!match) return []
  const rows = db.all<{ id: string; projectId: string; title: string; snippet: string }>(sql`
    SELECT d.id AS id, d.project_id AS projectId, d.title AS title,
      snippet(project_docs_fts, 1, ${SNIPPET_OPEN}, ${SNIPPET_CLOSE}, '…', 16) AS snippet
    FROM project_docs_fts JOIN project_docs d ON d.rowid = project_docs_fts.rowid
    JOIN projects p ON p.id = d.project_id
    WHERE project_docs_fts MATCH ${match} AND d.deleted_at IS NULL AND p.deleted_at IS NULL
      ${projectId ? sql`AND d.project_id = ${projectId}` : sql``}
    ORDER BY bm25(project_docs_fts, 5.0, 1.0)
    LIMIT 50
  `)
  return rows.map((r) => {
    const { text, ranges } = parseSnippet(r.snippet)
    return { id: r.id, projectId: r.projectId, title: r.title, snippet: text, ranges }
  })
}

// ---------------------------------------------------------------- GDD sayım kuralları (5d-2)

type Rule = { label: string; glob: string }

export function countRules(db: Db | DbTx, projectId: string): Rule[] {
  const row = liveProject(db, projectId)
  if (!row.countRulesJson) return []
  try {
    return JSON.parse(row.countRulesJson) as Rule[]
  } catch {
    return []
  }
}

/** Etiketin kuralını yazar (glob null = kaldırır). Etiket büyük/küçük harf duyarsız eşleşir. */
export function setCountRule(
  db: Db,
  projectId: string,
  label: string,
  glob: string | null,
  now = new Date(),
): Rule[] {
  return db.transaction((tx) => {
    const before = liveProject(tx, projectId)
    const key = label.trim().toLocaleLowerCase('tr-TR')
    const rules = countRules(tx, projectId).filter(
      (r) => r.label.toLocaleLowerCase('tr-TR') !== key,
    )
    if (glob) rules.push({ label: label.trim(), glob: glob.trim().replaceAll('\\', '/') })
    const after = tx
      .update(projects)
      .set({ countRulesJson: rules.length ? JSON.stringify(rules) : null, updatedAt: now })
      .where(eq(projects.id, projectId))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'update',
      targetTable: 'projects',
      targetId: projectId,
      before,
      after,
    })
    return rules
  })
}
