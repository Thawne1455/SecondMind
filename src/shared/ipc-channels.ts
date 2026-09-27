// Kanal adları ve preload'un ihtiyaç duyduğu sabitler. zod içermez: sandbox'lı preload paketine
// şema kütüphanesi girmesin diye `ipc.ts`'ten ayrı. `ipc.ts`'teki sözleşme bu listeyle derleme
// zamanında birebir eşleşmek zorunda.

export const ipcChannels = ['settings:get', 'settings:set', 'app:info'] as const
export type IpcChannel = (typeof ipcChannels)[number]

export type Theme = 'light' | 'dark'

/** Ana süreçten preload'a ilk temayı taşıyan komut satırı argümanı. */
export const THEME_ARG_PREFIX = '--sm-theme='
