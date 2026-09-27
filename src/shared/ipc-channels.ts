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
] as const
export type IpcChannel = (typeof ipcChannels)[number]

export type Theme = 'light' | 'dark'

/** Ana süreçten preload'a ilk temayı taşıyan komut satırı argümanı. */
export const THEME_ARG_PREFIX = '--sm-theme='
