import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { GbnfJsonObjectSchema, Llama, LlamaGrammar, LlamaModel } from 'node-llama-cpp'
import { CHANGES_GRAMMAR } from '../domain/changesGrammar'
import {
  AiCancelledError,
  AiRunError,
  type AiProgress,
  type AiRunInput,
  type AiRunner,
} from './runner'

// HIZLI: yerel Qwen3.5-9B (docs/YEREL-LLM.md). Model ana süreçte, ilk işte yüklenir ve uygulama kapanana kadar
// bellekte kalır (kural 3: uygulama kapanınca model de kapanır). Çıktı `CHANGES_GRAMMAR` ile JSON'a zorlanır.
// `node-llama-cpp` ESM'dir ve büyük: sadece gerektiğinde dinamik import edilir.

export const LOCAL_MODEL = {
  uri: 'hf:unsloth/Qwen3.5-9B-GGUF:Q4_K_M',
  fileName: 'Qwen3.5-9B-Q4_K_M.gguf',
  label: 'Qwen3.5-9B (Q4_K_M)',
  approxBytes: 5.7e9,
} as const

const CONTEXT_SIZE = 8192
const MAX_OUTPUT_TOKENS = 3072

export const localModelPath = (modelsDir: string) => join(modelsDir, LOCAL_MODEL.fileName)

export function localModelStatus(modelsDir: string): {
  downloaded: boolean
  path: string
  bytes: number
} {
  const path = localModelPath(modelsDir)
  return existsSync(path)
    ? { downloaded: true, path, bytes: statSync(path).size }
    : { downloaded: false, path, bytes: 0 }
}

const isAbort = (e: unknown) =>
  e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message))

/** Modeli `<veri>/models/`'a indirir; yarım kalan indirme kaldığı yerden sürer. */
export async function downloadLocalModel(
  modelsDir: string,
  opts: { signal: AbortSignal; onProgress: (downloaded: number, total: number) => void },
): Promise<string> {
  mkdirSync(modelsDir, { recursive: true })
  const { createModelDownloader } = await import('node-llama-cpp')
  const downloader = await createModelDownloader({
    modelUri: LOCAL_MODEL.uri,
    dirPath: modelsDir,
    fileName: LOCAL_MODEL.fileName,
    skipExisting: true,
    deleteTempFileOnCancel: false,
    showCliProgress: false,
    onProgress: ({ downloadedSize, totalSize }) => opts.onProgress(downloadedSize, totalSize),
  })
  try {
    return await downloader.download({ signal: opts.signal })
  } catch (e) {
    if (opts.signal.aborted || isAbort(e)) throw new AiCancelledError()
    throw new AiRunError(`Model indirilemedi: ${e instanceof Error ? e.message : String(e)}`)
  }
}

type Loaded = { llama: Llama; model: LlamaModel; grammar: LlamaGrammar }

let loaded: Promise<Loaded> | null = null
/** Aynı anda tek üretim: GPU belleği tek bağlama yeter. */
let queue: Promise<unknown> = Promise.resolve()

function load(modelPath: string, onProgress: (p: AiProgress) => void): Promise<Loaded> {
  loaded ??= (async () => {
    const { getLlama } = await import('node-llama-cpp')
    // Hazır ikililer: CUDA runtime kuruluysa CUDA, değilse Vulkan (RTX'i görür), o da yoksa CPU.
    // Asla kaynaktan derlemez (MSVC/cmake ister; CLAUDE.md "yeniden derleme yok").
    const llama = await getLlama({ gpu: 'auto', build: 'never' })
    const model = await llama.loadModel({
      modelPath,
      onLoadProgress: (ratio) =>
        onProgress({ stage: 'loading', ratio, message: 'Model yükleniyor' }),
    })
    // Şemanın derin `as const` tipi kütüphanenin şema birliğinde çözülemiyor; yapısı testte denetleniyor.
    const grammar = await llama.createGrammarForJsonSchema(
      CHANGES_GRAMMAR as unknown as GbnfJsonObjectSchema,
    )
    return { llama, model, grammar }
  })().catch((e: unknown) => {
    loaded = null
    throw new AiRunError(`Model yüklenemedi: ${e instanceof Error ? e.message : String(e)}`)
  })
  return loaded
}

/** Uygulama kapanırken çağrılır. */
export async function disposeLocalModel(): Promise<void> {
  const current = loaded
  loaded = null
  if (!current) return
  try {
    const { model, llama } = await current
    await model.dispose()
    await llama.dispose()
  } catch {
    // Yüklenemediyse bırakılacak bir şey yok.
  }
}

export function createLocalRunner(opts: { modelsDir: string }): AiRunner {
  const run = async (input: AiRunInput): Promise<string> => {
    const status = localModelStatus(opts.modelsDir)
    if (!status.downloaded) throw new AiRunError('Yerel model indirilmemiş (Ayarlar > AI)')
    if (input.signal.aborted) throw new AiCancelledError()
    input.onProgress({ stage: 'loading', ratio: 0, message: 'Model yükleniyor' })
    const { model, grammar } = await load(status.path, input.onProgress)
    if (input.signal.aborted) throw new AiCancelledError()

    const { LlamaChatSession, QwenChatWrapper } = await import('node-llama-cpp')
    const context = await model.createContext({ contextSize: CONTEXT_SIZE })
    try {
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: input.rules,
        // Düşünme kapalı: grammar dışında kalır ve süreyi uzatır. `budgets: { thoughtTokens: 0 }` yetmiyor; model
        // düşünme bölümünü yine açıyor ve JSON'un ilk "{" karakteri oraya kaçıyor (çıktı "{"siz ve boş kalıyordu).
        chatWrapper: new QwenChatWrapper({ thoughts: 'discourage' }),
      })
      // Önce girdi okunur (birkaç on saniye, ilerleme bilgisi yok); ilk parça gelince yazmaya geçer. Çıktının uzunluğu
      // önceden bilinmediği için yüzde verilmez.
      let writing = false
      input.onProgress({ stage: 'generating', message: 'Qwen dökümleri okuyor' })
      const text = await session.prompt(input.input, {
        grammar,
        signal: input.signal,
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        onTextChunk: () => {
          if (writing) return
          writing = true
          input.onProgress({ stage: 'generating', message: 'Qwen önerileri yazıyor' })
        },
      })
      return text
    } catch (e) {
      if (input.signal.aborted || isAbort(e)) throw new AiCancelledError()
      throw e instanceof AiRunError
        ? e
        : new AiRunError(`Yerel model hata verdi: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      await context.dispose()
    }
  }
  return {
    model: 'fast',
    run: (input) => {
      const next = queue.then(() => run(input))
      queue = next.catch(() => undefined)
      return next
    },
  }
}
