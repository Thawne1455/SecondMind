import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  settingDefaults,
  settingValueSchemas,
  type SettingKey,
  type SettingValue,
} from '@shared/ipc'
import type { Db } from './client'
import { settings } from './schema'

export function getSetting<K extends SettingKey>(db: Db, key: K): SettingValue<K> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row) return settingDefaults[key]
  const parsed = settingValueSchemas[key].safeParse(JSON.parse(row.valueJson))
  return parsed.success ? (parsed.data as SettingValue<K>) : settingDefaults[key]
}

export function setSetting<K extends SettingKey>(db: Db, key: K, value: SettingValue<K>): void {
  const valueJson = JSON.stringify(value)
  db.insert(settings)
    .values({ id: ulid(), key, valueJson })
    .onConflictDoUpdate({ target: settings.key, set: { valueJson, updatedAt: new Date() } })
    .run()
}
