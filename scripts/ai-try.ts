// AI çalıştırıcılarını arayüzsüz denemek için (Aşama 4b). Geliştirme veri klasöründeki bekleyen dökümleri işler,
// öneri, reddedilen işlem ve atlanan dökümleri yazdırır. Gerçek veri klasörüne yazmaz.
//
//   npm run ai:try -- --data-dir <klasör> [--model fast|deep] [--limit N] [--models-dir <klasör>] [--download]
//
// --model fast   yerel Qwen (varsayılan); eki olan dökümler yine DERİN'e gider
// --model deep   Claude Code
// --download     yerel modeli önce indirir (~5,7 GB); --models-dir verilmezse <data-dir>/models

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createClaudeRunner, findClaude } from '../src/main/ai/claudeRunner'
import { processDumps, type JobProgress } from '../src/main/ai/jobs'
import {
  createLocalRunner,
  downloadLocalModel,
  disposeLocalModel,
  localModelStatus,
  LOCAL_MODEL,
} from '../src/main/ai/localRunner'
import { AiRunError } from '../src/main/ai/runner'
import { jobProposals } from '../src/main/db/ai'
import type { Db } from '../src/main/db/client'
import * as schema from '../src/main/db/schema'
import { getSetting } from '../src/main/db/settings'
import type { AiModel } from '../src/main/domain/aiInput'
import { isRealDataDir } from './devData'

function fail(message: string): never {
  console.error(`ai-try: ${message}`)
  process.exit(1)
}

type Args = { dataDir: string; model: AiModel; limit: number; modelsDir: string; download: boolean }

function parseArgs(argv: string[]): Args {
  let dataDir: string | undefined
  let modelsDir: string | undefined
  let model: AiModel = 'fast'
  let limit = 50
  let download = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--data-dir') dataDir = argv[++i]
    else if (arg === '--models-dir') modelsDir = argv[++i]
    else if (arg === '--limit') limit = Number(argv[++i])
    else if (arg === '--download') download = true
    else if (arg === '--model') {
      const m = argv[++i]
      if (m !== 'fast' && m !== 'deep') fail('--model fast ya da deep olur')
      model = m
    } else fail(`bilinmeyen argüman: ${arg}`)
  }
  if (!dataDir)
    fail('--data-dir zorunlu. Örnek: npm run ai:try -- --data-dir C:\\sm-dev --model deep')
  if (!Number.isInteger(limit) || limit < 1) fail('--limit pozitif tam sayı olur')
  const root = resolve(dataDir)
  return {
    dataDir: root,
    model,
    limit,
    modelsDir: resolve(modelsDir ?? join(root, 'models')),
    download,
  }
}

const mb = (n: number) => `${(n / 1e6).toFixed(0)} MB`

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (isRealDataDir(args.dataDir))
    fail(`${args.dataDir} gerçek veri klasörü; deneme buraya yazmaz.`)

  if (args.download) {
    console.log(`${LOCAL_MODEL.label} indiriliyor → ${args.modelsDir}`)
    await downloadLocalModel(args.modelsDir, {
      signal: new AbortController().signal,
      onProgress: (done, total) => process.stdout.write(`\r  ${mb(done)} / ${mb(total)}   `),
    })
    console.log('\n  tamam')
  }

  const sqlite = new Database(join(args.dataDir, 'secondmind.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db: Db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })

  const pending = db
    .select({ id: schema.dumpItems.id })
    .from(schema.dumpItems)
    .where(and(eq(schema.dumpItems.status, 'pending'), isNull(schema.dumpItems.deletedAt)))
    .orderBy(asc(schema.dumpItems.createdAt))
    .limit(args.limit)
    .all()
    .map((r) => r.id)
  if (!pending.length) fail('bekleyen döküm yok (seed ile doldur ya da uygulamadan döküm ekle)')
  if (args.model === 'fast' && !localModelStatus(args.modelsDir).downloaded)
    console.warn(
      `uyarı: yerel model yok (${args.modelsDir}); --download ekle ya da --model deep kullan`,
    )

  let last = ''
  const onProgress = (p: JobProgress) => {
    const line = `  [${p.model === 'fast' ? 'HIZLI' : 'DERİN'} ${p.jobId.slice(-6)}] ${p.message ?? p.stage}${p.ratio !== undefined ? ` %${Math.round(p.ratio * 100)}` : ''}`
    if (line !== last) process.stdout.write(`\r${line.padEnd(70)}`)
    last = line
  }

  console.log(`${pending.length} döküm işleniyor (${args.model === 'fast' ? 'HIZLI' : 'DERİN'})`)
  const started = Date.now()
  const outcomes = await processDumps(
    {
      db,
      aiDir: join(args.dataDir, 'ai'),
      mediaDir: join(args.dataDir, 'media'),
      rules: readFileSync(resolve('resources/ai-agent/CLAUDE.md'), 'utf8'),
      profile: getSetting(db, 'aiProfile'),
      runner: (model) => {
        if (model === 'fast') return createLocalRunner({ modelsDir: args.modelsDir })
        const claudePath = findClaude(getSetting(db, 'aiClaudePath'))
        if (!claudePath) throw new AiRunError('claude.exe bulunamadı')
        return createClaudeRunner({ claudePath, model: getSetting(db, 'aiDeepModel') })
      },
    },
    pending,
    args.model,
    onProgress,
  )
  console.log(`\n${((Date.now() - started) / 1000).toFixed(1)} sn\n`)

  const dumpText = new Map(
    db
      .select({
        id: schema.dumpItems.id,
        content: schema.dumpItems.content,
        status: schema.dumpItems.status,
        skipReason: schema.dumpItems.skipReason,
      })
      .from(schema.dumpItems)
      .all()
      .map((d) => [d.id, d]),
  )
  for (const o of outcomes) {
    const job = db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, o.jobId)).get()!
    console.log(
      `== İş ${o.jobId} · ${o.model === 'fast' ? 'HIZLI' : 'DERİN'} · ${o.status} · ${o.proposals} öneri${o.error ? ` · ${o.error}` : ''}`,
    )
    console.log(`   paket: ${join(args.dataDir, 'ai', 'jobs', o.jobId)}`)
    for (const p of jobProposals(db, o.jobId)) {
      const { op, sourceDumpIds, ...rest } = JSON.parse(p.payloadJson) as {
        op: string
        sourceDumpIds: string[]
      }
      console.log(
        `  + ${op}  ← ${sourceDumpIds.map((d) => JSON.stringify(dumpText.get(d)?.content.slice(0, 50))).join(', ')}`,
      )
      console.log(`      ${JSON.stringify(rest)}`)
    }
    for (const r of JSON.parse(job.rejectedJson ?? '[]') as {
      index: number
      op: string | null
      reason: string
    }[])
      console.log(`  ✗ #${r.index} ${r.op ?? '?'}: ${r.reason}`)
  }
  const skipped = pending.map((id) => dumpText.get(id)!).filter((d) => d.status === 'skipped')
  for (const d of skipped)
    console.log(`  ~ atlandı: ${JSON.stringify(d.content.slice(0, 50))} (${d.skipReason})`)

  await disposeLocalModel()
  sqlite.close()
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)))
