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

## Aşama 5 — Projeler · BİTTİ
İlke: SecondMind projede Taha'nın fark etmediğini fark eder; veri kendi toplanır ya da tek hareket ister, form yok.
Tamamen algoritmik (AI'lı sürümler Aşama 4'ten sonra). Sıra Runika'nın çıkışına en çok yardım edene göre.
Runika klasörü (`C:\ajanda\Runika`) tarayıcılarla sadece okunur, içine yazılmaz.
Kararlar (5a): proje klasörden oluşur (ad/tür/renk tahmini); liste filtre yerine aktif → duraklatılmış → katlı arşiv;
aynı anda tek oturum (başka projede Başla önce süreninkini kapatır); kısayollar B başla/kapat, P park, ↑↓, Ctrl Alt P;
Runika'nın yayın platformu itch.io (Windows + WebGL), Steam iptal. Hızlı Döküm'de `#proje sonra` öneki henüz yok.
- [x] 5a Temel: `projects`, `project_folders`, `sessions`, `parking`; klasörden proje oluşturma (tür/ad/renk tahmini),
  liste şeritleri, proje başlığı bandı, Kokpit iskeleti (sıradaki adım, son oturum, Sonra karoları), oturum başlat/kapat
  ve kapanış modalı, park alanı (uygulama içi P + küresel Ctrl Alt P mini penceresi), kenar çubuğu ve komut paletinde
  gerçek projeler (`lib/fake.ts` silinir), Bugün'de proje renkleri + Şimdi'de gerçek oturum, seed'e Runika/SecondMind/Albüm
- [x] 5b Tarama ve geri dönüş: git (commit'ler, alanlar, commit'lenmemiş değişiklikler), Unity (sürüm, sahneler,
  EditorBuildSettings, script sayısı), TODO taraması, git'siz envanter, Claude Code oturum kayıtlarından otomatik
  oturumlar (sadece üst veri), geri dönüş brifingi, Bu hafta / Koddaki notlar karoları, proje notları (metin + görsel; ısı haritası çıkarıldı), Güncelle ve toast,
  sessizlik ve radar, şeritte aktivite çubukları
  - [x] 5b-1 Tarayıcılar: `commits` / `code_todos` / `scan_snapshots` (0008), git + Unity + kod notu + envanter
    (sadece okur), Güncelle butonu ve toast, sessizliğe commit ve dosya değişikliği
  - [x] 5b-2 Claude Code kayıtlarından otomatik oturumlar (30 dk boşluk kuralı, elle oturumu zenginleştirme)
  - [x] 5b-3 Arayüz: geri dönüş brifingi, Bu hafta / Koddaki notlar karoları, proje notları, başlık bandında Tara,
    şerit aktivite çubukları, radar
  Kararlar (5b): ısı haritası yerine proje notları (ayrı "Notlar" sekmesi, Bilgi ile aynı `notes` tablosu ve editör,
  `project_id` ile; Bilgi aramasında da çıkar). Brifing son açılışa göre, sessizlik takvim günüyle (ikisi aynı sayı).
  Şerit çubuğu: hafta başına commit × 30 dk + oturum dakikası, en yoğun haftaya göre. Radar: fikir ile proje
  arasında en uzun sessiz olan; eşitlikte proje; proje için Aç / Duraklat.
