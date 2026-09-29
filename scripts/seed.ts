// Gerçekçi Türkçe örnek veri. Sadece geliştirme / ekran görüntüsü klasörüne yazar:
//
//   npm run seed -- --data-dir <klasör>           boş (ya da hiç olmayan) klasörü doldurur
//   npm run seed -- --data-dir <klasör> --reset   klasördeki DB'yi ve media/'yı silip baştan doldurur
//
// Gerçek veri klasörüne (%USERPROFILE%\SecondMind ya da uygulamanın config.json'daki dataDir'i)
// hiçbir koşulda yazmaz. Örnek veri Taha'nın işlemi olmadığı için activity_log boş bırakılır.

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, win32 } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'
import Database from 'better-sqlite3'
import { addDays, addHours, format, startOfDay, startOfWeek, subDays } from 'date-fns'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { MEDIA_URL } from '@shared/ipc'
import type { Db } from '../src/main/db/client'
import { createDump } from '../src/main/db/dump'
import { createIdea, markIdeaOpened, setIdeaStatus } from '../src/main/db/ideas'
import { createCollection, createNote, updateNote } from '../src/main/db/knowledge'
import {
  createReminder,
  createRoutine,
  createTask,
  setTaskDone,
  sweepDueReminders,
} from '../src/main/db/planning'
import { addParking, closeSession, createProject, startSession } from '../src/main/db/projects'
import { applyDocTemplate, createDoc, updateDoc } from '../src/main/db/docs'
import { convertCluster, pastePlaytest, playtestOverview } from '../src/main/db/playtest'
import * as schema from '../src/main/db/schema'
import {
  addFlag,
  addInstructorNote,
  applyPlan,
  saveAssignment,
  saveCourse,
  saveExam,
  saveTerm,
  saveTopic,
  setAttendance,
  setExamTopic,
  setGrade,
  setupSchool,
  setWeekTitle,
  weekNote,
} from '../src/main/db/school'
import { defaultDataDir } from '../src/main/domain/dataDir'
import { storeMedia } from '../src/main/media'

// ---------------------------------------------------------------- argümanlar ve güvenlik

