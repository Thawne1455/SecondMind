import { getDb } from '../db/client'
import { countPendingDumps, createDump, deleteDump, listDumps, restoreDump } from '../db/dump'
import { storeMedia } from '../media'
import type { DataPaths } from '../paths'
import { handle } from './handle'

export function registerDumpIpc(paths: DataPaths): void {
  handle('dump:create', ({ text, attachments }) => {
    const db = getDb()
    const files = attachments.map((a) => storeMedia(db, paths.media, a))
    return createDump(db, text, files)
  })

  handle('dump:list', ({ status }) => listDumps(getDb(), status))

  handle('dump:count', () => ({ pending: countPendingDumps(getDb()) }))

  handle('dump:delete', ({ id }) => deleteDump(getDb(), id))

  handle('dump:restore', ({ id }) => restoreDump(getDb(), id))
}
