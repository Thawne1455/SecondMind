import { describe, expect, it } from 'vitest'
import {
  areaClassifier,
  countAreas,
  defaultAreaRules,
  diffInventory,
  diffKeys,
  findTodos,
  GIT_LOG_FORMAT,
  lastTouch,
  OTHER_AREA,
  parseBuildScenes,
  parseGitLog,
  parsePorcelainZ,
  renamedPath,
  needsHash,
  scanToastText,
  summarizeUncommitted,
  todoKeys,
} from './scan'

describe('alan kuralları', () => {
  const unity = areaClassifier(defaultAreaRules('unity'))

  it('Unity varsayılanları dosyaları alanlara ayırır', () => {
    expect(unity('Assets/Scripts/Boss/BossPhase.cs')).toBe('Kod')
    expect(unity('Assets/Scenes/Main.unity')).toBe('Sahneler')
    expect(unity('Assets/Prefabs/Orb.prefab')).toBe('Prefab')
    expect(unity('Assets/Audio/boss_loop.asset')).toBe('Ses')
    expect(unity('Assets/Music/menu.wav')).toBe('Ses')
    expect(unity('Assets/Sprites/rune.png')).toBe('Görsel')
    expect(unity('Assets/Anim/idle.anim')).toBe('Animasyon')
    expect(unity('Assets/Data/RoundConfig.asset')).toBe('Veri')
    expect(unity('RUNIKA_notlar.md')).toBe('Doküman')
    expect(unity('ProjectSettings/ProjectSettings.asset')).toBe('Ayarlar')
    expect(unity('Packages/manifest.json')).toBe('Ayarlar')
    expect(unity('Captures/')).toBe(OTHER_AREA)
  })

  it('büyük/küçük harf duyarsız', () => {
    expect(unity('assets/scripts/a.CS')).toBe('Kod')
  })

  it('yazılım: test kodu Kod değil Test', () => {
    const sw = areaClassifier(defaultAreaRules('software'))
    expect(sw('src/main/domain/scan.test.ts')).toBe('Test')
    expect(sw('src/main/domain/scan.ts')).toBe('Kod')
    expect(sw('docs/PROJELER.md')).toBe('Doküman')
    expect(sw('package.json')).toBe('Ayarlar')
    expect(sw('src/main/db/migrations/0008_scan.sql')).toBe('Ayarlar')
  })

  it('sayım en kalabalık alan önce', () => {
    const counts = countAreas(
      ['Assets/a.cs', 'Assets/b.cs', 'Assets/Music/x.wav', 'Assets/c.cs'],
      unity,
    )
    expect(Object.entries(counts)).toEqual([
      ['Kod', 3],
      ['Ses', 1],
    ])
  })
})

describe('git log', () => {
  it('biçim ve numstat ayrıştırılır', () => {
    const raw =
      '\x1eabc123\x1fTaha\x1f1790000000\x1fBoss fazı 2 müziği\n\n' +
      '12\t3\tAssets/Scripts/Boss.cs\n' +
      '-\t-\tAssets/Music/boss.wav\n' +
      '\x1edef456\x1fTaha\x1f1789990000\x1fİlk commit\x1f(ayraçlı)\n\n' +
      '1\t0\tREADME.md\n'
    const commits = parseGitLog(raw)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({
      hash: 'abc123',
      author: 'Taha',
      committedAt: new Date(1790000000 * 1000),
      message: 'Boss fazı 2 müziği',
      files: [
        { path: 'Assets/Scripts/Boss.cs', added: 12, deleted: 3 },
        { path: 'Assets/Music/boss.wav', added: 0, deleted: 0 },
      ],
    })
    expect(commits[1]!.message).toBe('İlk commit\x1f(ayraçlı)')
    expect(GIT_LOG_FORMAT).toContain('%x1e')
  })

  it('dosyasız (merge) commit de alınır', () => {
    expect(parseGitLog('\x1eaaa\x1fT\x1f1\x1fMerge\n')[0]!.files).toEqual([])
  })

  it('yeniden adlandırma yeni yolu verir', () => {
    expect(renamedPath('Assets/{Old => New}/a.cs')).toBe('Assets/New/a.cs')
    expect(renamedPath('Assets/{ => Sub}/a.cs')).toBe('Assets/Sub/a.cs')
    expect(renamedPath('a.cs => b.cs')).toBe('b.cs')
    expect(renamedPath('plain.cs')).toBe('plain.cs')
  })
})

