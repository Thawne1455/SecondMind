// Kanal adları ve preload'un ihtiyaç duyduğu sabitler. zod içermez: sandbox'lı preload paketine
// şema kütüphanesi girmesin diye `ipc.ts`'ten ayrı. `ipc.ts`'teki sözleşme bu listeyle derleme
// zamanında birebir eşleşmek zorunda.

export const ipcChannels = [
  'settings:get',
  'settings:set',
  'app:info',
  'dump:create',
  'dump:list',
  'dump:count',
  'dump:delete',
  'dump:restore',
  'collection:list',
  'collection:create',
  'collection:rename',
  'collection:delete',
  'collection:restore',
  'tag:list',
  'note:list',
  'note:get',
  'note:create',
  'note:update',
  'note:delete',
  'note:restore',
  'note:search',
  'note:titles',
  'idea:list',
  'idea:create',
  'idea:setStatus',
  'idea:opened',
  'idea:today',
  'media:store',
  'task:list',
  'task:listProject',
  'task:create',
  'task:update',
  'task:setDone',
  'task:delete',
  'task:restore',
  'task:split',
  'reminder:list',
  'reminder:create',
  'reminder:update',
  'reminder:delete',
  'reminder:restore',
  'reminder:resolveMissed',
  'routine:list',
  'routine:create',
  'routine:update',
  'routine:delete',
  'routine:restore',
  'schedule:today',
  'schedule:reschedule',
  'schedule:move',
  'schedule:unpin',
  'schedule:start',
  'checkin:today',
  'checkin:set',
  'achievement:week',
  'project:list',
  'project:create',
  'project:update',
  'project:opened',
  'project:scanInfo',
  'project:nextSteps',
  'milestone:list',
  'project:delete',
  'project:restore',
  'project:pickFolder',
  'project:inspectFolder',
  'project:openFolder',
  'session:start',
  'session:close',
  'session:discard',
  'session:list',
  'parking:list',
  'parking:add',
  'parking:resolve',
  'parking:restore',
  'park:hide',
  'scan:run',
] as const
export type IpcChannel = (typeof ipcChannels)[number]

/** Ana süreçten renderer'a olaylar (`window.api.on`). */
export const ipcEvents = [
  /** Hatırlatmalar değişti (çaldı ya da kaçırıldı): listeler yenilenir. */
  'reminders:changed',
  /** Bildirime tıklandı: Bugün'e git. */
  'nav:today',
  /** Projeler, oturumlar ya da park alanı başka pencereden (park penceresi) değişti. */
  'projects:changed',
  /** Park penceresi (Ctrl Alt P) yeniden gösterildi: alan temizlenir, proje yeniden seçilir. */
  'park:shown',
] as const
export type IpcEvent = (typeof ipcEvents)[number]

export type Theme = 'light' | 'dark'

/** Ana süreçten preload'a ilk temayı taşıyan komut satırı argümanı. */
export const THEME_ARG_PREFIX = '--sm-theme='
