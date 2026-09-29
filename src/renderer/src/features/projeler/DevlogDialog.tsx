import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Copy, FolderDown, Save } from 'lucide-react'
import type { DevlogDraft, ProjectSummary } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import {
  Button,
  Chip,
  DialogFrame,
  IconButton,
  Kbd,
  ModalPanel,
  Skeleton,
  Textarea,
  useToast,
} from '../../ui'
import { useAddLogNote, useDevlogDraft } from './useLog'

// Devlog taslağı (PROJELER.md > 5. Günlük, 5d-3): seçilen haftanın verisinden şablonla metin. AI yok.
// Markdown (Discord / itch.io) ya da Steam BBCode; taslak düzenlenebilir, Kopyala panoya yazar,
// Günlüğe kaydet not olarak ekler; görseller ayrıca klasöre çıkarılır.

export const DEVLOG_EMPTY =
  'Bu hafta kayıt yok. Bir oturum aç ya da commit at, taslak kendiliğinden dolar.'

type Props = { project: ProjectSummary; open: boolean; onClose: () => void }

export function DevlogDialog({ project, open, onClose }: Props) {
  return (
    <DialogFrame open={open} onClose={onClose} label="Devlog taslağı" width={760} placement="high">
      {open && <DevlogForm project={project} onClose={onClose} />}
    </DialogFrame>
  )
}

function DevlogForm({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const [weekOf, setWeekOf] = useState<string | null>(null)
  const draft = useDevlogDraft(project.id, weekOf, true)
  const d = draft.data
  const shift = (days: number) =>
    d && setWeekOf(format(addDays(parseISO(d.weekStart), days), 'yyyy-MM-dd'))

  return (
    <ModalPanel
      title={d ? `Devlog · Hafta ${d.week}` : 'Devlog'}
      fill={project.color}
      onClose={onClose}
      headerExtra={
        <span className="flex items-center gap-1">
          <IconButton
            label="Önceki hafta"
            icon={ChevronLeft}
            variant="onTileGhost"
            className="size-9"
            onClick={() => shift(-7)}
          />
          <IconButton
            label="Sonraki hafta"
            icon={ChevronRight}
            variant="onTileGhost"
            className="size-9"
            disabled={
              !!d &&
              format(addDays(parseISO(d.weekStart), 7), 'yyyy-MM-dd') >
                format(new Date(), 'yyyy-MM-dd')
            }
            onClick={() => shift(7)}
          />
        </span>
      }
      hints={
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Kbd>Ctrl D</Kbd> açar · şablon, AI yok
        </span>
      }
    >
      {!d ? (
        <Skeleton className="h-[320px] rounded-field" />
      ) : d.empty ? (
        <p className="m-0 rounded-field bg-s2 px-5 py-6 text-[16px] font-bold">{DEVLOG_EMPTY}</p>
      ) : (
        // Hafta değişince düzenlenen metin sıfırlanır.
        <DraftBody key={d.weekStart} project={project} draft={d} weekOf={weekOf} />
      )}
    </ModalPanel>
  )
}

function DraftBody({
  project,
  draft: d,
  weekOf,
}: {
  project: ProjectSummary
  draft: DevlogDraft
  weekOf: string | null
}) {
  const [formatId, setFormatId] = useState<'markdown' | 'bbcode'>('markdown')
  const [text, setText] = useState({ markdown: d.markdown, bbcode: d.bbcode })
  const save = useAddLogNote()
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const current = text[formatId]

  return (
    <>
      <div className="flex items-center gap-2">
        <Chip selected={formatId === 'markdown'} onClick={() => setFormatId('markdown')}>
          Markdown · Discord / itch.io
        </Chip>
        <Chip selected={formatId === 'bbcode'} onClick={() => setFormatId('bbcode')}>
          Steam BBCode
        </Chip>
      </div>
      <Textarea
        data-autofocus
        rows={14}
        value={current}
        aria-label="Taslak"
        onChange={(e) => setText({ ...text, [formatId]: e.target.value })}
        className="font-mono text-[13px]"
      />
      {d.images.length > 0 && (
        <div className="flex items-center gap-2">
          {d.images.map((img) => (
            <img
              key={img.name}
              src={img.url}
              alt={img.name}
              title={img.name}
              className="h-14 w-auto rounded-[10px]"
            />
          ))}
          <span className="grow" />
          <Button
            size="sm"
            variant="secondary"
            icon={FolderDown}
            onClick={() =>
              void window.api
                .invoke('devlog:exportImages', { projectId: project.id, weekOf })
                .then(
                  (r) =>
                    r &&
                    toast({ domain: 'projects', message: `${r.count} görsel çıkarıldı: ${r.dir}` }),
                  onError,
                )
            }
          >
            Görselleri klasöre çıkar
          </Button>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          icon={Save}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { projectId: project.id, bodyMd: text.markdown, kind: 'devlog' },
              {
                onSuccess: () =>
                  toast({ domain: 'projects', message: 'Devlog Günlüğe kaydedildi.' }),
                onError,
              },
            )
          }
        >
          Günlüğe kaydet
        </Button>
        <Button
          icon={Copy}
          onClick={() =>
            void navigator.clipboard
              .writeText(current)
              .then(
                () => toast({ domain: 'projects', message: 'Taslak panoya kopyalandı.' }),
                onError,
              )
          }
        >
          Kopyala
        </Button>
      </div>
    </>
  )
}