function fail(message: string): never {
  console.error(`seed: ${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]): { dataDir: string; reset: boolean } {
  let dataDir: string | undefined
  let reset = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--reset') reset = true
    else if (arg === '--data-dir') dataDir = argv[++i]
    else if (arg?.startsWith('--data-dir=')) dataDir = arg.slice('--data-dir='.length)
    else fail(`bilinmeyen argüman: ${arg}`)
  }
  if (!dataDir) fail('--data-dir zorunlu. Örnek: npm run seed -- --data-dir C:\\sm-dev')
  return { dataDir: resolve(dataDir), reset }
}

const same = (a: string, b: string) =>
  win32.resolve(a).replace(/\\+$/, '').toLowerCase() ===
  win32.resolve(b).replace(/\\+$/, '').toLowerCase()

/** Uygulamanın kendi config.json'unda seçili veri klasörü (userData = %APPDATA%\secondmind). */
function configuredDataDir(): string | null {
  const appData = process.env['APPDATA']
  if (!appData) return null
  const file = join(appData, 'secondmind', 'config.json')
  if (!existsSync(file)) return null
  try {
    const dir = (JSON.parse(readFileSync(file, 'utf8')) as { dataDir?: unknown }).dataDir
    return typeof dir === 'string' && dir ? dir : null
  } catch {
    return null
  }
}

function assertNotRealData(dataDir: string): void {
  const real = [defaultDataDir(homedir()), configuredDataDir()].filter((d): d is string => !!d)
  if (real.some((d) => same(d, dataDir)))
    fail(`${dataDir} gerçek veri klasörü; örnek veri buraya yazılmaz (--reset ile de).`)
}

function hasContent(file: string): boolean {
  const conn = new Database(file, { readonly: true })
  try {
    const tables = ['notes', 'dump_items', 'collections']
    return tables.some((t) => {
      const exists = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(t)
      return (
        !!exists && (conn.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n > 0
      )
    })
  } finally {
    conn.close()
  }
}

// ---------------------------------------------------------------- küçük PNG

/** Köşegen degrade, RGB; bağımlılıksız PNG kodlayıcı (zlib + crc32). */
function gradientPng(width: number, height: number, from: number[], to: number[]): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0 // filtre: yok
    for (let x = 0; x < width; x++) {
      const t = (x / (width - 1) + y / (height - 1)) / 2
      for (let c = 0; c < 3; c++)
        raw[row + 1 + x * 3 + c] = Math.round(from[c]! + (to[c]! - from[c]!) * t)
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit derinliği
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------- içerik

type NoteSeed = {
  title: string
  body: string
  tags?: string[]
  pinned?: boolean
  /** Kaç gün önce yazıldı / son düzenlendi. */
  created: number
  edited?: number
}

const NOTES: Record<string, NoteSeed[]> = {
  Unity: [
    {
      title: 'Sahne yükleme notları',
      created: 26,
      edited: 3,
      tags: ['unity', 'c#'],
      body: `## Async yükleme

- \`SceneManager.LoadSceneAsync\` ile yükle, \`allowSceneActivation = false\` tut
- Yükleme %90'da durur; geçiş animasyonu bitince etkinleştir
- Additive sahnelerde ışık ayarları ana sahneden gelir

\`\`\`csharp
IEnumerator Load(string scene)
{
    var op = SceneManager.LoadSceneAsync(scene);
    op.allowSceneActivation = false;
    while (op.progress < 0.9f) yield return null;
    yield return fader.FadeOut();
    op.allowSceneActivation = true;
}
\`\`\`

> Addressables'a geçiş şimdilik gereksiz; sahne sayısı 10'u geçerse tekrar bak.`,
    },
    {
      title: 'Shader Graph ile su efekti',
      created: 19,
      edited: 11,
      tags: ['unity', 'shader'],
      body: `Runika'nın göl sahnesi için basit, stilize su.

1. İki kayan normal map (farklı hız ve yön)
2. Derinlik farkından köpük çizgisi: \`Scene Depth - Screen Position.w\`
3. Fresnel ile kenarda açık renk

{{image}}

Kaynak: [Cyanilux — Water Shader Breakdown](https://www.cyanilux.com/tutorials/)`,
    },
    {
      title: 'Runika — ses efekti listesi',
      created: 15,
      edited: 1,
      tags: ['unity', 'ses', 'runika'],
      body: `## Menü
- [x] Buton üzerine gelme
- [x] Onay / geri
- [ ] Menü müziği 1:20'ye kırpılacak

## Oyun içi
- [x] Rün toplama (3 varyasyon)
- [ ] Kapı açılma
- [ ] Ayak sesi: taş, çimen, tahta
- [ ] Boss girişi için gerilim katmanı`,
    },
    {
      title: 'Input System geçişi',
      created: 34,
      tags: ['unity', 'c#'],
      body: `Eski \`Input.GetAxis\` çağrılarını kaldırdım; hepsi **PlayerInput** + action map.

- Oynanış ve UI için iki ayrı action map
- Gamepad titreşimi \`Gamepad.current?.SetMotorSpeeds\`
- Tuş atama ekranı: \`PerformInteractiveRebinding\`

> Rebind sonrası kaydı \`SaveBindingOverridesAsJson\` ile PlayerPrefs'e yaz, yoksa her açılışta sıfırlanıyor.`,
    },
  ],
  Okul: [
    {
      title: 'Veri Yapıları — AVL ağaçları',
      created: 12,
      edited: 2,
      tags: ['ders', 'sınav'],
      body: `## Denge faktörü
Sol alt ağaç yüksekliği − sağ alt ağaç yüksekliği; |bf| ≤ 1.

## Dönmeler
- **LL** → sağa tek dönme
- **RR** → sola tek dönme
- **LR** → önce sola, sonra sağa
- **RL** → önce sağa, sonra sola

\`\`\`c
Node* rotateRight(Node* y) {
    Node* x = y->left;
    y->left = x->right;
    x->right = y;
    update(y); update(x);
    return x;
}
\`\`\`

> Hoca vurguladı: ekleme sonrası en fazla **bir** (tek ya da çift) dönme yeter, silmede zincirleme olabilir.`,
    },
    {
      title: 'Lineer Cebir: özdeğer özeti',
      created: 9,
      tags: ['ders'],
      body: `- \`det(A − λI) = 0\` → karakteristik polinom
- Özdeğerlerin toplamı = iz, çarpımı = determinant
- Simetrik matrislerin özdeğerleri reeldir, özvektörleri diktir
- Köşegenleştirme: \`A = PDP⁻¹\`, P'nin sütunları özvektörler

> 3×3'te önce λ = 0 kontrol et: det(A) = 0 ise bir özdeğer hazır.`,
    },
    {
      title: 'Olasılık ödevi 2 — plan',
      created: 6,
      edited: 0,
      tags: ['ders', 'ödev'],
      body: `Teslim: Salı 23:59

- [x] 1 — koşullu olasılık
- [x] 2 — Bayes
- [ ] 3 — binom, n = 12
- [ ] 4 — anlamadım, hocaya sor
- [ ] 5 — Poisson yaklaşımı`,
    },
    {
      title: 'Vize çalışma planı',
      created: 5,
      edited: 0,
      pinned: true,
      tags: ['sınav'],
      body: `## Veri Yapıları (Pazartesi)
- [x] Bağlı listeler
- [x] Yığın ve kuyruk
- [ ] AVL dönmeleri — 10 örnek
- [ ] Geçen yılın sorusu

## Lineer Cebir (Perşembe)
- [ ] Özdeğer — 3×3 örnekler
- [ ] Gauss eliminasyonu hız çalışması`,
    },
  ],
  'Okuma listesi': [
    {
      title: 'Okunacaklar',
      created: 40,
      edited: 4,
      pinned: true,
      tags: ['kitap'],
      body: `- [x] [Game Programming Patterns](https://gameprogrammingpatterns.com/) — Robert Nystrom
- [ ] *The Art of Game Design* — Jesse Schell
- [ ] *Atomik Alışkanlıklar* — James Clear (yarıda)
- [ ] *Kürk Mantolu Madonna* — Sabahattin Ali
- [ ] [Red Blob Games — Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/)`,
    },
    {
      title: 'Atomik Alışkanlıklar — notlar',
      created: 22,
      tags: ['kitap'],
      body: `> Hedeflerinizin seviyesine yükselmezsiniz, sistemlerinizin seviyesine düşersiniz.

- Alışkanlığı **görünür** yap: ipucu ortamda olsun
- **Çekici** yap: sevdiğin bir şeyle eşle
- **Kolay** yap: iki dakika kuralı
- **Tatmin edici** yap: takip et, zinciri kırma

Kendime: Runika için "her gün bir commit" iki dakika kuralına uyuyor.`,
    },
    {
      title: 'Game Programming Patterns: Command',
      created: 30,
      edited: 27,
      tags: ['kitap', 'oyun-tasarımı'],
      body: `Girdiyi nesneye çevir → geri alma, tekrar oynatma, AI aynı arayüzü kullanır.

\`\`\`csharp
interface ICommand { void Execute(Actor a); void Undo(Actor a); }
\`\`\`

- Geri alma için komut, önceki durumu kendisi saklar
- Yapay zekâ da komut üretir; oyuncu ile aynı yol

[Bölüm](https://gameprogrammingpatterns.com/command.html)`,
    },
  ],
  '': [
    {
      title: 'Yeni bilgisayar kurulum listesi',
      created: 45,
      edited: 44,
      tags: ['kurulum'],
      body: `- [x] Git + SSH anahtarı
- [x] Unity Hub, 6000.0 LTS
- [x] VS Code, C# Dev Kit
- [ ] OBS sahneleri
- [ ] Yazıcı sürücüsü`,
    },
    {
      title: 'Kahve demleme oranları',
      created: 17,
      body: `- V60: 15 g kahve, 250 g su, 93 °C, 2:30 dk
- French press: 1:15, 4 dk, sonra bastır
- Soğuk demleme: 1:8, buzdolabında 16 saat

> Öğütme kalınlığı değişince süreyi değil, önce oranı sabit tut.`,
    },
  ],
}

