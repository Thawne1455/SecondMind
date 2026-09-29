import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { format, parseISO } from 'date-fns'
import { tr } from 'date-fns/locale'
import { Check, CircleHelp, FileText, Image as ImageIcon, Paperclip, Plus, Star, Trash2, X } from 'lucide-react'
import type { CourseDetail, CourseWeek, Material, MaterialKind } from '@shared/ipc'
import { errorText } from '../../lib/errors'
import { Button, cn, DropZone, IconButton, Input, Modal, Select, Skeleton, useToast } from '../../ui'
import { useNote } from '../bilgi/useKnowledge'
import { PdfViewer } from './PdfViewer'
import { useSchoolWrite } from './useSchool'
import { WeekNoteEditor } from './WeekNoteEditor'

// Ders detayı > Hafta hafta: dersin kalbi (OKUL.md). Solda 14 haftalık dikey şerit (tarih, konu, not var mı,
// materyal ve "anlamadım" sayısı; içinde bulunulan hafta vurgulu), sağda seçili haftanın defteri: konu başlığı,
// konular (hoca vurguladı ★), ders notu, "anlamadım" işaretleri ve materyaller (PDF satır içi).

const MATERIAL_KIND: Record<MaterialKind, string> = {
  slide: 'Slayt',
  board: 'Tahta',
  syllabus: 'İzlence',
  other: 'Diğer',
}

const range = (w: CourseWeek) =>
  `${format(parseISO(w.start), 'd MMM', { locale: tr })} – ${format(parseISO(w.end), 'd MMM', { locale: tr })}`