describe('git status', () => {
  it('porcelain -z ayrıştırılır, yeniden adlandırmanın eski yolu atlanır', () => {
    const raw = ' M Assets/a.cs\0R  yeni.cs\0eski.cs\0?? Captures/\0D  sil.cs\0'
    expect(parsePorcelainZ(raw)).toEqual([
      { path: 'Assets/a.cs', code: 'M' },
      { path: 'yeni.cs', code: 'R' },
      { path: 'Captures/', code: '??' },
      { path: 'sil.cs', code: 'D' },
    ])
  })

  it('özet: alanlar, en eski değişiklik', () => {
    const classify = areaClassifier(defaultAreaRules('unity'))
    const s = summarizeUncommitted(
      [
        { path: 'Assets/a.cs', mtime: 3000 },
        { path: 'Assets/Data/x.asset', mtime: 1000 },
        { path: 'Assets/sil.cs', mtime: null },
      ],
      classify,
    )
    expect(s.count).toBe(3)
    expect(s.oldestAt).toBe(1000)
    expect(s.areas).toEqual({ Kod: 2, Veri: 1 })
    expect(s.files[0]!.path).toBe('Assets/sil.cs')
  })

  it('boş durum', () => {
    expect(summarizeUncommitted([], () => 'x')).toEqual({
      count: 0,
      areas: {},
      oldestAt: null,
      files: [],
    })
  })
})

describe('koddaki notlar', () => {
  it('yorumdaki etiketler bulunur, düz metin bulunmaz', () => {
    const src = [
      'void Update() {',
      '  // TODO: kamera sarsıntısını ayarlara bağla',
      '  var todo = 1; // FIXME(taha) patlıyor',
      '  /* HACK geçici çözüm */',
      '  Debug.Log("TODO değil");',
      '  // todo küçük harf sayılmaz',
      '  # TODO python',
      '   * TODO jsdoc satırı',
      '}',
    ].join('\r\n')
    expect(findTodos('Assets/Cam.cs', src)).toEqual([
      { path: 'Assets/Cam.cs', line: 2, tag: 'TODO', text: 'kamera sarsıntısını ayarlara bağla' },
      { path: 'Assets/Cam.cs', line: 3, tag: 'FIXME', text: 'taha) patlıyor' },
      { path: 'Assets/Cam.cs', line: 4, tag: 'HACK', text: 'geçici çözüm' },
      { path: 'Assets/Cam.cs', line: 7, tag: 'TODO', text: 'python' },
      { path: 'Assets/Cam.cs', line: 8, tag: 'TODO', text: 'jsdoc satırı' },
    ])
  })

  it('tırnak içindeki yorum işareti not sayılmaz', () => {
    const src = [
      "write('a.cs', '// TODO: test verisi')",
      'const re = "# FIXME örnek" // TODO: gerçek not',
      "const s = 'kaçışlı \\' // HACK hâlâ metin'",
      "var c = 'x'; // HACK tek karakter sonrası gerçek",
    ].join('\n')
    expect(findTodos('a.ts', src).map((t) => [t.line, t.tag])).toEqual([
      [2, 'TODO'],
      [4, 'HACK'],
    ])
  })

  it('kimlik satır numarasına bağlı değil, aynı metin sıra alır', () => {
    const a = todoKeys([
      { path: 'A.cs', line: 3, tag: 'TODO', text: 'Şunu  yap' },
      { path: 'A.cs', line: 9, tag: 'TODO', text: 'şunu yap' },
    ])
    const b = todoKeys([{ path: 'a.cs', line: 40, tag: 'TODO', text: 'şunu yap' }])
    expect(a[0]).toBe(b[0])
    expect(a[1]).toBe(`${a[0]}#2`)
  })

  it('fark: eklenen ve çözülen', () => {
    expect(diffKeys(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], resolved: ['a'], kept: ['b'] })
  })
})

