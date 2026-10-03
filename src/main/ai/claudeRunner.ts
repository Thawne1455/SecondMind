import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'
import { operationSchema, unprocessedSchema } from '@shared/schemas/ai'
import { AiCancelledError, AiRunError, type AiRunInput, type AiRunner } from './runner'

// DERİN: Taha'nın bilgisayarındaki Claude Code, aboneliğiyle, tek seferlik (`-p`). API anahtarı yok.
// Ajan sadece iş klasörünü okur: `--safe-mode` CLAUDE.md, hook, eklenti ve MCP yüklemez; `--restricted` dosya
// araçlarını çalışma klasörüne kapatır; `--tools Read` dışında araç yok. Kurallar sistem talimatı olarak verilir.

export const CLAUDE_TIMEOUT_MS = 5 * 60_000

const INSTRUCTION =
  'girdi.md dosyasını oku (ekler varsa media/ altındakileri de) ve kurallara göre changes JSON nesnesini üret.'

// Claude Code'un yapılandırılmış çıktısı: zod şemasından türetilir, sonuç yine zod ile tek tek doğrulanır.
// `$schema` (2020-12) Claude Code'un doğrulayıcısında tanımlı değil; atılır.
const { $schema: _dialect, ...outputJsonSchema } = z.toJSONSchema(
  z.object({
    version: z.literal(1),
    operations: z.array(operationSchema),
    unprocessed: z.array(unprocessedSchema),
  }),
  { io: 'input', unrepresentable: 'any' },
)
const OUTPUT_JSON_SCHEMA = JSON.stringify(outputJsonSchema)

const resultSchema = z.object({
  is_error: z.boolean().optional(),
  subtype: z.string().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
})

/** Ayarlardaki yol, yoksa PATH ve yerel kurulum yeri (`~/.local/bin`). Sadece `.exe` (kabuksuz çalıştırılır). */
export function findClaude(
  configured: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (configured) return existsSync(configured) ? configured : null
  const dirs = (env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter(Boolean)
  if (env['USERPROFILE']) dirs.push(join(env['USERPROFILE'], '.local', 'bin'))
  for (const dir of dirs) {
    const file = join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude')
    if (existsSync(file)) return file
  }
  return null
}

function killTree(pid: number | undefined) {
  if (!pid) return
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
  else process.kill(pid, 'SIGTERM')
}

/** `--output-format json` sonucundan model metnini çıkarır. */
export function parseClaudeResult(stdout: string): string {
  let parsed: z.infer<typeof resultSchema>
  try {
    parsed = resultSchema.parse(JSON.parse(stdout.trim()))
  } catch {
    throw new AiRunError(`Claude Code çıktısı okunamadı: ${stdout.trim().slice(0, 200)}`)
  }
  if (parsed.is_error || (parsed.subtype && parsed.subtype !== 'success'))
    throw new AiRunError(
      `Claude Code hata verdi: ${(parsed.result ?? parsed.subtype ?? '').slice(0, 300)}`,
    )
  if (parsed.structured_output !== undefined) return JSON.stringify(parsed.structured_output)
  if (parsed.result) return parsed.result
  throw new AiRunError('Claude Code boş yanıt döndü')
}

export function createClaudeRunner(opts: {
  claudePath: string
  model: string
  timeoutMs?: number
}): AiRunner {
  return {
    model: 'deep',
    run: (input: AiRunInput) =>
      new Promise<string>((resolve, reject) => {
        if (input.signal.aborted) return reject(new AiCancelledError())
        const args = [
          '-p',
          INSTRUCTION,
          '--output-format',
          'json',
          '--model',
          opts.model,
          '--system-prompt',
          input.rules,
          '--json-schema',
          OUTPUT_JSON_SCHEMA,
          '--tools',
          'Read',
          '--permission-mode',
          'dontAsk',
          '--safe-mode',
          '--restricted',
          '--strict-mcp-config',
          '--no-session-persistence',
        ]
        const child = spawn(opts.claudePath, args, {
          cwd: input.jobDir,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''
        let settled = false
        const started = Date.now()
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          clearInterval(tick)
          input.signal.removeEventListener('abort', onAbort)
          fn()
        }
        const onAbort = () => {
          killTree(child.pid)
          finish(() => reject(new AiCancelledError()))
        }
        const timeoutMs = opts.timeoutMs ?? CLAUDE_TIMEOUT_MS
        const timer = setTimeout(() => {
          killTree(child.pid)
          finish(() => reject(new AiRunError(`Zaman aşımı (${Math.round(timeoutMs / 60_000)} dk)`)))
        }, timeoutMs)
        // Claude Code ara ilerleme vermez; geçen süre zaman aşımına oranlanır.
        const tick = setInterval(
          () =>
            input.onProgress({
              stage: 'generating',
              ratio: Math.min(0.95, (Date.now() - started) / timeoutMs),
              message: 'Claude Code çalışıyor',
            }),
          1000,
        )
        input.signal.addEventListener('abort', onAbort)
        input.onProgress({ stage: 'generating', ratio: 0, message: 'Claude Code çalışıyor' })

        child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s))
        child.stderr.setEncoding('utf8').on('data', (s: string) => (stderr += s))
        child.on('error', (e) =>
          finish(() => reject(new AiRunError(`Claude Code başlatılamadı: ${e.message}`))),
        )
        child.on('close', (code) =>
          finish(() => {
            // Hata durumunda da `--output-format json` stdout'a sonuç yazar; önce onu dene.
            try {
              resolve(parseClaudeResult(stdout))
            } catch (e) {
              if (code === 0 || !stderr.trim()) reject(e)
              else
                reject(
                  new AiRunError(
                    `Claude Code hata verdi (${code}): ${stderr.trim().slice(0, 300)}`,
                  ),
                )
            }
          }),
        )
      }),
  }
}

