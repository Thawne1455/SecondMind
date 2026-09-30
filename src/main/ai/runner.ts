import type { AiModel } from '../domain/aiInput'

// Çalıştırıcı arayüzü (docs/YEREL-LLM.md): HIZLI = yerel Qwen, DERİN = Claude Code. İkisi de aynı kuralları
// (`resources/ai-agent/CLAUDE.md`) ve aynı `girdi.md`'yi alır, ham metin döndürür; doğrulama ortaktır (domain/changes).

export type AiStage = 'preparing' | 'loading' | 'generating' | 'validating'

export type AiProgress = {
  stage: AiStage
  /** 0..1; bilinmiyorsa yok. */
  ratio?: number
  message?: string
}

export type AiRunInput = {
  /** `ai/jobs/<id>/`: `girdi.md` ve `media/` burada. */
  jobDir: string
  /** Ajan kuralları (sistem talimatı). */
  rules: string
  /** `girdi.md`'nin içeriği. */
  input: string
  signal: AbortSignal
  onProgress: (p: AiProgress) => void
}

export interface AiRunner {
  readonly model: AiModel
  /** Modelin ham çıktısı (JSON metni). İptalde `AiCancelledError` atar. */
  run(input: AiRunInput): Promise<string>
}

export class AiRunError extends Error {}
export class AiCancelledError extends AiRunError {
  constructor() {
    super('İptal edildi')
  }
}