export function WeekTab({ detail }: { detail: CourseDetail }) {
  const weeks = detail.weeks
  // Sınav hazırlığından "3. hafta"ya tıklanınca ?hafta=3 ile gelinir.
  const [params] = useSearchParams()
  const asked = Number(params.get('hafta'))
  const initial = Math.min(Math.max(asked || detail.currentWeek, 1), weeks.length || 1)
  const [selected, setSelected] = useState(initial)
  const week = weeks.find((w) => w.weekNo === selected) ?? weeks[0]

  return (
    <section aria-label="Hafta hafta" className="flex min-h-[560px] gap-6">
      <nav aria-label="Haftalar" className="flex w-[300px] shrink-0 flex-col gap-1">
        {weeks.map((w) => {
          const current = w.weekNo === detail.currentWeek
          const isSel = w.weekNo === week?.weekNo
          return (
            <button
              key={w.weekNo}
              type="button"
              onClick={() => setSelected(w.weekNo)}
              aria-current={isSel}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors duration-150',
                'focus-visible:outline-3 focus-visible:outline-indigo',
                isSel ? 'bg-ink text-on-ink' : current ? 'bg-sky text-fill-ink' : 'hover:bg-s2',
              )}
            >
              <span className="x w-7 shrink-0 text-[22px] leading-none font-black">{w.weekNo}</span>
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-[14px] font-bold">
                  {w.title || (w.topics[0]?.name ?? <span className="opacity-50">Konu yok</span>)}
                </span>
                <span className="x text-[12px] font-semibold opacity-60">{range(w)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-bold">
                {w.hasNote && <FileText size={14} strokeWidth={2} aria-label="Not var" />}
                {w.materialCount > 0 && (
                  <span className="flex items-center gap-0.5" title={`${w.materialCount} materyal`}>
                    <Paperclip size={13} strokeWidth={2} aria-hidden />
                    {w.materialCount}
                  </span>
                )}
                {w.openFlags > 0 && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-coral px-1.5 text-white"
                    title={`${w.openFlags} anlamadım`}
                  >
                    <CircleHelp size={12} strokeWidth={2.5} aria-hidden />
                    {w.openFlags}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </nav>
      {week && <WeekNotebook key={week.weekNo} detail={detail} week={week} />}
    </section>
  )
}

function WeekNotebook({ detail, week }: { detail: CourseDetail; week: CourseWeek }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const courseId = detail.course.id
  const ro = detail.readOnly
  const setTitle = useSchoolWrite('week:setTitle')
  const saveTopic = useSchoolWrite('topic:save')
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const createNote = useSchoolWrite('week:note')
  const addFlag = useSchoolWrite('flag:add')
  const resolveFlag = useSchoolWrite('flag:resolve')
  const [title, setTitleText] = useState(week.title)
  const [topic, setTopic] = useState('')
  const flags = detail.flags.filter((f) => f.weekNo === week.weekNo)

  function addTopic() {
    const name = topic.trim()
    if (!name) return
    saveTopic.mutate({ courseId, weekNo: week.weekNo, name }, { onSuccess: () => setTopic(''), onError })
  }

  return (
    <div className="flex min-w-0 grow flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="cx text-ink3">
          {week.weekNo}. hafta · {range(week)}
        </span>
        <input
          value={title}
          disabled={ro}
          maxLength={200}
          placeholder="Haftanın konusu"
          aria-label="Haftanın konusu"
          onChange={(e) => setTitleText(e.target.value)}
          onBlur={() =>
            title !== week.title && setTitle.mutate({ courseId, weekNo: week.weekNo, title }, { onError })
          }
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-full border-0 bg-transparent text-[28px] leading-[1.2] font-extrabold text-ink outline-none placeholder:text-ink3"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="cx mr-1">Konular</span>
        {week.topics.map((t) => (
          <span
            key={t.id}
            className={cn(
              'inline-flex h-[34px] items-center gap-1 rounded-full pr-1 pl-3 text-[14px] font-bold',
              t.emphasized ? 'bg-sky text-fill-ink' : 'bg-s2',
            )}
          >
            {t.name}
            <button
              type="button"
              disabled={ro}
              aria-pressed={t.emphasized}
              title={t.emphasized ? 'Hoca vurguladı · kaldır' : 'Hoca vurguladı ("sınavda çıkar")'}
              onClick={() =>
                saveTopic.mutate({ id: t.id, courseId, name: t.name, emphasized: !t.emphasized }, { onError })
              }
              className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-hover"
            >
              <Star size={15} strokeWidth={2} fill={t.emphasized ? 'currentColor' : 'none'} aria-hidden />
            </button>
            {!ro && (
              <button
                type="button"
                aria-label={`${t.name} konusunu sil`}
                onClick={() =>
                  remove.mutate(
                    { table: 'topics', id: t.id },
                    {
                      onSuccess: () =>
                        toast({
                          message: `${t.name} silindi.`,
                          domain: 'school',
                          action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'topics', id: t.id }) },
                        }),
                      onError,
                    },
                  )
                }
                className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-hover"
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            )}
          </span>
        ))}
        {!ro && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addTopic()
            }}
            className="flex items-center gap-1"
          >
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="+ Konu"
              maxLength={200}
              className="h-[34px] w-[200px] text-[14px]"
            />
          </form>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="cx">Ders notu</span>
        {week.noteId ? (
          <WeekNotePane
            noteId={week.noteId}
            onFlag={(excerpt) =>
              addFlag.mutate(
                { noteId: week.noteId!, excerpt },
                { onSuccess: () => toast({ message: 'İşaretlendi · hocaya sor listesinde.', domain: 'school' }), onError },
              )
            }
          />
        ) : (
          <div className="flex items-center gap-3 rounded-tile bg-s2 px-5 py-4">
            <span className="grow text-ink2">Bu hafta için not yok.</span>
            <Button
              size="sm"
              icon={Plus}
              disabled={ro}
              loading={createNote.isPending}
              onClick={() => createNote.mutate({ courseId, weekNo: week.weekNo }, { onError })}
            >
              Not al
            </Button>
          </div>
        )}
      </div>

      {flags.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-tile bg-s2 px-5 py-4">
          <span className="cx">Anlamadım · hocaya sor</span>
          {flags.map((f) => (
            <div key={f.id} className="flex items-start gap-3">
              <label className="flex grow cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={f.resolved}
                  disabled={ro}
                  title="Çözüldü"
                  onChange={() => resolveFlag.mutate({ id: f.id, resolved: !f.resolved }, { onError })}
                  className="mt-1 size-4 accent-[var(--ink)]"
                />
                <span className={cn('grow text-[14px]', f.resolved && 'text-ink3 line-through')}>{f.excerpt}</span>
              </label>
              {!ro && (
                <IconButton
                  label="İşareti sil"
                  icon={X}
                  className="size-7"
                  onClick={() =>
                    remove.mutate(
                      { table: 'note_flags', id: f.id },
                      {
                        onSuccess: () =>
                          toast({
                            message: 'İşaret silindi.',
                            domain: 'school',
                            action: { label: 'Geri al', onClick: () => restore.mutate({ table: 'note_flags', id: f.id }) },
                          }),
                        onError,
                      },
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}

      <Materials detail={detail} weekNo={week.weekNo} />
    </div>
  )
}

function WeekNotePane({ noteId, onFlag }: { noteId: string; onFlag: (excerpt: string) => void }) {
  const note = useNote(noteId)
  if (note.isPending) return <Skeleton className="h-40" lines={5} />
  if (!note.data) return <span className="text-ink3">Not bulunamadı.</span>
  return <WeekNoteEditor key={note.data.id} note={note.data} onFlag={onFlag} />
}

function Materials({ detail, weekNo }: { detail: CourseDetail; weekNo: number }) {
  const { toast } = useToast()
  const onError = (e: unknown) => toast({ message: errorText(e), domain: 'warning' })
  const add = useSchoolWrite('material:add')
  const update = useSchoolWrite('material:update')
  const remove = useSchoolWrite('school:delete')
  const restore = useSchoolWrite('school:restore')
  const [openPdf, setOpenPdf] = useState<Material | null>(null)
  const [openImage, setOpenImage] = useState<Material | null>(null)
  const items = detail.materials.filter((m) => m.weekNo === weekNo)
  const ro = detail.readOnly
  const openExternal = (m: Material) => void window.api.invoke('material:open', { id: m.id }).catch(onError)

  async function onFiles(files: File[]) {
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const kind: MaterialKind = f.type === 'application/pdf' ? 'slide' : f.type.startsWith('image/') ? 'board' : 'other'
      add.mutate(
        { courseId: detail.course.id, weekNo, kind, name: f.name, mime: f.type || 'application/octet-stream', bytes },
        { onError },
      )
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="cx">Materyaller · {items.length}</span>
      {openPdf && (
        <PdfViewer
          key={openPdf.id}
          materialId={openPdf.id}
          title={openPdf.title}
          onClose={() => setOpenPdf(null)}
          onOpenExternal={() => openExternal(openPdf)}
        />
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {items.map((m) => {
            const isPdf = m.mime === 'application/pdf'
            const isImage = m.mime.startsWith('image/')
            return (
              <div key={m.id} className="flex flex-col gap-2 rounded-[20px] bg-s2 p-3">
                <button
                  type="button"
                  onClick={() => (isPdf ? setOpenPdf(m) : isImage ? setOpenImage(m) : openExternal(m))}
                  className="flex h-[110px] cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-bg focus-visible:outline-3 focus-visible:outline-indigo"
                >
                  {isImage ? (
                    <img src={m.url} alt="" className="size-full object-cover" />
                  ) : isPdf ? (
                    <span className="cx flex items-center gap-2 text-ink2">
                      <FileText size={22} strokeWidth={1.75} aria-hidden /> PDF · aç
                    </span>
                  ) : (
                    <ImageIcon size={22} strokeWidth={1.75} aria-hidden />
                  )}
                </button>
                <span className="truncate text-[14px] font-bold" title={m.title}>
                  {m.title}
                </span>
                <div className="flex items-center gap-1.5">
                  <Select
                    aria-label="Materyal türü"
                    disabled={ro}
                    value={m.kind}
                    onChange={(e) => update.mutate({ id: m.id, kind: e.target.value as MaterialKind }, { onError })}
                    className="h-[34px] text-[13px]"
                  >
                    {Object.entries(MATERIAL_KIND).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  {!ro && (
                    <IconButton
                      label="Materyali sil"
                      icon={Trash2}
                      onClick={() =>
                        remove.mutate(
                          { table: 'course_materials', id: m.id },
                          {
                            onSuccess: () =>
                              toast({
                                message: `${m.title} silindi.`,
                                domain: 'school',
                                action: {
                                  label: 'Geri al',
                                  onClick: () => restore.mutate({ table: 'course_materials', id: m.id }),
                                },
                              }),
                            onError,
                          },
                        )
                      }
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!ro && (
        <DropZone
          onFiles={(f) => void onFiles(f)}
          accept="application/pdf,image/*,.ppt,.pptx,.doc,.docx"
          label="Slayt PDF'i, tahta fotoğrafı ya da hocanın dosyasını bırak"
        />
      )}
      <Modal
        open={!!openImage}
        onClose={() => setOpenImage(null)}
        domain="school"
        width={1000}
        title={openImage?.title ?? ''}
        actions={
          openImage && (
            <Button variant="secondary" onClick={() => openExternal(openImage)}>
              Uygulamada aç
            </Button>
          )
        }
      >
        {openImage && <img src={openImage.url} alt={openImage.title} className="max-h-[70vh] w-full object-contain" />}
      </Modal>
      {add.isPending && (
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink3">
          <Check size={14} aria-hidden /> Yükleniyor…
        </span>
      )}
    </div>
  )
}
