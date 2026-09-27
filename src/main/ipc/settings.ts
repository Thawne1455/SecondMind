import { settingValueSchemas, type SettingKey, type SettingValue } from '@shared/ipc'
import { getDb } from '../db/client'
import { getSetting, setSetting } from '../db/settings'
import { handle } from './handle'

export function registerSettingsIpc(onChange: (key: SettingKey) => void): void {
  handle('settings:get', ({ key }) => getSetting(getDb(), key))

  handle('settings:set', ({ key, value }) => {
    const parsed = settingValueSchemas[key].parse(value) as SettingValue<typeof key>
    setSetting(getDb(), key, parsed)
    onChange(key)
  })
}
