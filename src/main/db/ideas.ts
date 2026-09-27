import { and, eq, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { IdeaCard, IdeaSetStatusInput, IdeaSummary, IdeaToday, Note } from '@shared/ipc'
import {
  compareIdeas,
  ideaState,
  incubationEnd,
  pickDueIdea,
  pickNextIncubating,
  pickRadarIdea,
} from '../domain/incubation'
import { logActivity } from './activity'
import type { Db } from './client'
import { tagsByNote, toNote, toSummary, type IdeaRow, type NoteRow } from './knowledge'
import { ideas, notes } from './schema'

// Fikirler: not + kuluçka durumu. Başlık, gövde, etiket ve silme notun kendi akışında (knowledge.ts).

type Pair = { note: NoteRow; idea: IdeaRow }

/** Silinmemiş notların fikirleri. */
function liveIdeas(db: Db): Pair[] {
  return db
    .select({ note: notes, idea: ideas })
    .from(ideas)
    .innerJoin(notes, eq(notes.id, ideas.noteId))
    .where(isNull(notes.deletedAt))
    .all()
}

// Sıralama ve seçim fonksiyonları fikir zamanlarını + notun id / updatedAt'ini ister.
const flat = ({ note, idea }: Pair) => ({ ...idea, id: note.id, updatedAt: note.updatedAt, note })

export function listIdeas(db: Db, now = new Date()): IdeaSummary[] {
  const rows = liveIdeas(db).map(flat).sort(compareIdeas(now))
  const tagMap = tagsByNote(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    ...toSummary(r.note, tagMap.get(r.id) ?? [], true),
    idea: ideaState(r, now),
  }))
}

/** Yeni fikir: boş not + `INCUBATION_DAYS` günlük kuluçka. İkisi aynı grupla loglanır. */
export function createIdea(db: Db, now = new Date()): Note {
  return db.transaction((tx) => {
    const groupId = ulid()
    const note = tx
      .insert(notes)
      .values({ id: ulid(), createdAt: now, updatedAt: now })
      .returning()
      .get()
    const idea = tx
      .insert(ideas)
      .values({
        id: ulid(),
        noteId: note.id,
        incubateUntil: incubationEnd(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'notes',
      targetId: note.id,
      groupId,
      after: { ...note, tags: [] },
    })
    logActivity(tx, {
      actor: 'taha',
      action: 'create',
      targetTable: 'ideas',
      targetId: idea.id,
      groupId,
      after: idea,
    })
    return toNote(note, [], idea, now)
  })
}

/**
 * Kuluçka kararı ve arşiv. Kuluçkadan çıkarken karar anı `decided_at`'e yazılır;
 * geri alma ('incubating') onu siler, `incubate_until` hiç değişmez.
 */
export function setIdeaStatus(db: Db, input: IdeaSetStatusInput, now = new Date()): void {
  db.transaction((tx) => {
    const before = tx
      .select({ idea: ideas })
      .from(ideas)
      .innerJoin(notes, eq(notes.id, ideas.noteId))
      .where(and(eq(ideas.noteId, input.noteId), isNull(notes.deletedAt)))
      .get()?.idea
    if (!before) throw new Error('Fikir bulunamadı')
    if (before.status === input.status) return
    if (before.status === 'project') throw new Error('Projeye dönüşmüş fikir değiştirilemez')

    const decidedAt =
      input.status === 'incubating' ? null : before.status === 'incubating' ? now : before.decidedAt
    const after = tx
      .update(ideas)
      .set({ status: input.status, decidedAt, updatedAt: now })
      .where(eq(ideas.id, before.id))
      .returning()
      .get()
    logActivity(tx, {
      actor: 'taha',
      action: 'update',
      targetTable: 'ideas',
      targetId: before.id,
      before,
      after,
    })
  })
}

/** Editörde açıldı. Sadece radar sinyali: log'a yazılmaz, `updated_at` ilerlemez. */
export function markIdeaOpened(db: Db, noteId: string, now = new Date()): void {
  db.update(ideas).set({ lastOpenedAt: now }).where(eq(ideas.noteId, noteId)).run()
}

export function ideaToday(db: Db, now = new Date()): IdeaToday {
  const rows = liveIdeas(db).map(flat)
  const card = (r: (typeof rows)[number], days: number): IdeaCard => ({
    noteId: r.id,
    title: r.note.title,
    days,
  })
  const due = pickDueIdea(rows, now)
  const next = pickNextIncubating(rows, now)
  const radar = pickRadarIdea(rows, now)
  return {
    due: due ? card(due.idea, due.overdueDays) : null,
    dueCount: due?.count ?? 0,
    next: next ? card(next.idea, next.daysLeft) : null,
    radar: radar ? card(radar.idea, radar.silentDays) : null,
  }
}
