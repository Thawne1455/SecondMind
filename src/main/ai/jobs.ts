import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAiContext, loadJobDumps } from '../db/aiContext'
import { failJob, finishJob, startJob } from '../db/ai'
import type { Db } from '../db/client'
import {
  buildJobInput,
  inputSummary,
  splitByModel,
  type AiJobDump,
  type AiModel,
} from '../domain/aiInput'
import { validateChanges } from '../domain/changes'
import { AiCancelledError, type AiProgress, type AiRunner } from './runner'

// "AI ile İşle" akışı (MIMARI.md "AI akışı"): dökümler çalıştırıcıya göre gruplanır, her grup bir iş olur.
// Her iş için `ai/jobs/<id>/` paketi (girdi.md, kurallar.md, media/) hazırlanır, çalıştırıcı çağrılır, ham çıktı
// `cikti.json`'a yazılır, doğrulanır ve öneriler kaydedilir. Electron'a bağlı değil (scripts/ai-try.ts de kullanır).

export const KEEP_JOB_DIRS = 30

export type AiJobEnv = {
  db: Db
  /** `<veri>/ai` */
  aiDir: string
  /** `<veri>/media` */
  mediaDir: string
  /** Ajan kuralları (`resources/ai-agent/CLAUDE.md`). */
  rules: string
  /** Taha'nın profil özeti (Ayarlar); boş olabilir. */
  profile: string
  /** Çalıştırıcıyı iş anında kurar (ör. Claude Code yolu yoksa burada hata verir). */
  runner: (model: AiModel) => AiRunner
}

export type JobProgress = AiProgress & { jobId: string; model: AiModel }

export type JobOutcome = {
  jobId: string
  model: AiModel
  status: 'done' | 'failed' | 'cancelled'
  proposals: number
  rejected: number
  error: string | null
}

const controllers = new Map<string, AbortController>()

/** Süren ya da sırasını bekleyen işi iptal eder; iş yoksa false. */
export function cancelJob(jobId: string): boolean {
  const c = controllers.get(jobId)
  if (!c) return false
  c.abort()
  return true
}

export const runningJobIds = (): string[] => [...controllers.keys()]

function writePackage(env: AiJobEnv, jobId: string, dumps: AiJobDump[], input: string): string {
  const dir = join(env.aiDir, 'jobs', jobId)
  mkdirSync(join(dir, 'media'), { recursive: true })
  writeFileSync(join(dir, 'girdi.md'), input, 'utf8')
  // Hangi kurallarla çalıştığı izlenebilsin diye; adı CLAUDE.md değil ki Claude Code kendiliğinden yüklemesin.
  writeFileSync(join(dir, 'kurallar.md'), env.rules, 'utf8')
  for (const a of dumps.flatMap((d) => d.attachments)) {
    const src = join(env.mediaDir, a.fileName)
    if (existsSync(src)) copyFileSync(src, join(dir, 'media', a.fileName))
  }
  return dir
}

/** En yeni `keep` iş klasörü kalır (ULID adları zaman sırasıdır). */
export function pruneJobDirs(aiDir: string, keep = KEEP_JOB_DIRS): void {
  const root = join(aiDir, 'jobs')
  if (!existsSync(root)) return
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
  for (const name of dirs.slice(0, Math.max(0, dirs.length - keep)))
    rmSync(join(root, name), { recursive: true, force: true })
}

async function runOne(
  env: AiJobEnv,
  job: { jobId: string; model: AiModel; dumps: AiJobDump[] },
  signal: AbortSignal,
  onProgress: (p: JobProgress) => void,
): Promise<JobOutcome> {
  const { jobId, model } = job
  const report = (p: AiProgress) => onProgress({ ...p, jobId, model })
  try {
    if (signal.aborted) throw new AiCancelledError()
    report({ stage: 'preparing', message: 'Paket hazırlanıyor' })
    const pkg = buildJobInput(loadAiContext(env.db, env.profile), job.dumps)
    const dir = writePackage(env, jobId, job.dumps, pkg.markdown)
    const raw = await env.runner(model).run({
      jobDir: dir,
      rules: env.rules,
      input: pkg.markdown,
      signal,
      onProgress: report,
    })
    const outputPath = join(dir, 'cikti.json')
    writeFileSync(outputPath, raw, 'utf8')
    report({ stage: 'validating', message: 'Doğrulanıyor' })
    const validated = validateChanges(raw, pkg.known)
    const proposals = finishJob(env.db, jobId, validated, outputPath)
    return {
      jobId,
      model,
      status: proposals ? 'done' : 'failed',
      proposals,
      rejected: validated.rejected.length,
      error: proposals ? null : 'Geçerli öneri çıkmadı',
    }
  } catch (e) {
    const cancelled = signal.aborted || e instanceof AiCancelledError
    const error = cancelled ? 'İptal edildi' : e instanceof Error ? e.message : String(e)
    failJob(env.db, jobId, error, cancelled ? 'cancelled' : 'failed')
    return {
      jobId,
      model,
      status: cancelled ? 'cancelled' : 'failed',
      proposals: 0,
      rejected: 0,
      error,
    }
  }
}

/**
 * Dökümleri işler. Eki olan dökümler HIZLI seçilse de DERİN'e gider (ayrı iş). İşler sırayla çalışır; hepsi baştan
 * başlatılır ki dökümler hemen "işleniyor"a geçsin ve sırası gelmeyen de iptal edilebilsin.
 */
export async function processDumps(
  env: AiJobEnv,
  dumpIds: string[],
  requested: AiModel,
  onProgress: (p: JobProgress) => void = () => {},
): Promise<JobOutcome[]> {
  const dumps = loadJobDumps(env.db, dumpIds)
  const jobs = splitByModel(dumps, requested).map((g) => {
    const jobId = startJob(env.db, {
      kind: 'dump',
      model: g.model,
      dumpIds: g.dumps.map((d) => d.id),
      inputSummary: inputSummary(g.dumps),
    })
    const controller = new AbortController()
    controllers.set(jobId, controller)
    return { jobId, model: g.model, dumps: g.dumps, controller }
  })
  const outcomes: JobOutcome[] = []
  try {
    for (const job of jobs) {
      outcomes.push(await runOne(env, job, job.controller.signal, onProgress))
      controllers.delete(job.jobId)
    }
  } finally {
    for (const job of jobs) controllers.delete(job.jobId)
    pruneJobDirs(env.aiDir)
  }
  return outcomes
}
