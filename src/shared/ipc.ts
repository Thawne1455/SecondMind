import { z } from 'zod'
import type { IpcChannel, IpcEvent, Theme } from './ipc-channels'
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
import { checkinSchema, checkinSetInputSchema, weekAchievementsSchema } from './schemas/mind'
import {
  folderInspectionSchema,
  parkingAddInputSchema,
  parkingItemSchema,
  parkingResolveInputSchema,
  projectCreateInputSchema,
  projectSummarySchema,
  projectUpdateInputSchema,
  sessionCloseInputSchema,
  sessionSchema,
  sessionStartInputSchema,
} from './schemas/projects'
import {
  reminderCreateInputSchema,
  reminderResolveInputSchema,
  reminderSchema,
  reminderUpdateInputSchema,
  routineCreateInputSchema,
  routineSchema,
  routineUpdateInputSchema,
  scheduleDaySchema,
  scheduleMoveInputSchema,
  taskCreateInputSchema,
  taskListInputSchema,
  taskSchema,
  taskSplitInputSchema,
  taskUpdateInputSchema,
} from './schemas/planning'

export * from './ipc-channels'
export * from './schemas/dump'
export * from './schemas/knowledge'
export * from './schemas/mind'
export * from './schemas/planning'
export * from './schemas/projects'

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
  /** Açık görevler `domain/tasks` sırasıyla (bugünkü önce); bitenler en yeni önce, en fazla 100. */
  'task:list': {
    input: taskListInputSchema,
    output: z.array(taskSchema),
  },
  'task:create': {
    input: taskCreateInputSchema,
    output: taskSchema,
  },
  /** Kısmi güncelleme; `plannedDate` elle değişince erteleme sayılmaz. */
  'task:update': {
    input: taskUpdateInputSchema,
    output: taskSchema,
  },
  'task:setDone': {
    input: z.object({ id: z.string(), done: z.boolean() }),
    output: taskSchema,
  },
  'task:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'task:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Parçalar bugüne yeni görev olur, asıl görev çöp kutusuna; tek grupla loglanır. */
  'task:split': {
    input: taskSplitInputSchema,
    output: z.array(taskSchema),
  },
  /** Bekleyen ve kaçırılmış (ele alınmamış) hatırlatmalar, sıradaki çalmaya göre. */
  'reminder:list': {
    input: z.void(),
    output: z.array(reminderSchema),
  },
  'reminder:create': {
    input: reminderCreateInputSchema,
    output: reminderSchema,
  },
  /** Zaman ya da kural değişirse yeniden kurulur (kaçırılmışlık silinir). */
  'reminder:update': {
    input: reminderUpdateInputSchema,
    output: reminderSchema,
  },
  'reminder:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'reminder:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Kaçırılanlar: bugünkü göreve çevir ya da kapat. Tek grupla loglanır. */
  'reminder:resolveMissed': {
    input: reminderResolveInputSchema,
    output: z.object({ taskIds: z.array(z.string()) }),
  },
  'routine:list': {
    input: z.void(),
    output: z.array(routineSchema),
  },
  'routine:create': {
    input: routineCreateInputSchema,
    output: routineSchema,
  },
  'routine:update': {
    input: routineUpdateInputSchema,
    output: routineSchema,
  },
  'routine:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'routine:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /**
   * Bugünün yerleşimi. Her okumada önce gün sonu kaydırması, sonra kayıtlı yerleşimi koruyarak
   * bloğu olmayan görevlerin yerleştirilmesi (fill) çalışır.
   */
  'schedule:today': {
    input: z.void(),
    output: scheduleDaySchema,
  },
  /** "Yeniden yerleştir": sabitlenmemiş, başlamamış ve kaçırılmış bloklar yeniden yerleşir. */
  'schedule:reschedule': {
    input: z.void(),
    output: scheduleDaySchema,
  },
  /** Görev bloğunu taşır ve o gün için sabitler (geçmişe taşınamaz). */
  'schedule:move': {
    input: scheduleMoveInputSchema,
    output: scheduleDaySchema,
  },
  'schedule:unpin': {
    input: z.object({ id: z.string() }),
    output: scheduleDaySchema,
  },
  /** "Başla": görevin bloğu şimdiye çekilir (yoksa oluşur) ve sabitlenir. */
  'schedule:start': {
    input: z.object({ taskId: z.string() }),
    output: scheduleDaySchema,
  },
  /** Bugünün günlük kaydı; henüz yoksa null. */
  'checkin:today': {
    input: z.void(),
    output: checkinSchema.nullable(),
  },
  /** Bugünün kaydını oluşturur ya da verilen alanları günceller. */
  'checkin:set': {
    input: checkinSetInputSchema,
    output: checkinSchema,
  },
  /** Bugün karosu "Bu hafta başardıkların". */
  'achievement:week': {
    input: z.void(),
    output: weekAchievementsSchema,
  },
  /** Canlı projeler (arşiv dahil) liste sırasıyla: aktif, oturumu süren, son etkinlik. */
  'project:list': {
    input: z.void(),
    output: z.array(projectSummarySchema),
  },
  'project:create': {
    input: projectCreateInputSchema,
    output: z.object({ id: z.string() }),
  },
  /** Kısmi güncelleme; durum `archived` olunca `archived_at` dolar. */
  'project:update': {
    input: projectUpdateInputSchema,
    output: z.void(),
  },
  /** Detay sayfası açıldı (`last_opened_at`); log'a yazılmaz. */
  'project:opened': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Çöp kutusuna; süren oturum varsa şimdi kapanır. */
  'project:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'project:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Sistem klasör seçicisi; vazgeçilirse null. */
  'project:pickFolder': {
    input: z.void(),
    output: z.string().nullable(),
  },
  /** Klasörden ad, tür, Unity sürümü, git ve renk tahmini. Klasöre yazmaz. */
  'project:inspectFolder': {
    input: z.object({ path: z.string().min(1) }),
    output: folderInspectionSchema,
  },
  /** Bağlı klasörü Gezgin'de açar. */
  'project:openFolder': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Oturum açar. Aynı projede süren varsa onu döndürür; başka projede süren varsa hata. */
  'session:start': {
    input: sessionStartInputSchema,
    output: sessionSchema,
  },
  /** Oturumu kapatır, projenin sıradaki adımını günceller (tek grupla loglanır). */
  'session:close': {
    input: sessionCloseInputSchema,
    output: sessionSchema,
  },
  /** Yanlışlıkla açılan oturumu kayıt bırakmadan atar (çöp kutusuna). */
  'session:discard': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Projenin oturumları, en yeni önce. */
  'session:list': {
    input: z.object({ projectId: z.string(), limit: z.number().int().min(1).max(200).default(20) }),
    output: z.array(sessionSchema),
  },
  /** Bekleyen park öğeleri, en yeni önce; proje verilmezse hepsi. */
  'parking:list': {
    input: z.object({ projectId: z.string().optional() }),
    output: z.array(parkingItemSchema),
  },
  'parking:add': {
    input: parkingAddInputSchema,
    output: parkingItemSchema,
  },
  /** Göreve çevir (projenin görevi olur) ya da at. */
  'parking:resolve': {
    input: parkingResolveInputSchema,
    output: z.object({ taskId: z.string().nullable() }),
  },
  /** Çevirmeyi / atmayı geri alır (çevrilmiş görev çöp kutusuna gider). */
  'parking:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Park penceresini gizler; odak önceki uygulamaya döner. */
  'park:hide': {
    input: z.void(),
    output: z.void(),
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
  /** Ana süreç olayına abone olur; dönen fonksiyon aboneliği kaldırır. */
  on(event: IpcEvent, listener: () => void): () => void
  /** Pencere açılmadan önce ana süreçte DB'den okunan tema; ilk boyamada yanıp sönmeyi önler. */
  initialTheme: Theme
}
