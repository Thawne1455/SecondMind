import { win32 } from 'node:path'

/** Varsayılan veri klasörü: %USERPROFILE%\SecondMind (Belgeler değil, OneDrive'dan uzak). */
export function defaultDataDir(homeDir: string): string {
  return win32.join(homeDir, 'SecondMind')
}

const ONEDRIVE_ENV_KEYS = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']

/**
 * Yol OneDrive tarafından senkronlanan bir klasörün altında mı?
 * OneDrive ortam değişkenlerindeki köklere ve yol parçalarında
 * `OneDrive` / `OneDrive - Kurum` klasörüne bakar.
 */
export function isUnderOneDrive(path: string, env: Record<string, string | undefined>): boolean {
  const target = normalize(path)
  const underRoot = ONEDRIVE_ENV_KEYS.map((k) => env[k])
    .filter((v): v is string => !!v)
    .map(normalize)
    .some((root) => target === root || target.startsWith(root + '\\'))
  if (underRoot) return true
  return target.split('\\').some((part) => part === 'onedrive' || part.startsWith('onedrive - '))
}

function normalize(p: string): string {
  return win32.resolve(p).replace(/\\+$/, '').toLowerCase()
}
