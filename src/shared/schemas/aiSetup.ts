import { z } from 'zod'

// Ayarlar > AI (4e-1): yerel modelin durumu ve indirilmesi, Claude Code'un yeri ve testi. İndirme ana süreçte,
// uygulama açıkken sürer; ilerleme `aiModel:changed` olayıyla gelir, renderer `aiModel:status`'u yeniden sorar.

export const localModelInfoSchema = z.object({
  label: z.string(),
  /** Tahmini boyut (indirmeden önce gösterilir). */
  approxBytes: z.number(),
  downloaded: z.boolean(),
  path: z.string(),
  bytes: z.number(),
  /** Yarım kalmış indirme var (İndir kaldığı yerden sürer). */
  partial: z.boolean(),
  /** Model şu an bellekte (bir HIZLI işten sonra uygulama kapanana kadar kalır). */
  loaded: z.boolean(),
  /** Süren indirme; `total` 0 ise henüz bilinmiyor. */
  download: z.object({ downloaded: z.number(), total: z.number() }).nullable(),
  /** Son indirmenin hatası (iptal hata sayılmaz). */
  error: z.string().nullable(),
})

export const claudeInfoSchema = z.object({
  /** Ayarlardaki yol (null = otomatik). */
  configured: z.string().nullable(),
  /** Kullanılacak `claude.exe`; bulunamadıysa null. */
  found: z.string().nullable(),
})

export const claudeTestResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    version: z.string().nullable(),
    model: z.string(),
    reply: z.string(),
    ms: z.number(),
  }),
  z.object({ ok: z.literal(false), error: z.string(), ms: z.number() }),
])

export type LocalModelInfo = z.infer<typeof localModelInfoSchema>
export type ClaudeInfo = z.infer<typeof claudeInfoSchema>
export type ClaudeTestResult = z.infer<typeof claudeTestResultSchema>