type IdeaSeed = {
  title: string
  body: string
  tags?: string[]
  created: number
  /** Karar: kaç gün önce, hangi durum. */
  decided?: { days: number; status: 'active' | 'archived' }
  openedDaysAgo?: number
}

const IDEAS: IdeaSeed[] = [
  {
    title: 'Ders notlarından bilgi kartı çıkaran mod',
    created: 20,
    tags: ['okul'],
    body: `Bilgi'deki ders notlarından soru-cevap kartları üretsin; sınavdan önceki hafta Bugün'e yerleşsin.

- Kartlar notun başlıklarından çıkar
- Aralıklı tekrar: 1, 3, 7 gün`,
  },
  {
    title: 'Ritim tabanlı bulmaca oyunu',
    created: 70,
    decided: { days: 56, status: 'active' },
    openedDaysAgo: 38,
    tags: ['oyun-tasarımı'],
    body: `Işık yalnızca müziğin vuruşlarında yayılıyor; oyuncu karanlık odada ritme göre yol buluyor.

- Her oda bir enstrüman katmanı ekler
- Ritmi kaçırınca oda sıfırlanmaz, ışık solar`,
  },
  {
    title: 'Runika için günlük meydan okuma modu',
    created: 9,
    tags: ['runika'],
    body: `Her gün aynı tohumla üretilen bir zindan; skor tablosu arkadaşlar arasında.

- [ ] Tohum = tarih
- [ ] Tek deneme hakkı`,
  },
  {
    title: 'Kampüs etkinlik takvimi botu',
    created: 12,
    body: `Kulüp duyurularını tek bir takvimde toplayan küçük bir bot. Telegram kanalından okuyup .ics üretir.`,
  },
  {
    title: 'Piksel sanat için renk paleti üreteci',
    created: 2,
    tags: ['oyun-tasarımı'],
    body: `Bir referans görselden 8-16 renklik palet çıkarıp Aseprite formatında dışa aktarsın.`,
  },
  {
    title: 'Sesli günlük uygulaması',
    created: 50,
    decided: { days: 35, status: 'archived' },
    body: `Akşamları 1 dakikalık sesli kayıt, otomatik yazıya dökülsün. Zihin paneli zaten bunu karşılıyor.`,
  },
]

const DUMPS: { text: string; days: number; hour: number; image?: boolean }[] = [
  { text: "Runika'da menü müziği çok uzun, 1:20'ye kırp", days: 0, hour: 9 },
  { text: 'Cuma 14:00 Lineer Cebir quiz — 3. ve 4. bölüm', days: 1, hour: 16 },
  { text: "Erdem'in doğum günü 3 Ekim, mesaj at", days: 2, hour: 22 },
  { text: 'Tahtadaki AVL dönme örneği', days: 3, hour: 11, image: true },
  { text: "Unity 6'ya geçince URP ayarları sıfırlandı mı kontrol et", days: 5, hour: 20 },
  { text: 'Kütüphane kitabı iade: Çarşamba', days: 8, hour: 13 },
  {
    text: 'Oyun fikri: ışığın sesle yayıldığı bulmaca — kuluçkadakiyle birleşebilir mi?',
    days: 10,
    hour: 1,
  },
  { text: 'Olasılık ödevi 2, soru 4 anlamadım — hocaya sor', days: 13, hour: 15 },
  { text: 'Kahve filtresi bitti', days: 17, hour: 8 },
]

