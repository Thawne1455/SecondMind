import { z } from 'zod'
import type { IpcChannel, IpcEvent, Theme } from './ipc-channels'
import { aiProcessInputSchema, aiStatusSchema } from './schemas/aiRun'
import { claudeInfoSchema, claudeTestResultSchema, localModelInfoSchema } from './schemas/aiSetup'
import { activityListInputSchema, activityListSchema, inboxSchema } from './schemas/inbox'
import { dumpCreateInputSchema, dumpItemSchema, dumpStatusSchema } from './schemas/dump'
import {
  collectionCreateInputSchema,
  collectionDeleteInputSchema,
  collectionRenameInputSchema,
  collectionSetAiExcludedInputSchema,
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
import {
  ASSET_TITLE_MAX,
  assetAddInputSchema,
  assetSchema,
  shotAddInputSchema,
  timeMachineSchema,
} from './schemas/shots'
import { devlogDraftSchema, LOG_NOTE_MAX, logPageSchema } from './schemas/log'
import {
  countRuleSchema,
  gddComparisonSchema,
  docCreateInputSchema,
  docFileSuggestionSchema,
  docMoveInputSchema,
  docSchema,
  docSearchResultSchema,
  docSummarySchema,
  docUpdateInputSchema,
} from './schemas/docs'
import {
  playtestOverviewSchema,
  playtestPasteInputSchema,
  playtestPreviewSchema,
  playtestWriteSchema,
  PLAYTEST_TEXT_MAX,
} from './schemas/playtest'
import {
  assignmentSaveInputSchema,
  attendanceMarkSchema,
  attendanceQuestionSchema,
  componentKindSchema,
  courseDetailSchema,
  courseListItemSchema,
  courseSaveInputSchema,
  courseSchema,
  examPrepSchema,
  examSaveInputSchema,
  examTopicSetInputSchema,
  gpaOverviewSchema,
  instructorSaveInputSchema,
  instructorSchema,
  materialKindSchema,
  planPreviewSchema,
  schoolBoardSchema,
  schoolRestoreInputSchema,
  schoolSetupInputSchema,
  SCHOOL_TEXT_MAX,
  termSaveInputSchema,
  termSchema,
  topicSaveInputSchema,
} from './schemas/school'
import { checkinSchema, checkinSetInputSchema, weekAchievementsSchema } from './schemas/mind'
import {
  folderInspectionSchema,
  bridgeInstallInputSchema,
  bridgeStatusSchema,
  parkingAddInputSchema,
  parkingItemSchema,
  parkingResolveInputSchema,
  projectCreateInputSchema,
  projectSummarySchema,
  projectUpdateInputSchema,
  scanReportSchema,
  briefingSchema,
  nextStepSchema,
  milestoneSchema,
  milestoneCreateInputSchema,
  milestoneUpdateInputSchema,
  milestoneScopeSchema,
  releasePlatformSchema,
  calendarEntrySchema,
  projectScanInfoSchema,
  sessionCloseInputSchema,
  sessionSchema,
  sessionStartInputSchema,
} from './schemas/projects'
import {
  dayKeySchema,
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
  taskListProjectInputSchema,
  taskSchema,
  taskSplitInputSchema,
  taskUpdateInputSchema,
} from './schemas/planning'

export * from './ipc-channels'
export * from './schemas/aiRun'
export * from './schemas/aiSetup'
export * from './schemas/inbox'
export * from './schemas/dump'
export * from './schemas/knowledge'
export * from './schemas/mind'
export * from './schemas/planning'
export * from './schemas/playtest'
export * from './schemas/docs'
export * from './schemas/log'
export * from './schemas/shots'
export * from './schemas/projects'
export * from './schemas/school'

// IPC sözleşmesinin tek kaynağı. Kanal adları `alan:eylem` biçiminde.
// Ana süreç her girdiyi burada tanımlı şemayla doğrular.

export const themeSchema = z.enum(['light', 'dark']) satisfies z.ZodType<Theme>

/** Her ayar anahtarının değer şeması. Yeni ayar = buraya bir satır + `settingDefaults`. */
export const settingValueSchemas = {
  theme: themeSchema,
  /** Okul: sınav çalışma planında günlük en fazla çalışma (dk). */
  studyDailyMaxMin: z.number().int().min(30).max(720),
  /** AI: iş paketine giren kısa profil özeti (Ayarlar > AI). */
  aiProfile: z.string().max(2000),
  /** AI: `claude.exe` yolu; null = PATH ve `~/.local/bin`'de aranır. */
  aiClaudePath: z.string().min(1).max(500).nullable(),
  /** AI: DERİN'de Claude Code'un modeli (takma ad ya da tam ad). */
  aiDeepModel: z.string().min(1).max(80),
  /** AI: "AI ile İşle"de son seçilen model (HIZLI = yerel Qwen, DERİN = Claude Code). */
  aiModel: z.enum(['fast', 'deep']),
} as const

export type SettingKey = keyof typeof settingValueSchemas
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingValueSchemas)[K]>

