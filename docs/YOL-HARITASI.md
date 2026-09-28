# Yol haritası

Sadece **Aktif** işaretli aşamada çalış. Aşama bitince Taha onaylar, sonra bir sonraki aktif yapılır.
Her aşamanın sonunda uygulama açılır ve çalışır durumdadır.

## Aşama 0 — Kurulum · BİTTİ
- [x] electron-vite ile React + TypeScript projesi, `contextIsolation`, preload köprüsü
- [x] Tailwind v4, `tokens.css` (TASARIM.md), Archivo fontları `src/renderer/public/fonts`'tan, açık/koyu tema geçişi
- [x] ESLint + Prettier, Vitest, `package.json` script'leri (CLAUDE.md'deki adlarla)
- [x] better-sqlite3 + Drizzle, veri klasörü oluşturma, ilk migration (`settings` tablosu); native rebuild gerekmedi (N-API hazır dosya)
- [x] `src/shared/ipc.ts` iskeleti ve bir örnek kanal (`settings:get`) uçtan uca
**Bitti sayılır:** `npm run dev` pencereyi açar, tema değişir, ayar DB'ye yazılıp okunur, typecheck/lint/test temiz.

## Aşama 1 — İskelet ve tasarım sistemi · BİTTİ
1a: `ui/` bileşenleri + `/tasarim` sayfası. 1b: kenar çubuğu, üst çubuk, Bugün, akış bandı, Hızlı Döküm, boş sayfalar.
- [x] `ui/` bileşenleri: Button (tüm türler ve durumlar), Tile (4 tür), Tag, Badge, Field, Scale (1–5), DropZone, Modal, Toast, Menu, Skeleton, EmptyState, ErrorState
- [x] Geliştirme için `/tasarim` sayfası: tüm bileşenler, `tasarim-sistemi.png` ile yan yana karşılaştırılabilir
- [x] Kenar çubuğu (80px), üst çubuk, yönlendirme, komut paleti iskeleti (Ctrl K)
- [x] Bugün ekranı **sahte veriyle**, tasarımla birebir (açık ve koyu), akış bandı bileşeni
- [x] Hızlı Döküm modalı (Ctrl N), henüz kaydetmeden
- [x] Diğer paneller için boş sayfa + boş durum
**Bitti sayılır:** Bugün ekranı ekran görüntüsüyle yan yana konunca aynı görünüyor.

