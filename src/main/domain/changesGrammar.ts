// Yerel modelin çıktısını zorlayan JSON şeması (node-llama-cpp `createGrammarForJsonSchema`).
// `changesSchema`'nın (shared/schemas/ai.ts) grammar'ın desteklediği alt kümeye çevrilmiş hali: grammar'da her alan
// zorunludur, opsiyonel alan `null` alabilir; desen (regex) yoktur, onu zod yakalar. Şema değişince burası da değişir;
// `changesGrammar.test.ts` iki tarafın alanlarının aynı kaldığını denetler.

const id = { type: 'string', maxLength: 64 } as const
const str = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength }) as const
const nullable = <T extends object>(s: T) => ({ oneOf: [s, { type: 'null' }] }) as const
const sourceDumpIds = { type: 'array', items: id, minItems: 1, maxItems: 20 } as const
const context = nullable({
  type: 'object',
  properties: { projectId: nullable(id), courseId: nullable(id) },
})
/** "YYYY-MM-DD" */
const date = { type: 'string', format: 'date' } as const
const int = { type: 'integer' } as const

const op = <N extends string, P extends Record<string, unknown>>(name: N, properties: P) =>
  ({ type: 'object', properties: { op: { const: name }, sourceDumpIds, ...properties } }) as const

export const OPERATION_GRAMMARS = [
  op('create_task', {
    title: str(200),
    context,
    dueDate: nullable(date),
    estimateMin: nullable(int),
    kind: nullable({ enum: ['task', 'bug', 'research'] }),
  }),
  op('create_note', {
    title: str(200),
    bodyMd: { type: 'string', maxLength: 8000 },
    context,
    collection: nullable(str(60)),
  }),
  op('append_to_note', { noteId: id, appendMd: str(8000) }),
  // "YYYY-MM-DDTHH:mm": grammar'ın date-time biçimi saniye ve saat dilimi ister, bu yüzden düz metin.
  op('create_reminder', { title: str(200), at: { type: 'string', minLength: 16, maxLength: 16 } }),
  op('create_idea', { title: str(200), note: nullable({ type: 'string', maxLength: 4000 }) }),
  op('create_exam', {
    courseId: id,
    title: str(120),
    date,
    time: nullable({ type: 'string', minLength: 5, maxLength: 5 }),
    weekFrom: nullable(int),
    weekTo: nullable(int),
  }),
  op('set_project_next_step', { projectId: id, text: str(300) }),
  op('add_instructor_note', { courseId: id, text: str(2000) }),
] as const

export const CHANGES_GRAMMAR = {
  type: 'object',
  properties: {
    version: { const: 1 },
    operations: { type: 'array', items: { oneOf: OPERATION_GRAMMARS }, maxItems: 40 },
    unprocessed: {
      type: 'array',
      items: { type: 'object', properties: { dumpId: id, reason: str(300) } },
      maxItems: 50,
    },
  },
} as const
