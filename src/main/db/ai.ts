import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { operationSchema, type Operation } from '@shared/schemas/ai'
import { applyOperation } from '../ai/apply'
import type { ValidatedChanges } from '../domain/changes'
import type { Db, DbTx } from './client'
import { aiJobs, dumpItems, proposals } from './schema'
import { undoGroup } from './undo'

// AI işleri ve öneriler (MIMARI.md "AI akışı"). İş başlayınca dökümleri 'processing'e alır; biterken geçerli işlemler
// öneri olur, dökümler 'processed' (öneriye dönüştü) ya da 'skipped' (AI'ın gerekçesiyle) olur. Hiç geçerli işlem
// çıkmazsa iş başarısızdır ve dökümler bekliyor'a döner. Öneri onaylanınca uygulanır, geri alınabilir.

export type JobKind = (typeof aiJobs.$inferSelect)['kind']
export type JobModel = (typeof aiJobs.$inferSelect)['model']
type ProposalRow = typeof proposals.$inferSelect

export function startJob(
  db: Db,
  input: { kind: JobKind; model: JobModel; dumpIds: string[]; inputSummary: string },
  now = new Date(),
): string {
  return db.transaction((tx) => {
    const id = ulid()
    tx.insert(aiJobs)
      .values({ id, kind: input.kind, model: input.model, startedAt: now, inputSummary: input.inputSummary })
      .run()
    if (input.dumpIds.length)
      tx.update(dumpItems)
        .set({ status: 'processing', jobId: id, skipReason: null, updatedAt: now })
        .where(and(inArray(dumpItems.id, input.dumpIds), isNull(dumpItems.deletedAt)))
        .run()
    return id
  })
}

function releaseDumps(db: Db | DbTx, jobId: string, now: Date) {
  db.update(dumpItems)
    .set({ status: 'pending', updatedAt: now })
    .where(and(eq(dumpItems.jobId, jobId), eq(dumpItems.status, 'processing')))
    .run()
}

/** İş hata verdi ya da iptal edildi: dökümler bekliyor'a döner. */
export function failJob(
  db: Db,
  jobId: string,
  error: string,
  status: 'failed' | 'cancelled' = 'failed',
  now = new Date(),
): void {
  db.transaction((tx) => {
    tx.update(aiJobs).set({ status, error, finishedAt: now, updatedAt: now }).where(eq(aiJobs.id, jobId)).run()
    releaseDumps(tx, jobId, now)
  })
}

/** Doğrulanmış çıktıyı yazar. Dönen sayı: oluşan öneri. */
export function finishJob(
  db: Db,
  jobId: string,
  result: ValidatedChanges,
  outputPath: string | null,
  now = new Date(),
): number {
  return db.transaction((tx) => {
    const rejectedJson = result.rejected.length ? JSON.stringify(result.rejected) : null
    if (!result.operations.length) {
      tx.update(aiJobs)
        .set({
          status: 'failed',
          error: 'Geçerli öneri çıkmadı',
          rejectedJson,
          outputPath,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(aiJobs.id, jobId))
        .run()
      releaseDumps(tx, jobId, now)
      return 0
    }
    result.operations.forEach((op, sort) =>
      tx.insert(proposals)
        .values({
          id: ulid(),
          jobId,
          op: op.op,
          payloadJson: JSON.stringify(op),
          sourceDumpIdsJson: JSON.stringify(op.sourceDumpIds),
          sort,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    )
    const used = new Set(result.operations.flatMap((o) => o.sourceDumpIds))
    if (used.size)
      tx.update(dumpItems)
        .set({ status: 'processed', skipReason: null, updatedAt: now })
        .where(and(eq(dumpItems.jobId, jobId), inArray(dumpItems.id, [...used])))
        .run()
    for (const u of result.unprocessed)
      tx.update(dumpItems)
        .set({ status: 'skipped', skipReason: u.reason || 'Gerekçe yok', updatedAt: now })
        .where(and(eq(dumpItems.id, u.dumpId), eq(dumpItems.jobId, jobId)))
        .run()
    releaseDumps(tx, jobId, now)
    tx.update(aiJobs)
      .set({ status: 'done', rejectedJson, outputPath, finishedAt: now, updatedAt: now })
      .where(eq(aiJobs.id, jobId))
      .run()
    return result.operations.length
  })
}

function liveProposal(db: Db, id: string): ProposalRow {
  const row = db.select().from(proposals).where(eq(proposals.id, id)).get()
  if (!row) throw new Error('Öneri bulunamadı')
  return row
}

/**
 * Onayla (ya da düzenleyip onayla). Düzenlenen yük yeniden doğrulanır; işlem türü ve kaynak dökümler değişmez.
 * Uygulama hata verirse öneri bekliyor'da kalır ve hata yukarı çıkar.
 */
export function approveProposal(db: Db, id: string, edited?: unknown, now = new Date()): void {
  const row = liveProposal(db, id)
  if (row.status !== 'pending') throw new Error('Öneri zaten karara bağlanmış')
  const original = operationSchema.parse(JSON.parse(row.payloadJson))
  let op: Operation = original
  if (edited !== undefined) {
    // Formda gelen alanlar asıl önerinin üstüne; tür ve kaynak dökümler korunur.
    op = operationSchema.parse({
      ...original,
      ...(edited as object),
      op: original.op,
      sourceDumpIds: original.sourceDumpIds,
    })
  }
  const groupId = ulid()
  db.transaction(() => {
    applyOperation(db, op, groupId, now)
    db.update(proposals)
      .set({
        status: edited === undefined ? 'approved' : 'edited',
        payloadJson: JSON.stringify(op),
        groupId,
        decidedAt: now,
        updatedAt: now,
      })
      .where(eq(proposals.id, id))
      .run()
  })
}

export function rejectProposal(db: Db, id: string, now = new Date()): void {
  const row = liveProposal(db, id)
  if (row.status !== 'pending') throw new Error('Öneri zaten karara bağlanmış')
  db.update(proposals).set({ status: 'rejected', decidedAt: now, updatedAt: now }).where(eq(proposals.id, id)).run()
}

/** Tümünü onayla: her öneri kendi transaction'ında; biri hata verirse diğerleri yine uygulanır. */
export function approveAll(db: Db, jobId: string, now = new Date()): { applied: number; failed: { id: string; error: string }[] } {
  const pending = db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.jobId, jobId), eq(proposals.status, 'pending')))
    .orderBy(asc(proposals.sort))
    .all()
  let applied = 0
  const failed: { id: string; error: string }[] = []
  for (const p of pending) {
    try {
      approveProposal(db, p.id, undefined, now)
      applied++
    } catch (e) {
      failed.push({ id: p.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { applied, failed }
}

/** Uygulanmış öneriyi geri alır (oluşanlar çöp kutusuna, değişenler eski haline). */
export function undoProposal(db: Db, id: string, now = new Date()): void {
  const row = liveProposal(db, id)
  if (!row.groupId || row.undoneAt) throw new Error('Geri alınacak uygulama yok')
  db.transaction(() => {
    undoGroup(db, row.groupId!, now)
    db.update(proposals).set({ undoneAt: now, updatedAt: now }).where(eq(proposals.id, id)).run()
  })
}

export function listJobs(db: Db, limit = 20) {
  return db.select().from(aiJobs).orderBy(desc(aiJobs.startedAt)).limit(limit).all()
}

export function jobProposals(db: Db, jobId: string): ProposalRow[] {
  return db.select().from(proposals).where(eq(proposals.jobId, jobId)).orderBy(asc(proposals.sort)).all()
}
