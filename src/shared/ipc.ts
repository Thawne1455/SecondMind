import { z } from 'zod'
import type { IpcChannel, Theme } from './ipc-channels'
import { dumpCreateInputSchema, dumpItemSchema, dumpStatusSchema } from './schemas/dump'

export * from './ipc-channels'
export * from './schemas/dump'

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
