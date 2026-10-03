import { approveAll, approveProposal, rejectProposal, undoProposal } from '../db/ai'
import { getDb } from '../db/client'
import { activityList, inbox, pendingProposalCount, undoActivity } from '../db/inbox'
import { handle } from './handle'
import { broadcast } from './projects'

// Onay Kutusu (4d). Her karar ve geri alma `ai:changed` yayar (rozet, Döküm > İşlenenler); proje sıradaki adımı
// değişebildiği için `projects:changed` da (park penceresi).

function changed(): void {
  broadcast('ai:changed')
  broadcast('projects:changed')
}

export function registerInboxIpc(): void {
  handle('proposal:list', () => inbox(getDb()))
  handle('proposal:count', () => ({ pending: pendingProposalCount(getDb()) }))
  handle('proposal:approve', ({ id, edited }) => {
    approveProposal(getDb(), id, edited)
    changed()
  })
  handle('proposal:reject', ({ id }) => {
    rejectProposal(getDb(), id)
    changed()
  })
  handle('proposal:approveAll', ({ jobId }) => {
    const result = approveAll(getDb(), jobId)
    changed()
    return result
  })
  handle('proposal:undo', ({ id }) => {
    undoProposal(getDb(), id)
    changed()
  })
  handle('activity:list', (input) => activityList(getDb(), input))
  handle('activity:undo', ({ groupId }) => {
    undoActivity(getDb(), groupId)
    changed()
  })
}
