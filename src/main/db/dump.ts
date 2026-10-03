import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { MEDIA_URL, type DumpItem, type DumpResult, type DumpStatus } from '@shared/ipc'
import { dumpKind } from '../domain/media'
import { proposalSummary } from '../domain/proposalSummary'
import type { MediaRow } from '../media'
import { logActivity } from './activity'
import type { Db } from './client'
import { dumpAttachments, dumpItems, media, proposals } from './schema'

type DumpRow = typeof dumpItems.$inferSelect

function toItem(row: DumpRow, files: MediaRow[], results: DumpResult[] = []): DumpItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    skipReason: row.status === 'skipped' ? row.skipReason : null,
    results,
    attachments: files.map((m) => ({
      mediaId: m.id,
      name: m.originalName,
      mime: m.mime,
      size: m.size,
      url: MEDIA_URL + m.fileName,
    })),
  }
}

/** Dosyaları önceden `storeMedia` ile yazılmış bir dökümü kaydeder. */
export function createDump(db: Db, text: string, files: MediaRow[]): DumpItem {
  // Aynı dosya iki kez eklendiyse (aynı hash) tek ek olarak tutulur.
  const unique = [...new Map(files.map((f) => [f.id, f])).values()]
  return db.transaction((tx) => {
    const row = tx
      .insert(dumpItems)
      .values({ id: ulid(), kind: dumpKind(unique.map((f) => f.mime)), content: text.trim() })
      .returning()
      .get()
    unique.forEach((m, position) =>
      tx.insert(dumpAttachments).values({ dumpId: row.id, mediaId: m.id, position }).run(),
    )
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'dump_items',
      targetId: row.id,
      after: { ...row, mediaIds: unique.map((m) => m.id) },
    })
    return toItem(row, unique)
  })
}

/** 'pending' kuyruktur: bekleyenler ve şu an işlenenler birlikte gelir. */
export function listDumps(db: Db, status: DumpStatus): DumpItem[] {
  const statuses: DumpStatus[] = status === 'pending' ? ['pending', 'processing'] : [status]
  const rows = db
    .select()
    .from(dumpItems)
    .where(and(inArray(dumpItems.status, statuses), isNull(dumpItems.deletedAt)))
    .orderBy(desc(dumpItems.createdAt), desc(dumpItems.id))
    .all()
  if (!rows.length) return []

  const links = db
    .select({ dumpId: dumpAttachments.dumpId, media })
    .from(dumpAttachments)
    .innerJoin(media, eq(media.id, dumpAttachments.mediaId))
    .where(
      inArray(
        dumpAttachments.dumpId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(dumpAttachments.position))
    .all()
  const byDump = new Map<string, MediaRow[]>()
  for (const l of links) byDump.set(l.dumpId, [...(byDump.get(l.dumpId) ?? []), l.media])

  const results = status === 'processed' ? dumpResults(db, rows) : new Map<string, DumpResult[]>()
  return rows.map((r) => toItem(r, byDump.get(r.id) ?? [], results.get(r.id) ?? []))
}

/** İşlenen dökümlerin son işindeki öneriler, dökümlere göre. */
function dumpResults(db: Db, rows: DumpRow[]): Map<string, DumpResult[]> {
  const jobIds = [...new Set(rows.map((r) => r.jobId).filter((j): j is string => !!j))]
  const out = new Map<string, DumpResult[]>()
  if (!jobIds.length) return out
  const wanted = new Map(rows.map((r) => [r.id, r.jobId]))
  const found = db
    .select()
    .from(proposals)
    .where(inArray(proposals.jobId, jobIds))
    .orderBy(asc(proposals.jobId), asc(proposals.sort))
    .all()
  for (const p of found) {
    const result: DumpResult = {
      proposalId: p.id,
      op: p.op,
      summary: proposalSummary(p.payloadJson),
      status: p.status,
      undone: p.undoneAt !== null,
    }
    for (const dumpId of JSON.parse(p.sourceDumpIdsJson) as string[])
      if (wanted.get(dumpId) === p.jobId) out.set(dumpId, [...(out.get(dumpId) ?? []), result])
  }
  return out
}

/** Atlanan dökümü yeniden kuyruğa alır. */
export function requeueDump(db: Db, id: string): void {
  db.update(dumpItems)
    .set({ status: 'pending', skipReason: null, updatedAt: new Date() })
    .where(and(eq(dumpItems.id, id), eq(dumpItems.status, 'skipped'), isNull(dumpItems.deletedAt)))
    .run()
}

/** Kuyruktaki (bekleyen) dökümlerin kimlikleri, eskiden yeniye. */
export function pendingDumpIds(db: Db): string[] {
  return db
    .select({ id: dumpItems.id })
    .from(dumpItems)
    .where(and(eq(dumpItems.status, 'pending'), isNull(dumpItems.deletedAt)))
    .orderBy(asc(dumpItems.createdAt), asc(dumpItems.id))
    .all()
    .map((r) => r.id)
}

export function countPendingDumps(db: Db): number {
  const row = db
    .select({ n: count() })
    .from(dumpItems)
    .where(and(eq(dumpItems.status, 'pending'), isNull(dumpItems.deletedAt)))
    .get()
  return row?.n ?? 0
}

/** Soft delete: çöp kutusuna taşır. Zaten silinmişse bir şey yapmaz. */
export function deleteDump(db: Db, id: string): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(dumpItems)
      .where(and(eq(dumpItems.id, id), isNull(dumpItems.deletedAt)))
      .get()
    if (!before) return
    const now = new Date()
    const after = tx
      .update(dumpItems)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(dumpItems.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'delete',
      targetTable: 'dump_items',
      targetId: id,
      before,
      after,
    })
  })
}

/** Çöp kutusundan geri alır. */
export function restoreDump(db: Db, id: string): void {
  db.transaction((tx) => {
    const before = tx
      .select()
      .from(dumpItems)
      .where(and(eq(dumpItems.id, id), isNotNull(dumpItems.deletedAt)))
      .get()
    if (!before) return
    const after = tx
      .update(dumpItems)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(dumpItems.id, id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'restore',
      targetTable: 'dump_items',
      targetId: id,
      before,
      after,
    })
  })
}