## Aşama 2 — Veri, Döküm, Bilgi · BİTTİ
2a: çekirdek tablolar, activity_log, soft delete, media, Döküm. 2b: Bilgi. 2c: Fikirler, kuluçka, seed.
- [x] Çekirdek tablolar (MIMARI.md), `activity_log`, soft delete (2a: `media`, `dump_items`, `dump_attachments`, `activity_log`; diğerleri kendi aşamasında)
- [x] Media deposu (hash'li dosya adları), resim yapıştırma ve sürükleme
- [x] Döküm: kaydet, listele, sil; Hızlı Döküm gerçekten kaydeder
- [x] Bilgi: koleksiyonlar, etiketler, TipTap editör (markdown saklama, resim), FTS5 arama, komut paletinde notlar
- [x] Fikirler ve kuluçka (`domain/incubation` + test); Bugün'deki kuluçka ve radar karoları gerçek veriyle (radar şimdilik sadece fikir)
- [x] `npm run seed` ile gerçekçi örnek veri (`--data-dir` zorunlu)
**Bitti sayılır:** Taha bir gün boyunca döküm ve not alabiliyor, arama çalışıyor.

## Aşama 3 — Bugün gerçek veriyle · BİTTİ
3a: görevler, rutinler, hatırlatmalar, zamanlayıcı. 3b: `domain/scheduler`, `schedule_blocks`, akış bandı, Şimdi.
3c: Zihin karosu (`checkins`), başarılar karosu, sahte verinin temizlenmesi.
Kararlar: görev bağlamı şimdilik genel; ders/sınav blokları Okul'a (6) kadar bantta yok; Şimdi ve Sıradaki adımlar
genel görevlerden; tekrar kuralı kendi JSON şemamız; kaçırılan günler açılışta tek seferde kayar, erteleme görev
başına bir kez artar; elle sürüklenen blok o gün sabit; karar gözden geçirme karosu Aşama 7'ye kadar gizli;
kenar çubuğu projeleri Aşama 5'e kadar sahte, Onay Kutusu rozeti Aşama 4'e kadar yok.
- [x] Görevler, rutinler, hatırlatmalar; hatırlatma zamanlayıcısı ve sistem bildirimi; kaçırılanlar (3a: Ctrl G görev,
  Ctrl H hatırlatma, hızlı giriş ayrıştırma, Sıradaki adımlar + hızlı görev satırı, Hatırlatmalar karosu, Ayarlar > Rutinler)
- [x] `domain/scheduler` (yerleştirme + yeniden yerleştirme + gün sonu kaydırma) ve testleri; erteleme sayacı
  (3b: `schedule_blocks`, açılışta ve dakikada bir `fill`, "Böl · Sil · Bugün yap" sorusu, `task:split`)
- [x] Akış bandında sürükleme, "şimdi" bölümü (3b: sürükle / ← → taşır ve sabitler, işarete tıklamak sabitliği kaldırır;
  Şimdi: süren → sıradaki → en öndeki görev; Başla = bloğu şimdiye çek, Tamamla, Sonraya at)
- [x] Zihin günlük kaydı karosu (veri yazımı), başarılar karosu (3c: `checkins`, uyku serbest yazım "7:15" / "7,5";
  başarılar bu hafta + bugün biten görev, commit Aşama 5'te, quiz 6'da; boş karolar gizlenir, kalanlar dengeli yayılır;
  karar karosu ve sahte karolar kaldırıldı, `lib/fake.ts`'te sadece kenar çubuğu projeleri kaldı)
**Bitti sayılır:** Bugün ekranı sahte veri olmadan tasarımdaki gibi doluyor.

## Aşama 4 — AI akışı ve Onay Kutusu · BEKLİYOR
Yerel model (Qwen) mi, Claude Code mu, ikisi birlikte mi kararı açık: `docs/YEREL-LLM.md`. Karar verilmeden başlanmaz.
- [ ] `resources/ai-agent/CLAUDE.md` gözden geçirilir, veri klasörüne kopyalanır
- [ ] İş paketi hazırlama (bağlam kırpma dahil), `claude` sürecini başlatma, zaman aşımı, iptal, ilerleme
- [ ] `changesSchema` (zod) + her işlem türü için uygulayıcı + önizleme bileşeni
- [ ] Onay Kutusu: gruplar, fark karosu, onayla / reddet / düzenle, tümünü onayla, işlem günlüğü ve geri al
- [ ] Ayarlar > AI: Claude Code yolu ve test butonu, model seçimi
**Bitti sayılır:** 5 karışık döküm (metin + tahta fotoğrafı) işlenip doğru önerilere dönüşüyor, onaylananlar yerine yazılıyor, geri alınabiliyor.

## Aşama 5 — Projeler · AKTİF
İlke: SecondMind projede Taha'nın fark etmediğini fark eder; veri kendi toplanır ya da tek hareket ister, form yok.
Tamamen algoritmik (AI'lı sürümler Aşama 4'ten sonra). Sıra Runika'nın çıkışına en çok yardım edene göre.
Runika klasörü (`C:\ajanda\Runika`) tarayıcılarla sadece okunur, içine yazılmaz.
- [x] 5a Temel: `projects`, `project_folders`, `sessions`, `parking`; klasörden proje oluşturma (tür/ad/renk tahmini),
  liste şeritleri, proje başlığı bandı, Kokpit iskeleti (sıradaki adım, son oturum, Sonra karoları), oturum başlat/kapat
  ve kapanış modalı, park alanı (uygulama içi P + küresel Ctrl Alt P mini penceresi), kenar çubuğu ve komut paletinde
  gerçek projeler (`lib/fake.ts` silinir), Bugün'de proje renkleri + Şimdi'de gerçek oturum, seed'e Runika/SecondMind/Albüm
- [ ] 5b Tarama ve geri dönüş: git (commit'ler, alanlar, commit'lenmemiş değişiklikler), Unity (sürüm, sahneler,
  EditorBuildSettings, script sayısı), TODO taraması, git'siz envanter, Claude Code oturum kayıtlarından otomatik
  oturumlar (sadece üst veri), geri dönüş brifingi, Bu hafta / Koddaki notlar / ısı haritası karoları, Güncelle ve toast,
  sessizlik ve radar, şeritte aktivite çubukları
- [ ] 5c Planlama: `domain/nextSteps` (sıradaki adım motoru) + test, kilometre taşları ve çıkış kriterleri, kanban
  (türler, önem, erteleme), `domain/playtest` (bölme + benzerlik) + test ve playtest kutusu, kapsam ölçer ve gerçekçi
  bitiş tahmini (`domain/scope` + test), taş planlarken park sütunu, Yol haritası zaman çizelgesi, yayın platformu şablonu
  (Steam / itch.io), proje takvimi; Bugün'ün Şimdi'si motoru kullanır
- [ ] 5d Doküman ve hafıza: doküman ağacı + şablonlar + ADR, bağlı repo markdown'ları, GDD ile gerçeklik karşılaştırması
  (`domain/gddCompare` + test), Günlük, devlog taslağı (`domain/devlog` + test), Varlıklar, zaman makinesi galerisi
  (görüntü klasörleri + kapanışta yapıştırma) ve karşılaştırma
- [ ] 5e Claude Code köprüsü: `Köprüyü kur` / `Köprüyü kaldır`, `BAGLAM.md` üretimi (motorla), Editor betiği
  (`SecondMindSnapshot.cs`, zaman makinesine günlük kare), oturum raporu ayrıştırma → Günlük ve otomatik oturum.
  **Aşama 4'e bağlı:** rapordaki önerilerin Onay Kutusu'na düşmesi (o zamana kadar elle Göreve çevir / Park et)
**Bitti sayılır:** Runika klasörü bağlanıyor; tarama commit'leri, commit'lenmemişleri ve TODO'ları doğru gösteriyor;
3 gün sonra açılınca brifing nerede kalındığını söylüyor; Kokpit gerekçesiyle sıradaki 3 adımı veriyor; bir playtest
yapıştırması kümelenip hataya dönüşüyor; Editor betiği günlük kare bırakıyor.

## Aşama 6 — Okul
- [ ] Dönem, ders, program, hoca kurulumu (Ayarlar + ilk kurulum sihirbazı)
- [ ] Dönem panosu: üst bant, sınav şeridi, dikey haftalık program, not durumu tablosu, bu hafta teslim
- [ ] Ders detayı: Hafta hafta defteri (PDF görüntüleme, anlamadım ve hoca vurguladı işaretleri), Sınavlar ve notlar (hesaplayıcı), Hoca, Ödevler, Devamsızlık
- [ ] Sınav hazırlık ekranı ve `buildStudyPlan` / `redistribute`; GANO ekranı
- [ ] `domain/school` testleri
**Bitti sayılır:** Gerçek dönem programı girilmiş, bir sınav için plan üretilip Bugün'e yerleşiyor, not hesaplayıcı doğru sonuç veriyor.

## Aşama 7 — Zihin
- [ ] Eğilimler grafikleri (SVG bileşenleri), içgörü üretimi (`domain/insights` + test)
- [ ] Kararlar ve gözden geçirme, Başarılar zaman çizelgesi
- [ ] Haftalık değerlendirme (AI akışı, `weekly_review`)

## Aşama 8 — Cilalama ve paketleme
- [ ] Yedekleme ve geri yükleme, veri klasörünü taşıma
- [ ] electron-builder ile Windows kurulum dosyası, uygulama ikonu
- [ ] Performans (büyük not listeleri, uzun commit geçmişi), erişilebilirlik kontrolü

**Not (paketleme):** better-sqlite3'ün `.node` dosyası (`node_modules/better-sqlite3/prebuilds/*.node`) `asarUnpack` ile
asar paketinin dışında kalmalı; asar içinden native modül yüklenemez. Migration klasörü de `extraResources` ile
`resources/migrations`'a kopyalanır (`src/main/db/client.ts` bunu bekliyor).
Electron yükseltmelerinde önce bunu kontrol et: better-sqlite3 hazır dosyası yeni Electron'da açılıyor mu
(`ELECTRON_RUN_AS_NODE=1 npx electron -e "require('better-sqlite3')(':memory:')"`), paketli sürümde de açılıyor mu.
