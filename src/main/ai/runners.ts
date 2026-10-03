import type { Db } from '../db/client'
import { getSetting } from '../db/settings'
import type { AiModel } from '../domain/aiInput'
import { createClaudeRunner, findClaude } from './claudeRunner'
import { createLocalRunner } from './localRunner'
import { AiRunError, type AiRunner } from './runner'

/** Modele göre çalıştırıcı: HIZLI = yerel Qwen (`modelsDir`), DERİN = Claude Code (Ayarlar'daki yol ve model). */
export function runnerFactory(db: Db, modelsDir: string): (model: AiModel) => AiRunner {
  return (model) => {
    if (model === 'fast') return createLocalRunner({ modelsDir })
    const claudePath = findClaude(getSetting(db, 'aiClaudePath'))
    if (!claudePath) throw new AiRunError('Claude Code bulunamadı (Ayarlar > AI)')
    return createClaudeRunner({ claudePath, model: getSetting(db, 'aiDeepModel') })
  }
}
