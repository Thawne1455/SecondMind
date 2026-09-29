import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Milestone, NextStep } from '@shared/ipc'
import { type NextStepMilestone, type NextStepTask, rankNextSteps } from '../domain/nextSteps'
import { dayKey } from '../domain/recurrence'
import type { Db } from './client'
import { latestSnapshots, uncommittedOf } from './projectInfo'
import {
  milestones,
  parking,
  playtestClusters,
  playtestFeedback,
  playtestPoints,
  projects,
  tasks,
} from './schema'

// Proje planlaması okumaları (Aşama 5c): sıradaki adım motorunun girdisi. Yazım yok.

type CriterionJson = { id: string; text: string; done: boolean; taskId: string | null }

/** Açık proje görevleri; göreve bağlı playtest kümesini bildiren farklı kişi sayısıyla. */
function openProjectTasks(db: Db, projectId: string): NextStepTask[] {
  const rows = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, 'open'), isNull(tasks.deletedAt)))
    .all()
  if (!rows.length) return []
  const reporters = db
    .selectDistinct({ taskId: playtestClusters.taskId, tester: playtestFeedback.tester })
    .from(playtestClusters)
    .innerJoin(playtestPoints, eq(playtestPoints.clusterId, playtestClusters.id))
    .innerJoin(playtestFeedback, eq(playtestFeedback.id, playtestPoints.feedbackId))
    .where(
      and(
        inArray(
          playtestClusters.taskId,
          rows.map((r) => r.id),
        ),
        isNull(playtestClusters.deletedAt),
        isNull(playtestFeedback.deletedAt),
      ),
    )
    .all()
  const count = new Map<string, number>()
  for (const r of reporters) if (r.taskId) count.set(r.taskId, (count.get(r.taskId) ?? 0) + 1)
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.kind,
    severity: r.kind === 'bug' ? r.severity : null,
    kanbanStatus: r.kanbanStatus,
    milestoneId: r.milestoneId,
    playtestCount: count.get(r.id) ?? 0,
    priority: r.priority as NextStepTask['priority'],
    dueDate: r.dueDate,
    plannedDate: r.plannedDate,
    postponeCount: r.postponeCount,
    createdAt: r.createdAt,
  }))
}

function projectMilestones(db: Db, projectId: string): NextStepMilestone[] {
  return db
    .select()
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .all()
    .map((m) => ({
      id: m.id,
      title: m.title,
      targetDate: m.targetDate,
      doneAt: m.doneAt?.getTime() ?? null,
      criteria: JSON.parse(m.criteriaJson) as CriterionJson[],
    }))
}

/** Kokpit'in "Şimdi bunu yap" karosu: sıralı adımlar (ilk 3 gösterilir). Proje yoksa boş. */
export function projectNextSteps(db: Db, projectId: string, now = new Date()): NextStep[] {
  const project = db
    .select({ nextStep: projects.nextStep })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .get()
  if (!project) return []
  const pendingParkingCount = db
    .select({ id: parking.id })
    .from(parking)
    .where(
      and(
        eq(parking.projectId, projectId),
        eq(parking.status, 'waiting'),
        isNull(parking.deletedAt),
      ),
    )
    .all().length
  const uncommitted = uncommittedOf(latestSnapshots(db, projectId))
  return rankNextSteps(
    {
      tasks: openProjectTasks(db, projectId),
      milestones: projectMilestones(db, projectId),
      lastSessionNextStep: project.nextStep,
      pendingParkingCount,
      oldestUncommittedAt: uncommitted?.oldestAt ?? null,
      today: dayKey(now),
    },
    now,
  )
}

/** Projenin taşları, sıraya göre. Göreve bağlı kriter görev bitince işaretli sayılır. */
export function listMilestones(db: Db, projectId: string): Milestone[] {
  const rows = db
    .select()
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt)))
    .orderBy(asc(milestones.sort), asc(milestones.id))
    .all()
  const done = new Set(
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, 'done'), isNull(tasks.deletedAt)))
      .all()
      .map((t) => t.id),
  )
  return rows.map((m) => ({
    id: m.id,
    projectId: m.projectId,
    title: m.title,
    description: m.description,
    targetDate: m.targetDate,
    sort: m.sort,
    criteria: (JSON.parse(m.criteriaJson) as CriterionJson[]).map((c) => ({
      ...c,
      done: c.done || (c.taskId !== null && done.has(c.taskId)),
    })),
    doneAt: m.doneAt?.getTime() ?? null,
  }))
}
