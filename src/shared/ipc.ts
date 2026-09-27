import { z } from 'zod'
import type { IpcChannel, Theme } from './ipc-channels'
import { dumpCreateInputSchema, dumpItemSchema, dumpStatusSchema } from './schemas/dump'
import {
  collectionCreateInputSchema,
  collectionDeleteInputSchema,
  collectionRenameInputSchema,
  collectionSummarySchema,
  ideaSetStatusInputSchema,
  ideaSummarySchema,
  ideaTodaySchema,
  mediaStoreInputSchema,
  noteCreateInputSchema,
  noteListInputSchema,
  noteSchema,
  noteSearchResultSchema,
  noteSummarySchema,
  noteUpdateInputSchema,
  tagSummarySchema,
} from './schemas/knowledge'

export * from './ipc-channels'
export * from './schemas/dump'
export * from './schemas/knowledge'

// IPC sözleşmesinin tek kaynağı. Kanal adları `alan:eylem` biçiminde.
// Ana süreç her girdiyi burada tanımlı şemayla doğrular.

export const themeSchema = z.enum(['light', 'dark']) satisfies z.ZodType<Theme>

/** Her ayar anahtarının değer şeması. Yeni ayar = buraya bir satır + `settingDefaults`. */
export const settingValueSchemas = {
  theme: themeSchema,
} as const

export type SettingKey = keyof typeof settingValueSchemas
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingValueSchemas)[K]>

export const settingDefaults: { [K in SettingKey]: SettingValue<K> } = {
  theme: 'light',
}

const settingKeySchema = z.enum(Object.keys(settingValueSchemas) as [SettingKey, ...SettingKey[]])

export const ipcContract = {
  'settings:get': {
    input: z.object({ key: settingKeySchema }),
    output: z.unknown(),
  },
  'settings:set': {
    input: z.object({ key: settingKeySchema, value: z.unknown() }),
    output: z.void(),
  },
  'app:info': {
    input: z.void(),
    output: z.object({
      dataDir: z.string(),
      dataDirOnOneDrive: z.boolean(),
      version: z.string(),
    }),
  },
  'dump:create': {
    input: dumpCreateInputSchema,
    output: dumpItemSchema,
  },
  'dump:list': {
    input: z.object({ status: dumpStatusSchema }),
    output: z.array(dumpItemSchema),
  },
  'dump:count': {
    input: z.void(),
    output: z.object({ pending: z.number() }),
  },
  /** Soft delete: öğe çöp kutusuna gider, `activity_log`'a yazılır. */
  'dump:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'dump:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'collection:list': {
    input: z.void(),
    output: z.array(collectionSummarySchema),
  },
  'collection:create': {
    input: collectionCreateInputSchema,
    output: collectionSummarySchema,
  },
  'collection:rename': {
    input: collectionRenameInputSchema,
    output: z.void(),
  },
  /** Soft delete; `withNotes`'ta notlar da aynı `group_id` ile çöp kutusuna gider. */
  'collection:delete': {
    input: collectionDeleteInputSchema,
    output: z.void(),
  },
  /** Son silmeyi grubuyla birlikte geri alır (koleksiyonsuz bırakılan notlar da geri bağlanır). */
  'collection:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Etiketler `note:update` ile örtük oluşur; sadece canlı notu olanlar listelenir. */
  'tag:list': {
    input: z.void(),
    output: z.array(tagSummarySchema),
  },
  'note:list': {
    input: noteListInputSchema,
    output: z.array(noteSummarySchema),
  },
  /** Silinmiş ya da bulunamayan not için null. */
  'note:get': {
    input: z.object({ id: z.string() }),
    output: noteSchema.nullable(),
  },
  'note:create': {
    input: noteCreateInputSchema,
    output: noteSchema,
  },
  /** Kısmi güncelleme; `tags` verilirse etiket listesinin tamamının yerine geçer. */
  'note:update': {
    input: noteUpdateInputSchema,
    output: noteSummarySchema,
  },
  'note:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'note:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** FTS5; son kelime önek eşleşir. */
  'note:search': {
    input: z.object({ query: z.string().max(200) }),
    output: z.array(noteSearchResultSchema),
  },
  /** Komut paletinin Notlar grubu. */
  'note:titles': {
    input: z.void(),
    output: z.array(z.object({ id: z.string(), title: z.string() })),
  },
  /** Fikirler listesi: silinmemiş tüm fikirler, karar bekleyen önce (domain/incubation). */
  'idea:list': {
    input: z.void(),
    output: z.array(ideaSummarySchema),
  },
  /** Yeni fikir = yeni not + 14 günlük kuluçka. */
  'idea:create': {
    input: z.void(),
    output: noteSchema,
  },
  /** Kuluçka kararı (Evet → aktif, Hayır → arşiv), arşivleme ve geri alma. `activity_log`'a yazılır. */
  'idea:setStatus': {
    input: ideaSetStatusInputSchema,
    output: z.void(),
  },
  /** Fikir editörde açıldı: radarın `last_opened_at` sinyali. Log'a yazılmaz. */
  'idea:opened': {
    input: z.object({ noteId: z.string() }),
    output: z.void(),
  },
  /** Bugün'deki kuluçka ve radar karoları. */
  'idea:today': {
    input: z.void(),
    output: ideaTodaySchema,
  },
  /** Editöre yapıştırılan / sürüklenen resim; `media/`'ya yazılır. */
  'media:store': {
    input: mediaStoreInputSchema,
    output: z.object({ url: z.string() }),
  },
} as const satisfies Record<IpcChannel, { input: z.ZodType; output: z.ZodType }>

// Sözleşmede fazladan kanal varsa derleme hatası: ipc-channels.ts listesiyle birebir olmalı.
const _noExtraChannels: IpcChannel = '' as keyof typeof ipcContract
void _noExtraChannels

export type IpcInput<C extends IpcChannel> = z.input<(typeof ipcContract)[C]['input']>
export type IpcOutput<C extends IpcChannel> = z.output<(typeof ipcContract)[C]['output']>

/** `window.api` — preload'un açtığı köprü. Mantık içermez. */
export interface WindowApi {
  invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>>
  /** Pencere açılmadan önce ana süreçte DB'den okunan tema; ilk boyamada yanıp sönmeyi önler. */
  initialTheme: Theme
}