describe('Unity yapı sahneleri', () => {
  it('EditorBuildSettings sıralı okunur', () => {
    const yaml = [
      '%YAML 1.1',
      '--- !u!1045 &1',
      'EditorBuildSettings:',
      '  m_ObjectHideFlags: 0',
      '  m_Scenes:',
      '  - enabled: 1',
      '    path: Assets/Scenes/Menu.unity',
      '    guid: 8c9c',
      '  - enabled: 0',
      '    path: Assets/Scenes/Prova.unity',
      '    guid: 1111',
      '  m_configObjects:',
      '    com.unity.input.settings.actions: {fileID: 1}',
    ].join('\n')
    expect(parseBuildScenes(yaml)).toEqual([
      { path: 'Assets/Scenes/Menu.unity', enabled: true },
      { path: 'Assets/Scenes/Prova.unity', enabled: false },
    ])
  })

  it('boş liste', () => {
    expect(parseBuildScenes('EditorBuildSettings:\n  m_Scenes: []\n')).toEqual([])
    expect(parseBuildScenes('bozuk')).toEqual([])
  })
})

describe("git'siz envanter", () => {
  it('hash sadece bilinen dosyanın boyutu ya da mtime değişince', () => {
    const prev = { size: 10, mtime: 5, hash: null }
    expect(needsHash(prev, 10, 5)).toBe(false)
    expect(needsHash(prev, 11, 5)).toBe(true)
    expect(needsHash(prev, 10, 6)).toBe(true)
    expect(needsHash(undefined, 10, 5)).toBe(false)
  })

  it('yeni, değişen, silinen; sadece dokunulmuş ama içerik aynı değişmiş sayılmaz', () => {
    const prev = {
      'a.wav': { size: 10, mtime: 1, hash: 'x' },
      'b.wav': { size: 10, mtime: 1, hash: 'y' },
      'c.wav': { size: 10, mtime: 1, hash: 'z' },
      'd.wav': { size: 10, mtime: 1, hash: null },
    }
    const cur = {
      'a.wav': { size: 10, mtime: 9, hash: 'x' },
      'b.wav': { size: 12, mtime: 9, hash: 'y2' },
      'd.wav': { size: 10, mtime: 2, hash: null },
      'e.wav': { size: 1, mtime: 1, hash: 'e' },
    }
    expect(diffInventory(prev, cur)).toEqual({
      added: ['e.wav'],
      changed: ['b.wav', 'd.wav'],
      removed: ['c.wav'],
    })
  })
})

describe('tarama özeti', () => {
  const zero = {
    firstScan: false,
    newCommits: 0,
    uncommitted: 0,
    todosAdded: 0,
    todosResolved: 0,
    filesChanged: 0,
  }

  it('değişiklik yoksa toast yok', () => {
    expect(scanToastText([{ name: 'Runika', result: { ...zero, uncommitted: 4 } }])).toBeNull()
  })

  it('projeler tek satırda', () => {
    expect(
      scanToastText([
        { name: 'Runika', result: { ...zero, newCommits: 4, todosAdded: 2 } },
        { name: 'SecondMind', result: zero },
        { name: 'Albüm', result: { ...zero, filesChanged: 1 } },
      ]),
    ).toBe('Runika: 4 yeni commit, 2 yeni kod notu · Albüm: 1 dosya değişti')
  })

  it('ilk tarama "yeni" demez', () => {
    expect(
      scanToastText([
        { name: 'Runika', result: { ...zero, firstScan: true, newCommits: 218, todosAdded: 12 } },
        { name: 'Albüm', result: { ...zero, firstScan: true } },
      ]),
    ).toBe('Runika ilk kez tarandı: 218 commit, 12 kod notu · Albüm ilk kez tarandı')
  })

  it('son dokunuş en yeni zaman', () => {
    expect(lastTouch(5, null, undefined, 9, 2)).toBe(9)
    expect(lastTouch()).toBe(0)
  })
})
