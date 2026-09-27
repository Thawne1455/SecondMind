# SecondMind

Taha'nın kişisel "ikinci beyin" masaüstü uygulaması. Temel kural: **Taha döker, SecondMind düzenler ve doğru anda geri getirir.**
Tek kullanıcı, tamamen yerel, arayüz dili Türkçe. Önce Windows masaüstü; mobil sonra.

Bu dosya her oturumda okunur, kısa tutulur. Ayrıntılar `docs/` altında. İlgili dokümanı **sadece o işe başlarken** oku.

| Doküman | Ne zaman okunur |
| --- | --- |
| `docs/YOL-HARITASI.md` | Her oturumun başında. Aktif aşama ve yapılacaklar burada. |
| `docs/MIMARI.md` | Süreç yapısı, veritabanı, IPC, tarama, AI akışı üzerinde çalışırken. |
| `docs/TASARIM.md` | Herhangi bir arayüz işi yapmadan önce. |
| `docs/PROJELER.md` | Projeler paneli, tarama, Unity ve Claude Code köprüsü. |
| `docs/OKUL.md` | Okul paneli. |
| `docs/EKRANLAR.md` | Bugün, Döküm, Onay Kutusu, Zihin, Bilgi, Ayarlar. |

## Stack

- Electron + electron-vite, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`)
- Yönlendirme: React Router (hash tabanlı). Veri: TanStack Query, IPC üzerinden.
- Veritabanı: yerel SQLite, `better-sqlite3` + Drizzle ORM + drizzle-kit migration. Arama: SQLite FTS5.
- Doğrulama: zod (IPC girdileri ve AI çıktıları her zaman doğrulanır).
- İkonlar: lucide-react (stroke 1.75). Tarih: date-fns + `tr` locale.
- Editör: TipTap, içerik **markdown olarak** saklanır. PDF görüntüleme: pdfjs-dist.
- Git okuma: simple-git. Dosya tarama: fast-glob + fs.stat.
- Grafikler: kendi SVG bileşenlerimiz (grafik kütüphanesi yok, tasarım dili özel).
- Test: Vitest (saf fonksiyonlar ve algoritmalar). Paketleme: electron-builder (Windows NSIS).

`better-sqlite3` (v13+) N-API modülüdür ve hazır `prebuilds/win32-x64.node` ile gelir; aynı dosya hem Node'da hem Electron'da çalışır.
**Yeniden derleme yok:** `electron-builder install-app-deps` / `@electron/rebuild` çalıştırma (MSVC ister ve gereksiz). Vitest de aynı modülü kullanabilir.

## Komutlar

Kurulum aşamasında `package.json` bu isimlerle yazılır ve bu bölüm güncel tutulur:

```
npm run dev          # uygulamayı geliştirme modunda aç
npm run typecheck    # tsc --noEmit (main + renderer)
npm run lint
npm run test         # vitest run
npm run db:generate  # drizzle-kit migration üret
npm run seed -- --data-dir <klasör> [--reset]  # örnek veri; gerçek veri klasörünü reddeder
npm run build        # paketle
```

## Klasör yapısı

```
src/main/         Electron ana süreci: DB, IPC handler'ları, tarayıcılar, AI çalıştırıcı, bildirimler
  db/             drizzle şeması, migration'lar, sorgular
  scan/           klasör + git + Unity tarayıcıları
  ai/             iş paketi hazırlama, claude çağrısı, changes.json doğrulama/uygulama
  domain/         saf algoritmalar (yerleştirme, not hesabı, radar, kuluçka...) — Electron'a bağımsız, test edilir
src/preload/      window.api köprüsü (contextBridge), başka hiçbir şey
src/shared/       IPC sözleşmesi (tipler + zod şemaları), ortak tipler
src/renderer/     React uygulaması
  ui/             tasarım sistemi bileşenleri (Tile, Button, Tag, Band, Modal...)
  features/<panel>/  her panelin kendi sayfaları, bileşenleri ve hook'ları