// Görevler: gün ofseti (0 bugün, null planlanmamış), bitenler `doneDaysAgo` ile.
type TaskSeed = {
  title: string
  planned?: number | null
  due?: number
  estimate?: number
  priority?: 1 | 2 | 3
  postponed?: number
  doneDaysAgo?: number
  project?: ProjectKey
}

// ---------------------------------------------------------------- projeler (Aşama 5a)

type ProjectKey = 'runika' | 'secondmind' | 'album'

/** Playtest yapıştırmaları: [kaç gün önce, metin, sohbet kalıbı yoksa kişi]. */
const PLAYTEST: [number, string, string][] = [
  [
    9,
    [
      '[20:14] Ali: ölüm panelinde takıldım, tuşlar hiç çalışmıyor',
      '[20:15] Ali: bir de müzik çok yüksek geliyor, efektleri bastırıyor',
      '[20:31] Deniz: ölüm panelinde takılıp kaldım, yeniden başlat tuşu çalışmadı',
      '[20:40] Deniz: ikinci bölümdeki zıplama çok zor, üç kere düştüm',
    ].join('\n'),
    '',
  ],
  [
    4,
    [
      '- Ölüm panelinde tuşlar çalışmıyor, fareyle tıklamak gerekti.',
      '- Envanter açılınca oyun duraklamıyor, düşman vurdu.',
      '- Menü müziği uzun, döngüye girince sıkıyor.',
    ].join('\n'),
    'Ece',
  ],
  [
    1,
    [
      '[22:03] Mert: envanter açıkken düşman vuruyor, oyun durmuyor',
      '[22:05] Mert: ölüm panelinde takıldım yine tuşlar çalışmadı',
      '[22:09] Mert: karakter duvara yapışıyor köşede kalınca',
    ].join('\n'),
    '',
  ],
]

/** Runika'nın gerçek klasörü varsa bağlanır (sadece okunur); yoksa klasörsüz. SecondMind bu repo. */
const PROJECTS: {
  key: ProjectKey
  name: string
  kind: 'unity' | 'software' | 'creative'
  color: string
  folder: string | null
  created: number
  nextStep: string
  /** [kaç gün önce, başlama saati, dakika, nerede bıraktın] */
  sessions: [number, number, number, string][]
  parking: [number, string][]
}[] = [
  {
    key: 'runika',
    name: 'Runika',
    kind: 'unity',
    color: '#3BE08F',
    folder: 'C:\\ajanda\\Runika',
    created: 60,
    nextStep: 'Boss fazı 2 müziğini hızlandır',
    sessions: [
      [12, 20, 95, 'Silah üreticisi parametrik oldu, denge tablosu yarım.'],
      [9, 21, 140, 'Shop reroll çalışıyor, fiyat eğrisi hâlâ dik.'],
      [8, 19, 60, ''],
      [6, 22, 110, 'Kill orb yerde duruyor; toplama yarıçapı küçük geldi.'],
      [5, 20, 75, "Rün halesi yumuşadı, çerçeve sprite'ları FullRect."],
      [3, 21, 125, "Prova sahneleri kalktı. URP ayarları commit'lenmedi, Unity 6 uyarısı var."],
      [1, 20, 90, 'Boss fazı 2 müziği yarım: geçişte ses patlıyor, döngü noktası yanlış.'],
    ],
    parking: [
      [4, 'Kamera sarsıntısını ayarlar menüsüne bağla'],
      [2, 'Ölüm panelinde skor sayacı animasyonu'],
      [1, "Playtest için Ali ve Deniz'e build gönder"],
    ],
  },
  {
    key: 'secondmind',
    name: 'SecondMind',
    kind: 'software',
    color: '#FF8A3D',
    folder: resolve('.'),
    created: 45,
    nextStep: 'Kokpit karolarını ekran görüntüsüyle karşılaştır',
    sessions: [
      [7, 14, 180, 'Yerleştirme algoritması testleri yeşil.'],
      [4, 15, 150, 'Günlük kayıt karosu bitti; uyku ayrıştırma "7,5" kabul ediyor.'],
      [2, 13, 200, 'Aşama 5 spesifikasyonu yazıldı.'],
      [0, 9, 70, 'Proje tabloları ve oturum sorguları hazır.'],
    ],
    parking: [[0, 'Kokpitte haftalık commit grafiği (5b)']],
  },
  {
    key: 'album',
    name: 'Albüm',
    kind: 'creative',
    color: '#F59BE6',
    folder: null,
    created: 90,
    nextStep: 'İkinci parçanın nakaratını yeniden kaydet',
    sessions: [
      [30, 22, 60, 'Demo 1 miksi bitti.'],
      [17, 23, 45, 'Nakaratta ses kısık kaldı.'],
    ],
    parking: [],
  },
]