/** `claude --version` çıktısından sürüm ("2.1.3 (Claude Code)" → "2.1.3"). */
export function parseClaudeVersion(stdout: string): string | null {
  return /\d+\.\d+\.\d+[\w.-]*/.exec(stdout)?.[0] ?? null
}

function runOnce(
  file: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      killTree(child.pid)
      reject(new AiRunError(`Zaman aşımı (${Math.round(timeoutMs / 1000)} sn)`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (s: string) => (stdout += s))
    child.stderr.setEncoding('utf8').on('data', (s: string) => (stderr += s))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new AiRunError(`Claude Code başlatılamadı: ${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

export type ClaudeProbe = { version: string | null; reply: string }

/**
 * Ayarlar > AI "Test et": önce sürüm, sonra işlerle aynı bayraklarla kısa bir `-p` denemesi (seçili model yanıt
 * veriyor mu, abonelik oturumu açık mı). Hata `AiRunError` olarak tek satır döner.
 */
export async function testClaude(opts: {
  claudePath: string
  model: string
  cwd: string
  timeoutMs?: number
}): Promise<ClaudeProbe> {
  const v = await runOnce(opts.claudePath, ['--version'], opts.cwd, 15_000)
  const version = parseClaudeVersion(v.stdout)
  if (v.code !== 0 || !version)
    throw new AiRunError(
      `Sürüm okunamadı (${v.code}): ${(v.stderr || v.stdout).trim().slice(0, 200)}`,
    )
  const r = await runOnce(
    opts.claudePath,
    [
      '-p',
      'Sadece OK yaz.',
      '--output-format',
      'json',
      '--model',
      opts.model,
      '--tools',
      'Read',
      '--permission-mode',
      'dontAsk',
      '--safe-mode',
      '--restricted',
      '--strict-mcp-config',
      '--no-session-persistence',
    ],
    opts.cwd,
    opts.timeoutMs ?? 90_000,
  )
  try {
    return { version, reply: parseClaudeResult(r.stdout).trim().slice(0, 80) }
  } catch (e) {
    if (r.code !== 0 && r.stderr.trim())
      throw new AiRunError(`Claude Code hata verdi (${r.code}): ${r.stderr.trim().slice(0, 300)}`)
    throw e
  }
}
