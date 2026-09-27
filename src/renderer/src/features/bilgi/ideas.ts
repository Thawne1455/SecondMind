import { useCallback } from 'react'
import type { IdeaSetStatusInput, IdeaStage, IdeaState } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { useToast } from '../../ui'
import { useSetIdeaStatus } from './useKnowledge'

export const UNTITLED_IDEA = 'Adsız fikir'

/** "KULUÇKADA · 5 GÜN KALDI" gibi durum satırı (büyük harfi `cx` yapar). */
export function ideaStageLabel(idea: Pick<IdeaState, 'stage' | 'daysLeft'>): string {
  switch (idea.stage) {
    case 'incubating':
      return `Kuluçkada · ${idea.daysLeft} gün kaldı`
    case 'due':
      return 'Karar bekliyor'
    case 'active':
      return 'Aktif'
    case 'project':
      return 'Proje oldu'
    case 'archived':
      return 'Arşivde'
  }
}

export const isOpenStage = (stage: IdeaStage) => stage !== 'archived' && stage !== 'project'

const DONE_TEXT: Record<IdeaSetStatusInput['status'], string> = {
  active: 'aktif fikirlere alındı',
  archived: 'arşivlendi',
  incubating: 'kuluçkaya döndü',
}

/** Fikir durumunu değiştirir ve toast'ta "Geri al" sunar (önceki duruma döner). */
export function useIdeaDecision() {
  const set = useSetIdeaStatus()
  const { toast } = useToast()
  return useCallback(
    (
      idea: { noteId: string; title: string; status: IdeaState['status'] },
      status: IdeaSetStatusInput['status'],
    ) => {
      const previous = idea.status
      set.mutate(
        { noteId: idea.noteId, status },
        {
          onSuccess: () =>
            toast({
              variant: 'band',
              domain: 'knowledge',
              message: `"${idea.title || UNTITLED_IDEA}" ${DONE_TEXT[status]}.`,
              action:
                previous === 'project'
                  ? undefined
                  : {
                      label: 'Geri al',
                      onClick: () => set.mutate({ noteId: idea.noteId, status: previous }),
                    },
            }),
          onError: (e) => toast({ message: errorText(e), domain: 'warning' }),
        },
      )
    },
    [set, toast],
  )
}
