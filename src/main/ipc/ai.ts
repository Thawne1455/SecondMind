import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inArray } from 'drizzle-orm'
import { ulid } from 'ulid'
import type { AiModel, AiRun, AiRunResult, AiStatus } from '@shared/ipc'
import { cancelJob, processDumps, runningJobIds, type JobOutcome } from '../ai/jobs'
import { runnerFactory } from '../ai/runners'
import { getDb } from '../db/client'
import { pendingDumpIds } from '../db/dump'
import { aiJobs, dumpItems } from '../db/schema'
import { getSetting } from '../db/settings'
import type { DataPaths } from '../paths'
import { handle } from './handle'
import { broadcast } from './projects'

// "AI ile İşle" (4c). Çalıştırma ana süreçte, uygulama açıkken sürer (kural 3: arka plan süreci yok). Aynı anda tek
// çalıştırma. Durum bellekte; her ilerlemede `ai:changed` yayılır, renderer `ai:status`'u yeniden sorar.

type Running = Omit<AiRun, 'done'> & { dumpIds: string[] }

let running: Running | null = null
let last: AiRunResult | null = null

/** `resources/ai-agent/CLAUDE.md` (paketlemede Aşama 8: extraResources ile `resources/ai-agent/`). */
function agentRules(): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'ai-agent')
    : join(app.getAppPath(), 'resources', 'ai-agent')
  const path = join(base, 'CLAUDE.md')
  if (!existsSync(path)) throw new Error('AI kuralları bulunamadı (resources/ai-agent/CLAUDE.md)')
  return readFileSync(path, 'utf8')
}

// Yerel model her parça metinde ilerleme bildirir; olaylar seyreltilir, aşama değişince hemen gider.
const NOTIFY_MS = 250
let lastNotify = 0
let lastMessage = ''
let pendingNotify: NodeJS.Timeout | null = null

function notify(force = false): void {
  const message = running?.current?.message ?? ''
  const now = Date.now()
  if (force || message !== lastMessage || now - lastNotify >= NOTIFY_MS) {
    if (pendingNotify) clearTimeout(pendingNotify)
    pendingNotify = null
    lastNotify = now
    lastMessage = message
    broadcast('ai:changed')
  } else if (!pendingNotify) {
    pendingNotify = setTimeout(() => notify(true), NOTIFY_MS - (now - lastNotify))
  }
}

/** İşi bitmiş (iş satırı artık 'running' değil) döküm sayısı. */
function doneCount(dumpIds: string[]): number {
  if (!dumpIds.length) return 0
  const db = getDb()
  const rows = db
    .select({ jobId: dumpItems.jobId })
    .from(dumpItems)
    .where(inArray(dumpItems.id, dumpIds))
    .all()
  const jobIds = [...new Set(rows.map((r) => r.jobId).filter((j): j is string => !!j))]
  if (!jobIds.length) return 0
  const finished = new Set(
    db
      .select({ id: aiJobs.id, status: aiJobs.status })
      .from(aiJobs)
      .where(inArray(aiJobs.id, jobIds))
      .all()
      .filter((j) => j.status !== 'running')
      .map((j) => j.id),
  )
  return rows.filter((r) => r.jobId && finished.has(r.jobId)).length
}

function skippedCount(dumpIds: string[]): number {
  if (!dumpIds.length) return 0
  return getDb()
    .select({ status: dumpItems.status })
    .from(dumpItems)
    .where(inArray(dumpItems.id, dumpIds))
    .all()
    .filter((r) => r.status === 'skipped').length
}

function summarize(run: Running, outcomes: JobOutcome[], crash: string | null): AiRunResult {
  const errors = outcomes
    .filter((o) => o.status === 'failed' && o.error)
    .map((o) => `${o.model === 'fast' ? 'HIZLI' : 'DERİN'}: ${o.error}`)
  if (crash) errors.push(crash)
  return {
    runId: run.runId,
    finishedAt: Date.now(),
    proposals: outcomes.reduce((n, o) => n + o.proposals, 0),
    skipped: skippedCount(run.dumpIds),
    cancelled: run.cancelling || outcomes.some((o) => o.status === 'cancelled'),
    errors: [...new Set(errors)],
  }
}

async function execute(run: Running, paths: DataPaths): Promise<void> {
  const db = getDb()
  let outcomes: JobOutcome[] = []
  let crash: string | null = null
  try {
    outcomes = await processDumps(
      {
        db,
        aiDir: paths.ai,
        mediaDir: paths.media,
        rules: agentRules(),
        profile: getSetting(db, 'aiProfile'),
        runner: runnerFactory(db, paths.models),
      },
      run.dumpIds,
      run.model,
      (p) => {
        if (running !== run) return
        run.current = { model: p.model, message: p.message ?? '', ratio: p.ratio ?? null }
        notify()
      },
    )
  } catch (e) {
    crash = e instanceof Error ? e.message : String(e)
  } finally {
    last = summarize(run, outcomes, crash)
    running = null
    notify(true)
  }
}

export function getAiStatus(): AiStatus {
  if (!running) return { running: null, last }
  const { dumpIds, ...run } = running
  return { running: { ...run, done: doneCount(dumpIds) }, last }
}

/** Uygulama kapanırken: süren işler iptal edilir (Claude Code süreci de kapanır). */
export function cancelAiRun(): void {
  if (!running) return
  running.cancelling = true
  for (const id of runningJobIds()) cancelJob(id)
}

export function registerAiIpc(paths: DataPaths): void {
  handle('ai:process', ({ model }: { model: AiModel }) => {
    if (running) throw new Error('AI zaten çalışıyor')
    const dumpIds = pendingDumpIds(getDb())
    if (!dumpIds.length) throw new Error('İşlenecek döküm yok')
    const run: Running = {
      runId: ulid(),
      model,
      total: dumpIds.length,
      current: null,
      cancelling: false,
      dumpIds,
    }
    running = run
    void execute(run, paths)
    notify(true)
    return { dumps: dumpIds.length }
  })

  handle('ai:status', () => getAiStatus())

  handle('ai:cancel', () => {
    cancelAiRun()
    notify(true)
  })
}
