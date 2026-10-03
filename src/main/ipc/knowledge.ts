import { MEDIA_URL } from '@shared/ipc'
import { getDb } from '../db/client'
import {
  createCollection,
  createNote,
  deleteCollection,
  deleteNote,
  getNote,
  listCollections,
  listNotes,
  listNoteTitles,
  listTags,
  renameCollection,
  setCollectionAiExcluded,
  restoreCollection,
  restoreNote,
  searchNotes,
  updateNote,
} from '../db/knowledge'
import { createIdea, ideaToday, listIdeas, markIdeaOpened, setIdeaStatus } from '../db/ideas'
import { storeMedia } from '../media'
import type { DataPaths } from '../paths'
import { handle } from './handle'

export function registerKnowledgeIpc(paths: DataPaths): void {
  handle('collection:list', () => listCollections(getDb()))
  handle('collection:create', ({ name }) => createCollection(getDb(), name))
  handle('collection:rename', ({ id, name }) => renameCollection(getDb(), id, name))
  handle('collection:setAiExcluded', ({ id, aiExcluded }) =>
    setCollectionAiExcluded(getDb(), id, aiExcluded),
  )
  handle('collection:delete', ({ id, mode }) => deleteCollection(getDb(), id, mode))
  handle('collection:restore', ({ id }) => restoreCollection(getDb(), id))

  handle('tag:list', () => listTags(getDb()))

  handle('note:list', (filter) => listNotes(getDb(), filter))
  handle('note:get', ({ id }) => getNote(getDb(), id))
  handle('note:create', ({ collectionId, projectId }) =>
    createNote(getDb(), collectionId, projectId),
  )
  handle('note:update', (input) => updateNote(getDb(), input))
  handle('note:delete', ({ id }) => deleteNote(getDb(), id))
  handle('note:restore', ({ id }) => restoreNote(getDb(), id))
  handle('note:search', ({ query }) => searchNotes(getDb(), query))
  handle('note:titles', () => listNoteTitles(getDb()))

  handle('idea:list', () => listIdeas(getDb()))
  handle('idea:create', () => createIdea(getDb()))
  handle('idea:setStatus', (input) => setIdeaStatus(getDb(), input))
  handle('idea:opened', ({ noteId }) => markIdeaOpened(getDb(), noteId))
  handle('idea:today', () => ideaToday(getDb()))

  handle('media:store', (file) => ({
    url: MEDIA_URL + storeMedia(getDb(), paths.media, file).fileName,
  }))
}
