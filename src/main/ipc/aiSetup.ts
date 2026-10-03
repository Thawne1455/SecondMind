import type { ClaudeTestResult, LocalModelInfo } from '@shared/ipc'
import { findClaude, testClaude } from '../ai/claudeRunner'
import {
  deleteLocalModel,
  downloadLocalModel,
  isLocalModelLoaded,
  LOCAL_MODEL,
  localModelStatus,
} from '../ai/localRunner'
import { AiCancelledError } from '../ai/runner'
import { getDb } from '../db/client'
import { getSetting } from '../db/settings'
import type { DataPaths } from '../paths'
import { isAiRunning } from './ai'
import { handle } from './handle'
import { broadcast } from './projects'

// Ayarlar > AI (4e-1). Model indirmesi ana süreçte, uygulama açıkken sürer (kural 3); sayfadan çıkıp dönünce ilerleme
// kaldığı yerden görünür, uygulama kapanınca iptal olur (yarım dosya kalır, sonraki İndir oradan sürer).

type Download = { controller: AbortController; downloaded: number; total: number }

let download: Download | null = null
let lastError: string | null = null

const NOTIFY_MS = 250
let lastNotify = 0

function notify(force = false): void {
  const now = Date.now()
  if (!force && now - lastNotify < NOTIFY_MS) return
  lastNotify = now
  broadcast('aiModel:changed')
}

function modelInfo(paths: DataPaths): LocalModelInfo {
  return {
    label: LOCAL_MODEL.label,
    approxBytes: LOCAL_MODEL.approxBytes,
    ...localModelStatus(paths.models),
    loaded: isLocalModelLoaded(),
    download: download ? { downloaded: download.downloaded, total: download.total } : null,
    error: lastError,
  }
}

async function runDownload(paths: DataPaths, d: Download): Promise<void> {
  try {
    await downloadLocalModel(paths.models, {
      signal: d.controller.signal,
      onProgress: (downloaded, total) => {
        d.downloaded = downloaded
        d.total = total
        notify()
      },
    })
  } catch (e) {
    if (!(e instanceof AiCancelledError)) lastError = e instanceof Error ? e.message : String(e)
  } finally {
    download = null
    notify(true)
  }
}

/** Uygulama kapanırken süren indirme durdurulur. */
export function cancelModelDownload(): void {
  download?.controller.abort()
}

export function registerAiSetupIpc(paths: DataPaths): void {
  handle('aiModel:status', () => modelInfo(paths))

  handle('aiModel:download', () => {
    if (download) return
    if (localModelStatus(paths.models).downloaded) throw new Error('Model zaten indirilmiş')
    const d: Download = { controller: new AbortController(), downloaded: 0, total: 0 }
    download = d
    lastError = null
    void runDownload(paths, d)
    notify(true)
  })

  handle('aiModel:cancelDownload', () => cancelModelDownload())

  handle('aiModel:delete', async () => {
    if (download) throw new Error('İndirme sürüyor; önce iptal et')
    if (isAiRunning()) throw new Error('AI çalışıyor; bitince sil')
    await deleteLocalModel(paths.models)
    lastError = null
    notify(true)
  })

  handle('claude:info', () => {
    const configured = getSetting(getDb(), 'aiClaudePath')
    return { configured, found: findClaude(configured) }
  })

  handle('claude:test', async (): Promise<ClaudeTestResult> => {
    const started = Date.now()
    const db = getDb()
    const configured = getSetting(db, 'aiClaudePath')
    const claudePath = findClaude(configured)
    if (!claudePath)
      return {
        ok: false,
        error: configured ? `Bu yolda claude.exe yok: ${configured}` : 'Claude Code bulunamadı',
        ms: 0,
      }
    const model = getSetting(db, 'aiDeepModel')
    try {
      const r = await testClaude({ claudePath, model, cwd: paths.ai })
      return { ok: true, version: r.version, model, reply: r.reply, ms: Date.now() - started }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        ms: Date.now() - started,
      }
    }
  })
}