resources/        AI ajan kuralları, proje köprüsü şablonları
src/renderer/public/fonts/  Archivo fontları (Vite `/fonts/...` olarak sunar)
design/referans/  tasarım görselleri ve HTML'leri (salt referans)
docs/             spesifikasyonlar
```

## Değişmez kurallar

1. **AI veritabanına asla doğrudan yazmaz.** AI sadece `changes.json` formatında öneri üretir. Uygulama zod ile doğrular, Onay Kutusu'nda gösterir, Taha onaylarsa uygular. Her uygulanan değişiklik `activity_log`'a yazılır ve geri alınabilir. (Ayrıntı: `docs/MIMARI.md`)
2. **Algoritma önce.** Sıralama, yerleştirme, istatistik, arama, tarama, not hesabı, hatırlatma, radar, kuluçka AI kullanmaz. AI yalnızca: ham dökümü ayrıştırma, serbest metinden özet, resim/PDF okuma, haftalık değerlendirme.
3. **Arka plan süreci yok.** Uygulama kapalıyken hiçbir şey çalışmaz. Tarama "Güncelle" butonuyla yapılır. Açılışta kaçırılan hatırlatmalar gösterilir. Tray, otomatik başlatma ekleme.
4. **Renderer dosya sistemine ve DB'ye dokunmaz.** Her şey `window.api` üzerinden, `src/shared/ipc.ts` sözleşmesiyle. `nodeIntegration: false`, `contextIsolation: true`.
5. **Veri Taha'nın.** Veri klasörü: varsayılan `%USERPROFILE%\SecondMind\` (OneDrive dışında; `Belgeler` değil) (`secondmind.db`, `media/`, `ai/`). Silme işlemleri önce çöp kutusuna (soft delete). Migration'lar geri dönüşü düşünülerek yazılır.
6. **Paneller birbirinin kopyası olamaz.** Aşağıdaki bölüme bak. Bu, projenin eski sürümünün öldüğü yer.

## Paneller neden farklı

Eski sürümde her panel "başlık + kart listesi"ydi, sadece adı değişiyordu. Bu kesinlikle tekrarlanmayacak.
Paneller ortak **bileşenleri** (Tile, Button, Tag, Band, Modal) paylaşır ama **sayfa şablonu, veri modeli ve etkileşim modeli paylaşmaz.**
`CollectionPage`, `GenericListPage` gibi "her şeye uyan" sayfa bileşenleri yazma.

| Panel | Cevapladığı soru | Temel birim | Zaman ekseni | Ana düzen | Veri nereden gelir |
| --- | --- | --- | --- | --- | --- |
| Bugün | Şu an ne yapmalıyım? | Zaman bloğu | Tek gün, saat saat | Akış bandı + poster + karolar | Her panelden toplanır |
| Döküm | Aklımdakini nereye atayım? | Ham öğe | Yok (kuyruk) | Tek giriş alanı + kuyruk | Taha |
| Onay Kutusu | AI ne yapmak istiyor? | Öneri | İş sırası | Kaynağa göre gruplu fark listesi | AI |
| Projeler | Nerede kaldım, sırada ne var, proje nereye gidiyor? | Proje → kilometre taşı → görev | Açık uçlu, hedef tarihli | Proje şeritleri; detayda kokpit + çalışma alanı sekmeleri | Git, klasör tarama, Claude Code köprüsü, Taha |
| Okul | Bu dönem nasıl gidiyor, hangi sınav, ne çalışmalıyım? | Dönem → ders → hafta/konu | Sabit dönem (14 hafta), haftalık döngü | Dönem panosu; derste hafta şeridi + not defteri | Ders programı, not girişleri, materyaller |
| Zihin | Nasılım, beni ne etkiliyor? | Günlük kayıt | Günler/haftalar, eğilim | Kayıt + grafikler + kararlar | Taha'nın kayıtları |
| Bilgi | Şunu nereye yazmıştım? | Not | Yok | Üç panelli arşiv + arama | Taha, AI |

Projeler'de kanban, yol haritası, dokümantasyon ağacı vardır; Okul'da **yoktur**. Okul'da not ortalaması, devamsızlık, hafta hafta müfredat vardır; Projeler'de **yoktur**.

## Tasarım özeti

Tam kurallar `docs/TASARIM.md`'de. Kısa hali: "Poster" yönü. Beyaz zemin, siyah akış bandı, Archivo fontu (başlıklar geniş 125 ve büyük harf), düz renkli karolar, her karo tek soru ve en fazla iki eylem. Karo ve bantta gölge ve kenarlık yok. Sol kenar çubuğu 80px, sadece ikon.

Tasarımda sadece **Bugün (açık/koyu), Hızlı Döküm modalı ve tasarım sistemi** çizildi. Diğer ekranlar tasarım sistemindeki bileşenlerle ve ilgili spesifikasyonla türetilir. Çizilmemiş bir ekrana başlamadan önce 5-10 satırlık bir düzen planı yaz ve Taha'nın onayını al.

## Çalışma şekli

- Oturum başında `docs/YOL-HARITASI.md`'yi oku. **Sadece aktif aşamanın** işlerini yap, sonraki aşamaya kendiliğinden geçme.
- Spesifikasyonda boşluk veya çelişki varsa tahmin etme, kısa bir soruyla Taha'ya sor.
- Bir iş bitince: `npm run typecheck`, `npm run lint`, `npm run test` temiz olmalı. Sonra Taha'ya neyi nasıl deneyeceğini 2-4 maddeyle söyle, `YOL-HARITASI.md`'deki kutuyu işaretle ve bir commit mesajı öner.
- Kod ve tanımlayıcılar İngilizce, arayüz metinleri ve dokümanlar Türkçe. Türkçe karakterleri (ğ ş ı İ ç ö ü) asla ASCII'ye çevirme; büyük harfe çevirirken `toLocaleUpperCase('tr-TR')` kullan.
- `domain/` altındaki her algoritmanın Vitest testi olur.

## Token tasarrufu

- `node_modules/`, `out/`, `dist/`, `*.db`, `media/` okunmaz.
- Tasarım için önce `docs/TASARIM.md`, sonra gerekirse `design/referans/*.png`. HTML referanslarını sadece belirli bir bileşenin ölçüsü lazımsa ve `grep` ile hedefli oku; tamamını okuma.
- Tasarımın orijinal paketlenmiş HTML'i (2 MB) repoya konmaz; varsa asla okunmaz.
- Büyük dosyaları baştan sona okumak yerine ilgili bölümü ara.
