// Geliştirme betiklerinin (seed, ai-try) ortak güvenlik kontrolü: gerçek veri klasörüne
// (%USERPROFILE%\SecondMind ya da uygulamanın config.json'daki dataDir'i) asla yazılmaz.

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, win32 } from 'node:path'
import { defaultDataDir } from '../src/main/domain/dataDir'

const same = (a: string, b: string) =>
  win32.resolve(a).replace(/\\+$/, '').toLowerCase() ===
  win32.resolve(b).replace(/\\+$/, '').toLowerCase()

/** Uygulamanın kendi config.json'unda seçili veri klasörü (userData = %APPDATA%\secondmind). */
function configuredDataDir(): string | null {
  const appData = process.env['APPDATA']
  if (!appData) return null
  const file = join(appData, 'secondmind', 'config.json')
  if (!existsSync(file)) return null
  try {
    const dir = (JSON.parse(readFileSync(file, 'utf8')) as { dataDir?: unknown }).dataDir
    return typeof dir === 'string' && dir ? dir : null
  } catch {
    return null
  }
}

export function isRealDataDir(dataDir: string): boolean {
  const real = [defaultDataDir(homedir()), configuredDataDir()].filter((d): d is string => !!d)
  return real.some((d) => same(d, dataDir))
}
