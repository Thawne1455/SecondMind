import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { MEDIA_URL, type DumpItem, type DumpStatus } from '@shared/ipc'
import { dumpKind } from '../domain/media'
import type { MediaRow } from '../media'
import { logActivity } from './activity'
import type { Db } from './client'
import { dumpAttachments, dumpItems, media } from './schema'

type DumpRow = typeof dumpItems.$inferSelect

function toItem(row: DumpRow, files: MediaRow[]): DumpItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt.getTime(),
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

export function listDumps(db: Db, status: DumpStatus): DumpItem[] {
  const rows = db
    .select()
    .from(dumpItems)
    .where(and(eq(dumpItems.status, status), isNull(dumpItems.deletedAt)))
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

  return rows.map((r) => toItem(r, byDump.get(r.id) ?? []))
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
