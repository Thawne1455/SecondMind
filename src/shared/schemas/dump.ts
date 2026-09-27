import { z } from 'zod'

// Döküm kanallarının şemaları. Sözleşme `ipc.ts`'te, burada sadece veri şekilleri.

export const DUMP_TEXT_MAX = 20_000
export const DUMP_ATTACHMENTS_MAX = 10
export const ATTACHMENT_BYTES_MAX = 25 * 1024 * 1024

/** `sm-media://` protokolünün kökü; `media/` içindeki dosyalar `${MEDIA_URL}<ad>` ile gösterilir. */
export const MEDIA_URL = 'sm-media://m/'

export const dumpKindSchema = z.enum(['text', 'image', 'file'])
export const dumpStatusSchema = z.enum(['pending', 'processing', 'processed', 'skipped'])

export const attachmentInputSchema = z.object({
  name: z.string().max(260),
  mime: z.string().max(200),
  bytes: z
    .instanceof(Uint8Array)
    .refine((b) => b.byteLength > 0, 'Boş dosya')
    .refine((b) => b.byteLength <= ATTACHMENT_BYTES_MAX, 'Dosya 25 MB sınırını aşıyor'),
})

export const dumpCreateInputSchema = z
  .object({
    text: z.string().max(DUMP_TEXT_MAX),
    attachments: z.array(attachmentInputSchema).max(DUMP_ATTACHMENTS_MAX),
  })
  .refine((d) => d.text.trim().length > 0 || d.attachments.length > 0, 'Döküm boş')

export const dumpAttachmentSchema = z.object({
  mediaId: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  url: z.string(),
})

export const dumpItemSchema = z.object({
  id: z.string(),
  kind: dumpKindSchema,
  content: z.string(),
  status: dumpStatusSchema,
  /** Unix ms. */
  createdAt: z.number(),
  attachments: z.array(dumpAttachmentSchema),
})

export type DumpKind = z.infer<typeof dumpKindSchema>
export type DumpStatus = z.infer<typeof dumpStatusSchema>
export type DumpAttachment = z.infer<typeof dumpAttachmentSchema>
export type DumpItem = z.infer<typeof dumpItemSchema>
export type DumpCreateInput = z.input<typeof dumpCreateInputSchema>
