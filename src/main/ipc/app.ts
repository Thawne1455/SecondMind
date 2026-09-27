import { app } from 'electron'
import type { DataPaths } from '../paths'
import { handle } from './handle'

export function registerAppIpc(paths: DataPaths): void {
  handle('app:info', () => ({
    dataDir: paths.root,
    dataDirOnOneDrive: paths.onOneDrive,
    version: app.getVersion(),
  }))
}