const TASKS: TaskSeed[] = [
  { title: "Menü müziğini 1:20'ye kırp", planned: 0, estimate: 45, priority: 3, project: 'runika' },
  { title: 'Olasılık ödevi 2, soru 4: hocaya sor', planned: 0, estimate: 15, due: 1 },
  // 3 kez ertelenmiş: Bugün'de "Böl · Sil · Bugün yap" sorusu (3b).
  {
    title: 'Unity 6 sonrası URP ayarlarını kontrol et',
    planned: 0,
    estimate: 30,
    postponed: 3,
    project: 'runika',
  },
  {
    title: 'Pause menüsünde müzik baştan başlıyor',
    planned: null,
    estimate: 30,
    project: 'runika',
  },
  {
    title: 'Ses ayarlarına müzik/efekt kaydırıcısı',
    planned: null,
    estimate: 60,
    project: 'runika',
  },
  { title: 'Lineer Cebir quiz tekrarı: 3. ve 4. bölüm', planned: 1, estimate: 90, due: 4 },
  { title: 'Kahve filtresi al', planned: null, priority: 1 },
  { title: 'Runika devlog taslağı', planned: null, estimate: 60, project: 'runika' },
  { title: 'Park penceresini Unity açıkken dene', planned: 0, estimate: 20, project: 'secondmind' },
  { title: 'Electron iskeletini kur', planned: 0, doneDaysAgo: 1, project: 'secondmind' },
  { title: 'Kütüphane kitabını iade et', planned: 0, doneDaysAgo: 3 },
  { title: 'AVL dönme örneğini deftere geçir', planned: 0, doneDaysAgo: 2 },
]

const ROUTINES = [
  { title: 'Kahvaltı', days: [1, 2, 3, 4, 5, 6, 7], startTime: '08:00', durationMin: 20 },
  { title: 'Spor', days: [2, 4], startTime: '18:00', durationMin: 60 },
  { title: 'Yürüyüş', days: [1, 3, 5], startTime: '19:00', durationMin: 30 },
]

// ---------------------------------------------------------------- çalıştır

// ---------------------------------------------------------------- Okul (Aşama 6)

type CourseSeed = {
  name: string
  code: string
  credit: number
  teacher: string
  room: string
  slots: { weekday: number; start: string; end: string }[]
  weeks: string[]
  emphasized?: number[]
}

const COURSES: CourseSeed[] = [
  {
    name: 'Veri Yapıları',
    code: 'BIL201',
    credit: 6,
    teacher: 'Ayşe Kaya',
    room: 'D-201',
    slots: [
      { weekday: 1, start: '09:00', end: '10:50' },
      { weekday: 3, start: '13:00', end: '14:50' },
    ],
    weeks: ['Diziler ve karmaşıklık', 'Bağlı listeler', 'Yığın ve kuyruk', 'Ağaçlar', 'İkili arama ağaçları', 'AVL ağaçları'],
    emphasized: [4, 6],
  },
  {
    name: 'Lineer Cebir',
    code: 'MAT205',
    credit: 5,
    teacher: 'Mehmet Demir',
    room: 'B-105',
    slots: [{ weekday: 2, start: '10:00', end: '11:50' }],
    weeks: ['Lineer denklem sistemleri', 'Matrisler', 'Determinant', 'Vektör uzayları'],
    emphasized: [3],
  },
  {
    name: 'Olasılık ve İstatistik',
    code: 'MAT221',
    credit: 5,
    teacher: 'Zeynep Arslan',
    room: 'A-12',
    slots: [{ weekday: 4, start: '14:00', end: '15:50' }],
    weeks: ['Olasılık aksiyomları', 'Koşullu olasılık', 'Rastgele değişkenler', 'Beklenen değer'],
  },
  {
    name: 'Bilgisayar Mimarisi',
    code: 'BIL231',
    credit: 5,
    teacher: 'Ayşe Kaya',
    room: 'D-104',
    slots: [{ weekday: 5, start: '09:00', end: '11:50' }],
    weeks: ['Sayı sistemleri', 'Mantık kapıları', 'Kombinasyonel devreler', 'Ardışıl devreler'],
  },
  {
    name: 'Teknik İngilizce',
    code: 'ING201',
    credit: 3,
    teacher: 'Sarah Miller',
    room: 'C-3',
    slots: [{ weekday: 2, start: '15:00', end: '16:50' }],
    weeks: ['Technical reading', 'Writing definitions', 'Describing processes', 'Presentations'],
  },
]

const clockToMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function seedSchool(db: Db, now: Date): { courses: number; exams: number } {
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  // Aktif dönem 3 hafta önce başladı: bugün 4. hafta.
  const termStart = format(subDays(monday, 21), 'yyyy-MM-dd')
  const day = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd')

  // Geçmiş dönem: GANO'ya girer.
  const past = saveTerm(db, { name: '2025-2026 Bahar', startDate: '2026-02-16', weekCount: 14, active: false }, subDays(now, 200))
  for (const [name, code, credit, letter] of [
    ['Programlamaya Giriş II', 'BIL102', 6, 'BA'],
    ['Analiz II', 'MAT102', 6, 'CB'],
    ['Fizik II', 'FIZ102', 5, 'CC'],
    ['Ayrık Matematik', 'MAT112', 5, 'BB'],
  ] as const)
    saveCourse(db, { termId: past.id, name, code, credit, letter }, subDays(now, 200))

  const term = setupSchool(
    db,
    {
      term: { name: '2026-2027 Güz', startDate: termStart, weekCount: 14 },
      courses: COURSES.map((c) => ({
        name: c.name,
        code: c.code,
        credit: c.credit,
        room: c.room,
        instructorName: c.teacher,
        attendanceLimit: { kind: 'percent' as const, value: 30 },
        targetLetter: 'BB',
        slots: c.slots.map((s) => ({ weekday: s.weekday, startMin: clockToMin(s.start), endMin: clockToMin(s.end), room: '' })),
        components:
          c.code === 'ING201'
            ? [
                { name: 'Sunum', kind: 'project' as const, weight: 40 },
                { name: 'Final', kind: 'final' as const, weight: 60 },
              ]
            : [
                { name: 'Quiz', kind: 'quiz' as const, weight: 10 },
                { name: 'Vize', kind: 'midterm' as const, weight: 30 },
                { name: 'Final', kind: 'final' as const, weight: 60 },
              ],
      })),
    },
    subDays(now, 22),
  )

  const rows = db.select().from(schema.courses).where(eq(schema.courses.termId, term.id)).all()
  const byCode = new Map(rows.map((r) => [r.code, r]))
  let examCount = 0
  for (const c of COURSES) {
    const course = byCode.get(c.code)!
    c.weeks.forEach((title, i) => {
      setWeekTitle(db, course.id, i + 1, title)
      saveTopic(db, { courseId: course.id, weekNo: i + 1, name: title, emphasized: c.emphasized?.includes(i + 1) ?? false })
    })
    const quiz = db
      .select()
      .from(schema.gradeComponents)
      .where(eq(schema.gradeComponents.courseId, course.id))
      .all()
      .find((g) => g.kind === 'quiz')
    if (quiz) setGrade(db, quiz.id, c.code === 'MAT205' ? 55 : 85, subDays(now, 5))
  }

  const ds = byCode.get('BIL201')!
  const la = byCode.get('MAT205')!
  const comps = (courseId: string) =>
    db.select().from(schema.gradeComponents).where(eq(schema.gradeComponents.courseId, courseId)).all()

  // Sınavlar: Lineer Cebir vizesi 5 gün sonra (plan kurulu), Veri Yapıları vizesi 12 gün sonra.
  const laExam = saveExam(
    db,
    {
      courseId: la.id,
      title: 'Vize',
      day: day(5),
      startMin: 600,
      place: 'B-105',
      componentId: comps(la.id).find((g) => g.kind === 'midterm')!.id,
      weekFrom: 1,
      weekTo: 4,
    },
    subDays(now, 3),
  ).id
  const dsExam = saveExam(
    db,
    {
      courseId: ds.id,
      title: 'Vize',
      day: day(12),
      startMin: 540,
      place: 'D-201',
      componentId: comps(ds.id).find((g) => g.kind === 'midterm')!.id,
      weekFrom: 1,
      weekTo: 6,
    },
    subDays(now, 3),
  ).id
  examCount += 2
  const laTopics = db.select().from(schema.examTopics).where(eq(schema.examTopics.examId, laExam)).all()
  laTopics.forEach((t, i) => setExamTopic(db, { examId: laExam, topicId: t.topicId, level: [2, 1, 0, 1][i] ?? 0 }))
  const dsTopics = db.select().from(schema.examTopics).where(eq(schema.examTopics.examId, dsExam)).all()
  dsTopics.forEach((t, i) => setExamTopic(db, { examId: dsExam, topicId: t.topicId, level: [3, 2, 2, 1, 0, 0][i] ?? 0 }))
  applyPlan(db, laExam, 180, now)

  // Ödevler: biri 3 gün sonra, biri geçen hafta teslim edildi.
  saveAssignment(db, { courseId: ds.id, title: 'Bağlı liste uygulaması', dueAt: addHours(startOfDay(addDays(now, 3)), 23).getTime(), weekNo: 2 }, subDays(now, 6))
  const done = saveAssignment(db, { courseId: la.id, title: 'Problem seti 1', dueAt: addHours(startOfDay(subDays(now, 4)), 17).getTime(), weekNo: 2 }, subDays(now, 12))
  saveAssignment(db, { id: done.id, courseId: la.id, title: 'Problem seti 1', dueAt: addHours(startOfDay(subDays(now, 4)), 17).getTime(), status: 'graded', score: 90 }, subDays(now, 5))

  // Yoklama: geçen haftalarda iki devamsızlık, kalanlar katıldı.
  for (const c of rows) {
    const slots = db.select().from(schema.courseSlots).where(eq(schema.courseSlots.courseId, c.id)).all()
    for (let w = 0; w < 3; w++)
      for (const s of slots) {
        const d = format(addDays(subDays(monday, 21 - w * 7), s.weekday - 1), 'yyyy-MM-dd')
        const absent = (c.code === 'BIL231' && w === 1) || (c.code === 'MAT221' && w === 0)
        setAttendance(db, { slotId: s.id, day: d, status: absent ? 'absent' : 'present' })
      }
  }

  // Hafta notu ve "anlamadım" işareti; hoca notu.
  const { noteId } = weekNote(db, ds.id, 3, subDays(now, 9))
  updateNote(
    db,
    {
      id: noteId,
      bodyMd:
        '## Yığın (stack)\n\n- LIFO; push / pop O(1)\n- Dizi ile ya da bağlı liste ile\n\n## Kuyruk\n\nDairesel dizide baş ve son indeksleri modla ilerler; dolu ile boşu ayırmak için bir hücre boş bırakılır.',
    },
    subDays(now, 9),
  )
  addFlag(db, noteId, 'Dairesel dizide dolu ile boşu ayırmak için neden bir hücre boş bırakılıyor?', subDays(now, 9))
  addInstructorNote(db, ds.id, 'Vizede ispat yok, kod okuma ve karmaşıklık soruyor. Kağıda kod yazdırıyor.', subDays(now, 14))
  addInstructorNote(db, la.id, 'Devamı sıkı alıyor: %30 sınırı var, imza ilk 10 dakikada.', subDays(now, 20))

  return { courses: COURSES.length + 4, exams: examCount }
}