- [x] 5c Planlama: `domain/nextSteps` (sıradaki adım motoru) + test, kilometre taşları ve çıkış kriterleri, kanban
  (türler, önem, erteleme), `domain/playtest` (bölme + benzerlik) + test ve playtest kutusu, kapsam ölçer ve gerçekçi
  bitiş tahmini (`domain/scope` + test), taş planlarken park sütunu, Yol haritası zaman çizelgesi, yayın platformu şablonu
  (Steam / itch.io; Runika itch.io), proje takvimi; Bugün'ün Şimdi'si motoru kullanır
  - [x] 5c-1 Veri ve motorlar: `milestones`, `tasks` ekleri, `playtest_*` (0009 + geri dönüş; mevcut proje görevleri
    kanbana), `domain/nextSteps` + `domain/playtest` + `domain/scope` (+ testler), Kokpit "Şimdi bunu yap" motordan
    (ilk 3 adım, gerekçe)
  - [x] 5c-2 Görevler sekmesi: kanban (türler, önem, erteleme, hızlı satır), Bugün'ün Şimdi'si motoru kullanır
    (şerit ve brifingdeki sıradaki adım da motordan)
  - [x] 5c-3 Yol haritası sekmesi: taşlar + çıkış kriterleri, zaman çizelgesi, kapsam ölçer ve tahmin, park sütunu,
    yayın platformu şablonu, proje takvimi; Kokpit'te Kilometre taşı karosu
    (Yol haritası Ctrl 3, Notlar Ctrl 4; "Çizelge / Takvim" geçişi; şablon Unity projesinde taş yokken, platform
    seçilince `release_platform` yazılır; tarihsiz taşlar bandın altında; taş silinince görevler bağını korur)
  - [x] 5c-4 Playtest: `+ Yapıştır`, kümeler, sürükle/ayır, hataya çevir; Kokpit'te Playtest karosu
    (Görevler içinde "Pano · Playtest" görünümü, sekme değil; Ctrl Shift V projenin her yerinde panodaki metinle açar;
    Kokpit karosu boşken de görünür; tek noktalı kümeler katlı "Tek bildirim"; her yazım tek grupla loglanır ve
    toast'taki Geri al grubu geri alır; hata önemi boş gelir, Taha seçer)
  Kararlar (5c): playtest'te elle ayrılan nokta kendi kümesi olur ve kilitlenir. Kanban kolon içi sıra motor/`compareTasks`
  sırası (elle sıralama yok); erteleme eylemleri (Böl · Sil · Bugün yap) kart panelinde. Bugün'ün Şimdi'si blok yoksa
  süren oturumun projesinin 1. adımını, o yoksa en öndeki proje görevi yerine o projenin 1. adımını alır.
- [x] 5d Doküman ve hafıza: doküman ağacı + şablonlar + ADR, bağlı repo markdown'ları, GDD ile gerçeklik karşılaştırması
  (`domain/gddCompare` + test), Günlük, devlog taslağı (`domain/devlog` + test), Varlıklar, zaman makinesi galerisi
  (görüntü klasörleri + kapanışta yapıştırma) ve karşılaştırma
  - [x] 5d-1 Dokümanlar sekmesi (Ctrl 5): `project_docs` + FTS (0010, geri dönüşlü), sayfa ağacı (sürükle: üst/alt
    çeyrek önüne/arkasına, orta içine), tür şablonları (GDD / Teknik / Yaratıcı; Genel tek sayfa), ADR ("Kararlar"
    altına, şablon gövdeyle), bağlı markdown dosyaları (salt okunur, "Klasörde düzenle"), tek GDD işareti, tablo
  - [x] 5d-2 GDD ile gerçeklik: `domain/gddCompare` + test, sayım kuralları (`count_rules_json`), GDD sayfasının
    üstünde şerit (öneri tek tıkla kabul, tek satırda düzeltme), Kokpit'te fark karosu
  - [x] 5d-3 Günlük sekmesi (Ctrl 6): commit grupları, oturumlar, biten görevler, taşlar, playtest yapıştırmaları,
    kareler ve `+ Not` gün gün (30 günlük sayfalar, "Daha eski"), filtre; devlog taslağı (`domain/devlog` + test,
    `Bu hafta` / Ctrl D, hafta gezinme, Markdown / Steam BBCode, Kopyala, Günlüğe kaydet, görselleri klasöre çıkar)
  - [x] 5d-4 Varlıklar sekmesi (Ctrl 7): zaman makinesi (görüntü klasörü önerisi ve bağlama, Güncelle/Tara'da yeni
    kareler `media/`'ya, `.secondmind/goruntuler/` her zaman okunur, kapanış modalında Ctrl V, yan yana / sürgülü
    karşılaştırma, yıldız), varlık ızgarası (bırak → `media/`, resim önizleme, ses oynatıcı, PDF aç, sayfaya /
    göreve bağla), yaratıcı projede klasördeki ses/görsel dosyaları (`sm-file://`, kopyalanmaz)
  Kararlar (5d): yeni sekmeler sona eklenir (Notlar Ctrl 4'te kalır): Dokümanlar Ctrl 5, Günlük Ctrl 6, Varlıklar
  Ctrl 7. 5d'nin bütün tabloları tek migration'da (0010). Dokümanlar Notlar'dan ayrı kalır (yapılandırılmış belge).
  GDD sayfası alt sayfalarıyla birlikte okunur; bağlı GDD dosyası (adı "GDD" içeriyorsa) kendiliğinden işaretlenir.
  Karşılaştırmanın klasör sayımı ekran açılınca yapılır (sadece okuma; arka plan yok). Tablo için
  `@tiptap/extension-table` eklendi (mevcut TipTap sürümüyle aynı).
- [x] 5e Claude Code köprüsü: `Köprüyü kur` / `Köprüyü kaldır`, `BAGLAM.md` üretimi (motorla), Editor betiği
  (`SecondMindSnapshot.cs`, zaman makinesine günlük kare), oturum raporu ayrıştırma → Günlük ve otomatik oturum.
  **Aşama 4'e bağlı:** rapordaki önerilerin Onay Kutusu'na düşmesi (o zamana kadar elle Göreve çevir / Park et)
  Kararlar (5e): köprü proje menüsünden (⋯ → Claude Code köprüsü) kurulur; `.secondmind/` her zaman, CLAUDE.md bölümü
  (işaretler arasında, kaldırınca sadece o silinir), Editor betiği ve .gitignore satırı tek tek seçilir. Kaldırma
  BAGLAM.md'yi ve dokümanlar/ kopyasını siler; oturum raporları ve kareler kalır. BAGLAM.md her Güncelle/Tara'da ve
  Başla'da yazılır. Rapor Günlük'e "Claude Code raporu" olarak düşer, aynı zaman aralığındaki Claude Code oturumunu
  zenginleştirir, yoksa oturum açar; maddeler Aşama 4'e kadar Günlük'te elle alınır (Göreve çevir / Hata / Park /
  Karar). Editor betiği `CaptureScreenshot` ile karenin sonunda yazar, sonra 1280 px'e küçültür (Unity'de henüz
  denenmedi). Paketlemede `resources/proje-koprusu` extraResources'a eklenmeli (Aşama 8).
**Bitti sayılır:** Runika klasörü bağlanıyor; tarama commit'leri, commit'lenmemişleri ve TODO'ları doğru gösteriyor;
3 gün sonra açılınca brifing nerede kalındığını söylüyor; Kokpit gerekçesiyle sıradaki 3 adımı veriyor; bir playtest
yapıştırması kümelenip hataya dönüşüyor; Editor betiği günlük kare bırakıyor.

## Aşama 6 — Okul · AKTİF
Kararlar (6): tablolar tek migration'da (`0011_school`, geri dönüş `down/0011_school.down.sql`). Hafta tarih aralığı
saklanmaz, dönem başından hesaplanır (haftalar Pazartesi başlar). Not hesabı (`weightedScore`, `requiredScores`,
`letterFor`, `gpa`) arayüzdeki kaydırıcı ve GANO simülasyonu da kullandığı için `src/shared/school/grades.ts`'te;
diğer algoritmalar `src/main/domain/school/` (term, attendance, studyPlan). Bileşen başına tek not (`grade_components.score`),
ayrı `grades` tablosu yok; sınav analizi `exams.review_md`. Sınav kapsamı hafta aralığı (`week_from/to`): o haftalara
sonradan eklenen konu da sınava girer. Devam birimi "ders saati" (oturum süresi saate yuvarlanır); sınır % ya da saat,
sınıra ≤ 2 kala amber. Çalışma planı `study_blocks`'ta; Bugün'ün `schedule_blocks`'una ders (`class`) ve çalışma
(`study`) sabit blok olarak yansır. Plan: seviye süresi (4 sa / 2,5 sa / 1,5 sa / 30 dk, vurgu ×1,5), önce vurgulanan
ve zor, son gün 2 sa tekrar, günlere eşit pay, önce 13:00 sonrası, 09–22 penceresi, 10 dk mola; günlük sınır
Ayarlar > Okul (varsayılan 3 sa). Kaçırılan blok (günü geçmiş, işaretsiz) ertesi okumada `system` aktörüyle kalan
günlere yayılır, sığmayan "sığmadı" uyarısı. Ödevde 48 saat kala hatırlatma otomatik (teslimde kalkar). Hafta notları
`notes` (course_id + week_id), Bilgi listesinde görünmez, aramada çıkar. "Anlamadım" = imlecin paragrafı → `note_flags`.
Arşiv dönemin dersleri salt okunur; GANO'da arşiv harfi seçmek kaydeder, aktif dönemde simülasyondur. PDF: pdfjs-dist,
baytlar IPC ile (`material:bytes`). AI ile izlenceden müfredat çıkarma, `create_exam` / `add_instructor_note` Aşama 4'e bağlı.
- [x] Dönem, ders, program, hoca kurulumu (Ayarlar > Okul + ilk kurulum sihirbazı, serbest yazım "Pzt 09:00-10:50 D-201")
- [x] Dönem panosu: üst bant, sınav şeridi, dikey haftalık program (yoklama tek tık), not durumu tablosu, bu hafta teslim
- [x] Ders detayı: Hafta hafta defteri (PDF görüntüleme, anlamadım ve hoca vurguladı işaretleri), Sınavlar ve notlar (hesaplayıcı), Hoca, Ödevler, Devamsızlık
- [x] Sınav hazırlık ekranı ve `buildStudyPlan` / `redistribute`; GANO ekranı
- [x] `domain/school` testleri (+ `shared/school/grades`, `db/school` entegrasyon testleri)
  Bugün: ders ve çalışma blokları akış bandında, Şimdi'de "Çalıştım", "Derse katıldın mı?" karosu, başarılarda ödev;
  komut paletinde Okul grubu; seed'e iki dönem, 9 ders, 2 sınav (biri planlı).
  Taha geri bildirimi (6 sonrası düzeltme): "anlamadım" işareti silinebilir (geri alınır); arayüzde AKTS yerine
  "Kredi"; değerlendirme şeması hazır seçenek yerine elle (Quiz · Vize · Final, boş ağırlık, satır eklenip silinir);
  harf tahmini kaldırıldı: harf ya elle girilir ya da bütün notlar girilince çıkar (dönem ortalaması da buna göre).
  **Açık konular:** (1) Okul panosunun tasarımı işlevsiz bulundu; Taha ile ayrıca konuşulacak, o zamana kadar düzen
  değişmez. (2) Ders ekleme yorucu: Aşama 4'te LLM ders programı görselinden/PDF'inden (jpeg dahil) dönem, ders,
  saat, derslik ve hocayı çıkarıp öneri olarak Onay Kutusu'na koymalı (`changes.json`'a okul işlemleri).
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
