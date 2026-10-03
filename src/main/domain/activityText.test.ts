import { describe, expect, it } from 'vitest'
import {
  canUndoGroup,
  describeGroup,
  describeRow,
  groupActivity,
  isUndoGroup,
  type ActivityRow,
} from './activityText'

let seq = 0
function row(over: Partial<ActivityRow>): ActivityRow {
  seq++
  return {
    id: `01J${String(seq).padStart(4, '0')}`,
    actor: 'ai',
    action: 'create',
    targetTable: 'tasks',
    targetId: `t${seq}`,
    before: null,
    after: { title: 'Menü müziğini kırp' },
    groupId: 'g1',
    undone: false,
    at: 1_000 + seq,
    ...over,
  }
}

describe('describeRow', () => {
  it('eklemeyi tür ve başlıkla yazar', () => {
    expect(describeRow(row({}))).toBe('Görev eklendi: Menü müziğini kırp')
  })

  it('güncellemede değişen bilinen alanları ekler', () => {
    const r = row({
      action: 'update',
      targetTable: 'projects',
      before: { name: 'Runika', nextStep: 'Eski', updatedAt: 1 },
      after: { name: 'Runika', nextStep: 'Yeni', updatedAt: 2 },
    })
    expect(describeRow(r)).toBe('Proje güncellendi: Runika (sıradaki adım)')
  })

  it('deletedAt dolunca silindi, boşalınca geri yüklendi der', () => {
    const del = row({
      action: 'update',
      targetTable: 'notes',
      before: { title: 'Fizik', deletedAt: null },
      after: { title: 'Fizik', deletedAt: '2026-10-03T10:00:00.000Z' },
    })
    expect(describeRow(del)).toBe('Not silindi: Fizik')
    expect(describeRow({ ...del, before: del.after, after: del.before })).toBe(
      'Not geri yüklendi: Fizik',
    )
  })

  it('başlığı markdown işaretlerinden temizler, metin yoksa başlıksız yazar', () => {
    expect(
      describeRow(
        row({ targetTable: 'notes', after: { title: '', bodyMd: 'x', text: '## Özet\nyok' } }),
      ),
    ).toBe('Not eklendi: Özet')
    expect(describeRow(row({ targetTable: 'attendance', after: { status: 'present' } }))).toBe(
      'Yoklama eklendi',
    )
  })

  it('bilinmeyen tabloda tablo adını kullanır', () => {
    expect(describeRow(row({ targetTable: 'yeni_tablo', after: null }))).toBe('yeni_tablo eklendi')
  })
})

describe('describeGroup', () => {
  it('aynı tür ve fiildeki kayıtları sayıyla birleştirir', () => {
    const rows = [
      ...Array.from({ length: 12 }, () =>
        row({ actor: 'scan', targetTable: 'commits', after: { message: 'm' } }),
      ),
      row({
        actor: 'scan',
        action: 'update',
        targetTable: 'projects',
        before: { name: 'Runika' },
        after: { name: 'Runika' },
      }),
    ]
    expect(describeGroup(rows)).toEqual({
      lines: ['12 commit eklendi', 'Proje güncellendi: Runika'],
      more: 0,
    })
  })

  it('en fazla üç cümle verir, kalanı sayar', () => {
    const rows = ['tasks', 'notes', 'reminders', 'exams', 'projects'].map((t) =>
      row({ targetTable: t }),
    )
    const out = describeGroup(rows)
    expect(out.lines).toHaveLength(3)
    expect(out.more).toBe(2)
  })
})

describe('groupActivity', () => {
  it('aynı grubu toplar, grupsuz kaydı ayrı tutar, sırayı korur', () => {
    const a = row({ groupId: 'g1' })
    const b = row({ groupId: null, actor: 'taha' })
    const c = row({ groupId: 'g1' })
    const groups = groupActivity([c, b, a])
    expect(groups.map((g) => g.key)).toEqual(['g1', b.id])
    expect(groups[0]!.rows.map((r) => r.id)).toEqual([a.id, c.id])
    expect(groups[0]!.at).toBe(c.at)
  })
})

describe('canUndoGroup', () => {
  const group = (rows: ActivityRow[]) => groupActivity(rows)[0]!

  it("AI'ın ve Taha'nın gruplu işlemi geri alınabilir", () => {
    expect(canUndoGroup(group([row({ actor: 'ai' })]))).toBe(true)
    expect(canUndoGroup(group([row({ actor: 'taha', groupId: 'g2' })]))).toBe(true)
  })

  it('tekil, tarama, geri alınmış ve geri alma grupları geri alınamaz', () => {
    expect(canUndoGroup(group([row({ actor: 'taha', groupId: null })]))).toBe(false)
    expect(canUndoGroup(group([row({ actor: 'scan', groupId: 'g3' })]))).toBe(false)
    expect(canUndoGroup(group([row({ undone: true })]))).toBe(false)
    expect(
      canUndoGroup(group([row({ actor: 'taha', groupId: 'undo:g1', action: 'update' })])),
    ).toBe(false)
    expect(canUndoGroup(group([row({ actor: 'taha', groupId: 'g4', action: 'delete' })]))).toBe(
      false,
    )
  })

  it('geri alma grubunu tanır', () => {
    expect(isUndoGroup('undo:01J')).toBe(true)
    expect(isUndoGroup('01J')).toBe(false)
    expect(isUndoGroup(null)).toBe(false)
  })
})