function openDb(file: string): { db: Db; close: () => void } {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve('src/main/db/migrations') })
  return { db, close: () => sqlite.close() }
}

function main(): void {
  const { dataDir, reset } = parseArgs(process.argv.slice(2))
  assertNotRealData(dataDir)

  const dbFile = join(dataDir, 'secondmind.db')
  const mediaDir = join(dataDir, 'media')
  if (existsSync(dbFile) && hasContent(dbFile)) {
    if (!reset) fail(`${dbFile} dolu. Silip baştan doldurmak için --reset ekle.`)
    for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true })
    rmSync(mediaDir, { recursive: true, force: true })
  }
  for (const dir of [dataDir, mediaDir, join(dataDir, 'ai')]) mkdirSync(dir, { recursive: true })

  const { db, close } = openDb(dbFile)
  const now = new Date()
  // "n gün önce, saat h": gün başına göre, günler geçmiş haftalara yayılır.
  const ago = (days: number, hour = 10) => addHours(startOfDay(subDays(now, days)), hour)

  const png = (name: string, from: number[], to: number[]) =>
    storeMedia(db, mediaDir, { name, mime: 'image/png', bytes: gradientPng(160, 96, from, to) })
  const water = png('su-efekti.png', [34, 108, 164], [118, 226, 214])
  const board = png('tahta.png', [40, 52, 46], [120, 140, 128])

  let noteCount = 0
  for (const [collection, seeds] of Object.entries(NOTES)) {
    const collectionId = collection ? createCollection(db, collection).id : null
    for (const n of seeds) {
      const { id } = createNote(db, collectionId)
      const body = n.body.replace('{{image}}', `![](${MEDIA_URL}${water.fileName})`)
      const edited = ago(n.edited ?? n.created, 14 + (noteCount % 7))
      updateNote(db, { id, title: n.title, bodyMd: body, tags: n.tags, pinned: n.pinned }, edited)
      db.update(schema.notes)
        .set({ createdAt: ago(n.created, 9 + (noteCount % 5)) })
        .where(eq(schema.notes.id, id))
        .run()
      noteCount++
    }
  }

  for (const i of IDEAS) {
    const created = ago(i.created, 21)
    const { id } = createIdea(db, created)
    updateNote(db, { id, title: i.title, bodyMd: i.body, tags: i.tags }, created)
    if (i.decided) setIdeaStatus(db, { noteId: id, status: i.decided.status }, ago(i.decided.days))
    if (i.openedDaysAgo !== undefined) markIdeaOpened(db, id, ago(i.openedDaysAgo, 19))
  }

  for (const d of DUMPS) {
    const item = createDump(db, d.text, d.image ? [board] : [])
    const at = ago(d.days, d.hour)
    db.update(schema.dumpItems)
      .set({ createdAt: at, updatedAt: at })
      .where(eq(schema.dumpItems.id, item.id))
      .run()
  }

  // Projeler: geçmiş oturumlar, park öğeleri; Runika'da 42 dakikadır süren bir oturum.
  const projectIds = {} as Record<ProjectKey, string>
  for (const p of PROJECTS) {
    const folderPath = p.folder && existsSync(p.folder) ? p.folder : null
    const id = createProject(
      db,
      { name: p.name, kind: p.kind, color: p.color, folderPath },
      ago(p.created),
    )
    projectIds[p.key] = id
    for (const [days, hour, min, leftOff] of p.sessions) {
      const start = ago(days, hour)
      // Bugünün oturumu henüz gelmemiş bir saatteyse sabaha çekilir.
      const at = start.getTime() + min * 60_000 > now.getTime() ? subDays(start, 1) : start
      const s = startSession(db, { projectId: id }, at)
      closeSession(
        db,
        { id: s.id, leftOff, nextStep: p.nextStep },
        new Date(at.getTime() + min * 60_000),
      )
    }
    for (const [days, text] of p.parking) {
      const at = ago(days, 21)
      const parkedAt = at > now ? new Date(now.getTime() - 30 * 60_000) : at
      addParking(db, { projectId: id, text, source: 'shortcut' }, parkedAt)
    }
  }
  db.update(schema.projects)
    .set({ lastOpenedAt: ago(1, 22), releasePlatform: 'itch' })
    .where(eq(schema.projects.id, projectIds.runika))
    .run()
  startSession(db, { projectId: projectIds.runika }, new Date(now.getTime() - 42 * 60_000))
  addParking(
    db,
    { projectId: projectIds.runika, text: "itch sayfası için 3 sn'lik GIF", source: 'shortcut' },
    new Date(now.getTime() - 10 * 60_000),
  )

  const day = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd')
  for (const t of TASKS) {
    const created = ago(5 + (t.postponed ?? 0), 10)
    const task = createTask(
      db,
      {
        title: t.title,
        plannedDate: t.planned === null || t.planned === undefined ? null : day(t.planned),
        dueDate: t.due === undefined ? null : day(t.due),
        estimateMin: t.estimate ?? null,
        priority: t.priority ?? 2,
        projectId: t.project ? projectIds[t.project] : null,
      },
      created,
    )
    if (t.postponed) {
      db.update(schema.tasks)
        .set({ postponeCount: t.postponed })
        .where(eq(schema.tasks.id, task.id))
        .run()
    }
    if (t.doneDaysAgo !== undefined) setTaskDone(db, task.id, true, ago(t.doneDaysAgo, 17))
  }

  for (const r of ROUTINES) createRoutine(db, r, ago(20))

  // Hatırlatmalar: biri kapalıyken kaçırılmış (dün 18:00), biri bu akşam, tekrarlayanlar.
  createReminder(db, { title: 'Elektrik faturasını öde', at: ago(1, 18).getTime() }, ago(3))
  sweepDueReminders(db, now)
  const tonight = ago(0, 20) > now ? ago(0, 20) : ago(-1, 20)
  createReminder(db, { title: "Erdem'e doğum günü mesajı", at: tonight.getTime() }, now)
  createReminder(db, { title: 'Kütüphane kitabını al', at: ago(-2, 10).getTime() }, now)
  createReminder(
    db,
    { title: 'Haftalık plan', rule: { kind: 'weekly', days: [1], time: '09:00' } },
    now,
  )
  createReminder(
    db,
    { title: 'İlaç', rule: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7], time: '22:00' } },
    now,
  )
  createReminder(
    db,
    { title: 'Annemin doğum günü', rule: { kind: 'yearly', month: 11, day: 14, time: '10:00' } },
    now,
  )

  // Playtest (5c-4): Runika'ya üç yapıştırma; en çok bildirilen küme hataya çevrilmiş.
  for (const [days, text, tester] of PLAYTEST) {
    pastePlaytest(
      db,
      { projectId: projectIds.runika, text, tester, receivedOn: format(ago(days), 'yyyy-MM-dd') },
      ago(days, 21),
    )
  }
  const topCluster = playtestOverview(db, projectIds.runika, now).clusters[0]
  if (topCluster) convertCluster(db, topCluster.id, 'bug', ago(1, 22))

  // Dokümanlar (5d): SecondMind'da teknik doküman şablonu, bir sayfa gövdesi ve bir karar (ADR).
  const techDocs = applyDocTemplate(db, projectIds.secondmind, ago(12))
  const architecture = techDocs.find((d) => d.title === 'Mimari')
  if (architecture)
    updateDoc(
      db,
      {
        id: architecture.id,
        bodyMd: [
          'Electron ana süreci DB ve dosya sistemine dokunur; renderer sadece `window.api` ile konuşur.',
          '',
          '| Katman | Klasör | Test |',
          '| --- | --- | --- |',
          '| Algoritmalar | src/main/domain | Vitest |',
          '| Veri | src/main/db | Vitest (bellek içi SQLite) |',
          '| Arayüz | src/renderer | Elle |',
        ].join('\n'),
      },
      ago(12),
    )
  const adr = createDoc(
    db,
    { projectId: projectIds.secondmind, title: 'AI veritabanına doğrudan yazmaz', kind: 'adr' },
    ago(10),
  )
  updateDoc(
    db,
    {
      id: adr.id,
      bodyMd: [
        '**Tarih:** 19 Eylül 2026',
        '',
        '## Bağlam',
        '',
        'AI önerileri yanlış olabilir.',
        '',
        '## Karar',
        '',
        'AI sadece changes.json önerir; Onay Kutusu uygular.',
        '',
        '## Alternatifler',
        '',
        'Doğrudan yazıp geri alma.',
        '',
        '## Sonuç',
        '',
        'Her değişiklik geri alınabilir.',
      ].join('\n'),
    },
    ago(10),
  )

  const school = seedSchool(db, now)

  // Örnek veri Taha'nın işlemi değil: geri alınacak bir geçmişi olmasın.
  db.run(sql`DELETE FROM activity_log`)
  close()

  console.log(
    `seed: ${dataDir}\n` +
      `  ${Object.keys(NOTES).filter(Boolean).length} koleksiyon, ${noteCount} not, ` +
      `${IDEAS.length} fikir, ${DUMPS.length} döküm, 2 resim, ${TASKS.length} görev, ` +
      `${ROUTINES.length} rutin, 6 hatırlatma (1 kaçırılmış), ${PROJECTS.length} proje ` +
      `(Runika'da süren oturum), ${school.courses} ders (2 dönem), ${school.exams} sınav.\n` +
      `  Uygulamayı bu klasörle açmak için userData/config.json: {"dataDir": "${dataDir.replace(/\\/g, '\\\\')}"}`,
  )
}

main()