export const settingDefaults: { [K in SettingKey]: SettingValue<K> } = {
  theme: 'light',
  studyDailyMaxMin: 180,
  aiProfile: '',
  aiClaudePath: null,
  aiDeepModel: 'sonnet',
  aiModel: 'fast',
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
  /** 'pending' kuyruğu döndürür: bekleyenler ve şu an işlenenler ('processing'). */
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
  /** Atlanan dökümü yeniden kuyruğa alır (gerekçe silinir). */
  'dump:requeue': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Bekleyen tüm dökümleri işlemeye başlar ve hemen döner; ilerleme `ai:status` + `ai:changed`. */
  'ai:process': {
    input: aiProcessInputSchema,
    output: z.object({ dumps: z.number() }),
  },
  'ai:status': {
    input: z.void(),
    output: aiStatusSchema,
  },
  /** Süren çalıştırmayı iptal eder; dökümler bekliyor'a döner. */
  'ai:cancel': {
    input: z.void(),
    output: z.void(),
  },
  // ---------------------------------------------------------------- Ayarlar > AI (4e-1)
  /** Yerel modelin durumu ve süren indirme; ilerleme `aiModel:changed` olayıyla. */
  'aiModel:status': {
    input: z.void(),
    output: localModelInfoSchema,
  },
  /** İndirmeyi başlatır ve hemen döner (yarım kalan indirme kaldığı yerden sürer). */
  'aiModel:download': {
    input: z.void(),
    output: z.void(),
  },
  'aiModel:cancelDownload': {
    input: z.void(),
    output: z.void(),
  },
  /** Model dosyasını siler; bellekteyse önce bırakır. AI çalışırken ya da indirme sürerken reddedilir. */
  'aiModel:delete': {
    input: z.void(),
    output: z.void(),
  },
  /** Claude Code'un ayarlı ve otomatik bulunan yolu. */
  'claude:info': {
    input: z.void(),
    output: claudeInfoSchema,
  },
  /** Sürüm + seçili modelle kısa bir deneme. Hata da sonuç olarak döner. */
  'claude:test': {
    input: z.void(),
    output: claudeTestResultSchema,
  },
  // ---------------------------------------------------------------- Onay Kutusu (4d)
  /** Bekleyen önerisi olan işler (kaynağa göre gruplar) + Düzenle formunun proje/ders seçicileri. */
  'proposal:list': {
    input: z.void(),
    output: inboxSchema,
  },
  /** Kenar çubuğu rozeti: bekleyen öneri sayısı. */
  'proposal:count': {
    input: z.void(),
    output: z.object({ pending: z.number() }),
  },
  /** Onayla; `edited` verilirse formdaki alanlar önerinin üstüne yazılır ve yeniden doğrulanır. */
  'proposal:approve': {
    input: z.object({ id: z.string(), edited: z.record(z.string(), z.unknown()).optional() }),
    output: z.void(),
  },
  'proposal:reject': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Grubun bekleyen bütün önerileri; her biri kendi transaction'ında, hata verenler bekliyor'da kalır. */
  'proposal:approveAll': {
    input: z.object({ jobId: z.string() }),
    output: z.object({
      applied: z.number(),
      failed: z.array(z.object({ id: z.string(), error: z.string() })),
    }),
  },
  'proposal:undo': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** İşlem günlüğü: son `days` günün kayıtları gruplar halinde. */
  'activity:list': {
    input: activityListInputSchema,
    output: activityListSchema,
  },
  /** Günlükten geri al (AI önerisi ya da Taha'nın gruplu işlemi). */
  'activity:undo': {
    input: z.object({ groupId: z.string() }),
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
  /** Koleksiyondaki notlar AI iş paketlerine girmesin (Ayarlar > AI). */
  'collection:setAiExcluded': {
    input: collectionSetAiExcludedInputSchema,
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
  'task:listProject': {
    input: taskListProjectInputSchema,
    output: z.array(taskSchema),
  },
  'task:create': {
    input: taskCreateInputSchema,
    output: taskSchema,
  },
  /** Kısmi güncelleme; `plannedDate` elle değişince erteleme sayılmaz; kanban kolonu durumu senkronlar. */
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
  /** Detay sayfası açıldı: önceki açılışa göre geri dönüş brifingini döner, sonra açılışı kaydeder. */
  'project:opened': {
    input: z.object({ id: z.string() }),
    output: briefingSchema.nullable(),
  },
  /** Kokpit'in tarama karoları (son anlık görüntü + bu haftanın commit'leri). */
  'project:scanInfo': {
    input: z.object({ id: z.string() }),
    output: projectScanInfoSchema.nullable(),
  },
  /** Sıradaki adım motoru: gerekçeli, sıralı adımlar. */
  'project:nextSteps': {
    input: z.object({ id: z.string() }),
    output: z.array(nextStepSchema),
  },
  /** Projenin kilometre taşları, sıraya göre. */
  'milestone:list': {
    input: z.object({ projectId: z.string() }),
    output: z.array(milestoneSchema),
  },
  /** Sona eklenir. */
  'milestone:create': {
    input: milestoneCreateInputSchema,
    output: milestoneSchema,
  },
  'milestone:update': {
    input: milestoneUpdateInputSchema,
    output: milestoneSchema,
  },
  /** Çöp kutusuna; bağlı görevler bağını korur, geri alınca yerine döner. */
  'milestone:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'milestone:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /**
   * Unity oyunu şablonu: 6 hazır taş (Mağaza sayfası kriterleri platforma göre) ve projenin yayın platformu.
   * Projede canlı taş varsa hata. Tek grupla loglanır.
   */
  'milestone:applyTemplate': {
    input: z.object({ projectId: z.string(), platform: releasePlatformSchema }),
    output: z.array(milestoneSchema),
  },
  /** Projenin tamamlanmamış taşlarının kapsam ölçeri ve bitiş tahmini. */
  'milestone:scope': {
    input: z.object({ projectId: z.string() }),
    output: z.array(milestoneScopeSchema),
  },
  /** Proje takvimi: verilen günler arası (dahil) taş hedefleri, son tarihli görevler, planlanmış bloklar. */
  'project:calendar': {
    input: z.object({ projectId: z.string(), from: dayKeySchema, to: dayKeySchema }),
    output: z.array(calendarEntrySchema),
  },
  /** Playtest kutusu: kümeler (boşlar gizli) ve son 30 günün test edenleri. */
  'playtest:overview': {
    input: z.object({ projectId: z.string() }),
    output: playtestOverviewSchema,
  },
  /** "Kim" otomatik tamamlaması: bütün projelerdeki adlar, en yeni önce. */
  'playtest:testers': {
    input: z.void(),
    output: z.array(z.string()),
  },
  /** Yapıştırma önizlemesi (DB'ye dokunmaz): tanınan kişiler ve nokta sayısı. */
  'playtest:preview': {
    input: z.object({ text: z.string().max(PLAYTEST_TEXT_MAX), receivedOn: dayKeySchema }),
    output: playtestPreviewSchema,
  },
  /** Yapıştırmayı kaydeder: bölme ve kümeleme ana süreçte. Tek grupla loglanır. */
  'playtest:paste': {
    input: playtestPasteInputSchema,
    output: playtestWriteSchema.extend({ points: z.number(), newClusters: z.number() }),
  },
  /** Noktayı başka kümeye taşır; elle yerleşim kilitlenir. */
  'playtest:move': {
    input: z.object({ pointId: z.string(), clusterId: z.string() }),
    output: playtestWriteSchema,
  },
  /** Noktayı ayırır: kendi kümesi olur ve kilitlenir. */
  'playtest:split': {
    input: z.object({ pointId: z.string() }),
    output: playtestWriteSchema,
  },
  /** Kümeyi hataya ya da göreve çevirir (başlık en kısa nokta, açıklamada alıntılar ve kişiler). */
  'playtest:convert': {
    input: z.object({ clusterId: z.string(), kind: z.enum(['bug', 'task']).default('bug') }),
    output: playtestWriteSchema.extend({ taskId: z.string() }),
  },
  /** Bir playtest yazımını (grubunu) geri alır. */
  'playtest:undo': {
    input: playtestWriteSchema,
    output: z.void(),
  },
  /** Projenin doküman sayfaları (ağaç renderer'da kurulur), kardeş sırasıyla. */
  'doc:list': {
    input: z.object({ projectId: z.string() }),
    output: z.array(docSummarySchema),
  },
  /** Sayfa; bağlı dosyada gövde diskten, salt okunur. */
  'doc:get': {
    input: z.object({ id: z.string() }),
    output: docSchema,
  },
  /** Kardeşlerin sonuna eklenir. ADR üstsüzse "Kararlar" sayfasının altına (yoksa açılır), gövde şablonla. */
  'doc:create': {
    input: docCreateInputSchema,
    output: docSummarySchema,
  },
  /** Başlık/gövde otomatik kaydı; `kind: 'gdd'` öncekinin işaretini kaldırır. Bağlı dosyada gövde reddedilir. */
  'doc:update': {
    input: docUpdateInputSchema,
    output: docSummarySchema,
  },
  /** Ağaçta taşı; kendi alt ağacına taşınamaz. */
  'doc:move': {
    input: docMoveInputSchema,
    output: z.void(),
  },
  /** Sayfa ve alt sayfaları çöp kutusuna (tek grup). */
  'doc:delete': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Silmeyi geri alır; alt sayfalar da döner. */
  'doc:restore': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Türün şablon ağacı (GDD / Teknik / Yaratıcı); projede sayfa varken hata. */
  'doc:applyTemplate': {
    input: z.object({ projectId: z.string() }),
    output: z.array(docSummarySchema),
  },
  /** Klasörlerdeki bağlanmamış markdown dosyaları (GDD'ye benzeyen önce). Klasöre yazmaz. */
  'doc:suggestFiles': {
    input: z.object({ projectId: z.string() }),
    output: z.array(docFileSuggestionSchema),
  },
  /** Markdown dosyasını salt okunur sayfa olarak bağlar (kopyalamaz). */
  'doc:linkFile': {
    input: z.object({ projectId: z.string(), path: z.string().min(1) }),
    output: docSummarySchema,
  },
  /** Bağlı dosyayı varsayılan uygulamada açar ("Klasörde düzenle"). */
  'doc:openFile': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Doküman araması (FTS); proje verilirse sadece o proje. */
  'doc:search': {
    input: z.object({ query: z.string().max(200), projectId: z.string().optional() }),
    output: z.array(docSearchResultSchema),
  },
  /** GDD ile gerçeklik: GDD sayfasının sayıları ↔ klasör sayımları. GDD yoksa null. Klasörü sadece okur. */
  'gdd:compare': {
    input: z.object({ projectId: z.string() }),
    output: gddComparisonSchema.nullable(),
  },
  /** Sayım kuralı (GDD etiketi ↔ glob); glob null kuralı kaldırır. */
  'gdd:setRule': {
    input: z.object({
      projectId: z.string(),
      label: countRuleSchema.shape.label,
      glob: countRuleSchema.shape.glob.nullable(),
    }),
    output: z.array(countRuleSchema),
  },
  /** Günlük: `until` gününden (varsayılan bugün) geriye 30 günün öğeleri, gün gün en yeni önce. */
  'log:list': {
    input: z.object({ projectId: z.string(), until: dayKeySchema.nullish() }),
    output: logPageSchema,
  },
  /** Günlüğe serbest not ya da kaydedilmiş devlog taslağı (bugüne). */
  'log:addNote': {
    input: z.object({
      projectId: z.string(),
      bodyMd: z.string().trim().min(1, 'Not boş').max(LOG_NOTE_MAX),
      kind: z.enum(['note', 'devlog']).default('note'),
    }),
    output: z.object({ id: z.string() }),
  },
  'log:deleteNote': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'log:restoreNote': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Haftanın devlog taslağı (Markdown + BBCode); hafta verilmezse bu hafta. */
  'devlog:draft': {
    input: z.object({ projectId: z.string(), weekOf: dayKeySchema.nullish() }),
    output: devlogDraftSchema,
  },
  /** Taslağın görsellerini seçilen klasöre kopyalar; vazgeçilirse null. */
  'devlog:exportImages': {
    input: z.object({ projectId: z.string(), weekOf: dayKeySchema.nullish() }),
    output: z.object({ dir: z.string(), count: z.number() }).nullable(),
  },
  /** Zaman makinesi: kareler (en yeni önce), bağlı görüntü klasörleri ve öneriler. Klasörleri sadece okur. */
  'shot:machine': {
    input: z.object({ projectId: z.string() }),
    output: timeMachineSchema,
  },
  /** Yapıştırılan kare (oturum kapanışı ya da galeri); `media/`'ya kopyalanır. */
  'shot:add': {
    input: shotAddInputSchema,
    output: z.object({ id: z.string() }),
  },
  /** Yıldız ya da çöp kutusu (geri almak için `deleted: false`). */
  'shot:update': {
    input: z.object({
      id: z.string(),
      starred: z.boolean().optional(),
      deleted: z.boolean().optional(),
    }),
    output: z.void(),
  },
  /** Görüntü klasörü bağla / kaldır; bağlanınca yeni kareler hemen alınır. */
  'shot:bindDir': {
    input: z.object({ folderId: z.string(), path: z.string().min(1).max(500), bound: z.boolean() }),
    output: z.object({ added: z.number() }),
  },
  /** Varlıklar (en yeni önce); yaratıcı projede klasör envanterindeki ses/görsel dosyaları da. */
  'asset:list': {
    input: z.object({ projectId: z.string() }),
    output: z.array(assetSchema),
  },
  /** Dosyayı `media/`'ya kopyalayıp varlık olarak ekler. */
  'asset:add': {
    input: assetAddInputSchema,
    output: z.object({ id: z.string() }),
  },
  /** Ad, sayfa/görev bağı ya da çöp kutusu. */
  'asset:update': {
    input: z.object({
      id: z.string(),
      title: z.string().max(ASSET_TITLE_MAX).optional(),
      docId: z.string().nullable().optional(),
      taskId: z.string().nullable().optional(),
      deleted: z.boolean().optional(),
    }),
    output: z.void(),
  },
  /** Varlığı varsayılan uygulamada açar. */
  'asset:open': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** Claude Code köprüsü: klasör başına kurulum durumu, eklenecek CLAUDE.md bölümü ve Editor betiği. */
  'bridge:status': {
    input: z.object({ projectId: z.string() }),
    output: bridgeStatusSchema,
  },
  /** Köprüyü kurar: `.secondmind/`, seçilirse CLAUDE.md bölümü, Editor betiği, .gitignore satırı; BAGLAM.md yazılır. */
  'bridge:install': {
    input: bridgeInstallInputSchema,
    output: z.void(),
  },
  /** Köprünün eklediklerini geri alır; oturum raporları ve kareler kalır. */
  'bridge:uninstall': {
    input: z.object({ folderId: z.string() }),
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
  /** Güncelle: bağlı klasörleri tarar (projectId verilirse sadece o proje; arşivdekiler sadece böyle). */
  'scan:run': {
    input: z.object({ projectId: z.string().optional() }),
    output: scanReportSchema,
  },
  // ---------------------------------------------------------------- Okul (Aşama 6)
  'term:list': {
    input: z.void(),
    output: z.array(termSchema),
  },
  /** Oluştur ya da güncelle; `active` verilirse diğer dönemler arşive iner. */
  'term:save': {
    input: termSaveInputSchema,
    output: termSchema,
  },
  'term:activate': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** İlk kurulum sihirbazı: aktif dönem + dersler tek seferde. */
  'school:setup': {
    input: schoolSetupInputSchema,
    output: termSchema,
  },
  /** Dönem panosu; önce kaçırılan çalışma blokları yeniden dağıtılır. */
  'school:board': {
    input: z.void(),
    output: schoolBoardSchema,
  },
  /** Okul kayıtlarını çöp kutusuna atar (dönem dersleriyle birlikte). */
  'school:delete': {
    input: schoolRestoreInputSchema,
    output: z.void(),
  },
  'school:restore': {
    input: schoolRestoreInputSchema,
    output: z.void(),
  },
  'course:list': {
    input: z.object({ termId: z.string() }),
    output: z.array(courseListItemSchema),
  },
  'course:get': {
    input: z.object({ id: z.string() }),
    output: courseDetailSchema.nullable(),
  },
  /** Oluştur ya da güncelle (program, hoca adı, devam sınırı, harf tablosu, hedef harf). */
  'course:save': {
    input: courseSaveInputSchema,
    output: courseSchema,
  },
  'course:move': {
    input: z.object({ id: z.string(), dir: z.union([z.literal(-1), z.literal(1)]) }),
    output: z.void(),
  },
  'instructor:list': {
    input: z.void(),
    output: z.array(instructorSchema),
  },
  /** Yeni hoca `courseId` verilirse o derse bağlanır. */
  'instructor:save': {
    input: instructorSaveInputSchema.extend({ courseId: z.string().optional() }),
    output: z.object({ id: z.string() }),
  },
  'instructorNote:add': {
    input: z.object({ courseId: z.string(), text: z.string().trim().min(1).max(SCHOOL_TEXT_MAX) }),
    output: z.object({ id: z.string() }),
  },
  'week:setTitle': {
    input: z.object({
      courseId: z.string(),
      weekNo: z.number().int().min(1),
      title: z.string().max(200),
    }),
    output: z.void(),
  },
  /** Haftanın ders notu; yoksa oluşturur. */
  'week:note': {
    input: z.object({ courseId: z.string(), weekNo: z.number().int().min(1) }),
    output: z.object({ noteId: z.string() }),
  },
  'topic:save': {
    input: topicSaveInputSchema,
    output: z.object({ id: z.string() }),
  },
  /** "Anlamadım" işareti: hafta notundaki paragrafın metni. */
  'flag:add': {
    input: z.object({ noteId: z.string(), excerpt: z.string().trim().min(1).max(SCHOOL_TEXT_MAX) }),
    output: z.object({ id: z.string() }),
  },
  'flag:resolve': {
    input: z.object({ id: z.string(), resolved: z.boolean() }),
    output: z.void(),
  },
  /** Materyal (slayt PDF'i, tahta fotoğrafı…) `media/`'ya kopyalanır. */
  'material:add': {
    input: assetAddInputSchema.omit({ projectId: true }).extend({
      courseId: z.string(),
      weekNo: z.number().int().min(1).nullable(),
      kind: materialKindSchema,
    }),
    output: z.object({ id: z.string() }),
  },
  'material:update': {
    input: z.object({
      id: z.string(),
      title: z.string().max(200).optional(),
      kind: materialKindSchema.optional(),
      weekNo: z.number().int().min(1).nullable().optional(),
    }),
    output: z.void(),
  },
  /** Sistemdeki varsayılan uygulamayla açar. */
  'material:open': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  /** PDF görüntüleyici için dosyanın baytları. */
  'material:bytes': {
    input: z.object({ id: z.string() }),
    output: z.instanceof(Uint8Array),
  },
  'component:save': {
    input: z.object({
      id: z.string().optional(),
      courseId: z.string(),
      name: z.string().trim().min(1).max(60),
      kind: componentKindSchema,
      weight: z.number().min(0).max(100),
    }),
    output: z.object({ id: z.string() }),
  },
  'grade:set': {
    input: z.object({ componentId: z.string(), score: z.number().min(0).max(100).nullable() }),
    output: z.void(),
  },
  'exam:save': {
    input: examSaveInputSchema,
    output: z.object({ id: z.string() }),
  },
  'exam:prep': {
    input: z.object({ id: z.string() }),
    output: examPrepSchema.nullable(),
  },
  'examTopic:set': {
    input: examTopicSetInputSchema,
    output: z.void(),
  },
  /** Planın önizlemesi (yazmaz). */
  'exam:planPreview': {
    input: z.object({ id: z.string() }),
    output: planPreviewSchema,
  },
  /** "Planı onayla": başlamamış planlı blokların yerine yeni plan. */
  'exam:planApply': {
    input: z.object({ id: z.string() }),
    output: z.object({ blocks: z.number() }),
  },
  'exam:planClear': {
    input: z.object({ id: z.string() }),
    output: z.void(),
  },
  'study:setStatus': {
    input: z.object({ id: z.string(), status: z.enum(['planned', 'done']) }),
    output: z.void(),
  },
  'assignment:save': {
    input: assignmentSaveInputSchema,
    output: z.object({ id: z.string() }),
  },
  /** Bir ders saatinin o günkü yoklaması; null işareti kaldırır. */
  'attendance:set': {
    input: z.object({
      slotId: z.string(),
      day: dayKeySchema,
      status: attendanceMarkSchema.nullable(),
    }),
    output: z.void(),
  },
  /** Bugün biten, yoklaması girilmemiş dersler ("Derse katıldın mı?"). */
  'attendance:questions': {
    input: z.void(),
    output: z.array(attendanceQuestionSchema),
  },
  'gpa:overview': {
    input: z.void(),
    output: gpaOverviewSchema,
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
