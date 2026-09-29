# Projeler paneli

**Soru:** Nerede kaldım, sırada ne var, proje nereye gidiyor?
**Ruh:** Bir atölye. Açık uçlu, hedefe doğru ilerleyen işler. Projenin hafızası burada tutulur:
tasarım dokümanı, kararlar, oturumlar, görevler, yol haritası, varlıklar.
Okul'dan farkı: dönemi, notu, haftası yoktur; kilometre taşı, kanban ve dokümantasyon ağacı vardır.

**İlke: SecondMind projede Taha'nın fark etmediğini fark eder.** Her özellik ya veriyi kendi toplar (git, Unity dosyaları,
Claude Code oturum kayıtları, Editor betiği) ya da Taha'dan en fazla **tek hareket** ister (kısayol, yapıştırma, tek cümle).
Form yok. Panelin asıl işi Taha'nın en çok yorulduğu şeyi almak: "şimdi neyi yapmalıyım, sonra nereye geçeceğim,
en son neyi düzeltmeliydim". Bu bölümdeki her şey algoritmiktir (CLAUDE.md kural 2); AI'lı sürümler Aşama 4 kararından sonra.

Örnek projeler: **Runika** (Unity oyunu, çıkış hedefi 20 Ekim 2026, yeşil), **Albüm** (müzik, git yok, pembe),
**SecondMind** (bu uygulama, turuncu).

## Proje türleri

Proje oluştururken tür seçilir. Tür; tarayıcıyı, doküman şablonunu ve görev türlerini belirler.

| Tür | Tarayıcı | Doküman şablonu | Ek |
| --- | --- | --- | --- |
| Unity oyunu | git + Unity | GDD | Hata görevleri, sahne listesi, koddaki TODO'lar, zaman makinesi, playtest |
| Yazılım | git + kod | Teknik doküman | Koddaki TODO'lar |
| Yaratıcı (müzik, görsel, yazı) | dosya envanteri | Yaratıcı proje | Ses/görsel varlık oynatıcı |
| Genel | yok | Boş | — |

**Oluşturma (tek hareket):** `+ Proje` (ya da Ctrl Shift N) önce klasör seçtirir. Klasörden her şey tahmin edilir:
ad = klasör adı, tür = `ProjectSettings/ProjectVersion.txt` varsa Unity, `.git` varsa Yazılım, değilse Yaratıcı;
renk = paletteki ilk boş proje rengi. Tek ekranlık onay: ad, tür ve renk düzeltilebilir, Enter oluşturur.
`Klasörsüz` bağlantısı Genel türde klasörsüz proje açar. Aynı klasör iki projeye bağlanamaz.

## Liste ekranı: proje şeritleri

Kart ızgarası **değil**. Her aktif proje tam genişlikte yatay bir şerittir (köşe 28, zemin `s2`).
Proje rengi soldaki büyük harf adın arkasındaki blokta ve ilerleme çubuğunda görünür. Şeritte soldan sağa:

1. Proje adı (sayfa başlığı stili) + tür + durum rozeti (AKTİF / DURAKLADI / ARŞİV). Oturum sürüyorsa blokta "● 42 DK".
2. **Sıradaki ilk adım** (karo başlığı stili; sıradaki adım motorunun 1. sırası) + `Başla` butonu.
3. **Sonraki kilometre taşı**: ad, hedef tarih, "12 gün kaldı", görevlerden hesaplanan ilerleme çubuğu; kapsam büyüyorsa küçük mercan ok.
4. Son 8 haftanın aktivite çubukları (commit + oturum dakikası).
5. Sessizlik: "3 gün önce". 14 günü geçtiyse şerit mercan "16 GÜN SESSİZ" rozeti alır. Park alanında bekleyen varsa "Sonra: 4".

Verisi olmayan bölüm yer kaplamaz (klasörsüz projede aktivite yok, taşsız projede taş bölümü yok).
Klavye: ↑ ↓ şerit seçer, Enter açar, B seçili projede `Başla`, P seçili projeye park eder.
Üstte: `+ Proje`, filtre chip'leri (Aktif / Duraklatılmış / Arşiv). Altta arşivlenmiş projeler katlanmış.
Sıra: oturumu süren önce, sonra son etkinliğe göre (en yeni üstte).
Boş durum: "Henüz proje yok. Bir klasör bağla, SecondMind takibe başlasın." + `+ Klasör bağla`.

Kenar çubuğu aktif projelerin renkli karelerini (en fazla 5, aynı sıra) gösterir; komut paleti proje adlarıyla açar.

## Proje detayı

Üstte **proje başlığı bandı** (proje renginde dolgu, köşe 28): büyük harf ad, tür, bağlı klasör yolu (kopyalanabilir),
son tarama zamanı, sağda `Başla` ↔ `Oturumu kapat` (oturum sürerken canlı süreyle), `Tara`, `Klasörde aç`.

Altında sekmeler (Ctrl 1…6). Her sekme projenin farklı bir hafızası. Henüz yapılmamış sekme görünmez.
5c-2'den beri: **Kokpit** (Ctrl 1), **Görevler** (Ctrl 2), **Notlar** (Ctrl 3). Notlar: projeye ait serbest notlar (metin + görsel,
markdown); solda liste (son düzenlenen üstte), sağda Bilgi'nin editörü. Aynı `notes` tablosu (`project_id` dolu),
bu yüzden Bilgi'de ve aramada da görünürler. Dokümantasyon ağacı (5d) ayrı kalır: o yapılandırılmış belge, bu serbest not.

### 1. Kokpit
Projeyi açınca ilk görülen yer. Karo düzeni, her karo tek soru. Yukarıdan aşağı önem sırasıyla:

- **Geri dönüş brifingi** (koşullu, en üstte bant): aşağıda.
- **Vurgulu karo — Şimdi bunu yap:** sıradaki adım motorunun ilk 3 adımı; 1. poster başlıkta, gerekçesiyle
  ("Neden: kritik hata · 3 test eden bildirdi · Demo'nun çıkış kriteri · 12 gün kaldı"), 2. ve 3. küçük satır.
  Eylemler: `Başla` (1. adımla oturum açar) / oturum sürerken `Oturumu kapat`. Motor yokken (5a) oturum kapanışında
  yazılan sıradaki adım gösterilir.
- **Son oturum:** tarih, süre, "nerede bıraktın" notu, o oturumda değişen dosyalar (Claude Code kaydından), Claude Code
  oturum raporu varsa özeti.
- **Sonra (park alanı):** bekleyen park öğeleri, en yeni üstte; satırda `Göreve çevir` (↵) ve `At` (Del). Boşsa karo gizli.
- **Kilometre taşı:** sonraki taş, kalan gün, ilerleme, **kapsam ölçer** özeti ("son 2 haftada 14 eklendi, 3 bitti");
  gecikiyorsa ya da gerçekçi tahmin hedefi geçiyorsa mercan.
- **Playtest:** en çok bildirilen 3 küme ("5 kişiden 3'ü: ölüm panelinde takılma"), `+ Yapıştır`.
- **Bu hafta:** commit sayısı, değişen alanlar (Kod 12 dosya, Ses 3 dosya, Sahneler 1), çalışılan dakika.
- **Koddaki notlar** (Unity/Yazılım): TODO/FIXME sayısı, son taramadan beri eklenen/çözülen.
- **GDD ile gerçeklik** (Unity): fark olan sayımlar (aşağıda). Fark yoksa gizli.
- **Açık hatalar** (Unity): önem derecesine göre sayı.
- ~~Aktivite ısı haritası~~ çıkarıldı (Taha kararı, 5b); yerine **Notlar** sekmesi (aşağıda).

Boş karolar gizlenir, kalanlar dengeli yayılır (Bugün'deki `lib/tiles.ts` kuralı). Kokpit, Bugün'ün kopyası değildir:
akış bandı ve saat ekseni yoktur, ana birim tek projenin sıradaki adımı ve onun gerekçesidir.

### 2. Görevler (kanban)
Kolonlar: **Yapılacak · Yapılıyor · Test · Bitti**. Kartlar sürüklenir.
Kart: başlık, tür ikonu (görev / hata / araştırma), kilometre taşı etiketi, tahmini süre, erteleme sayacı (≥3 ise mercan rozet ve
"Böl · Sil · Bugün yap" önerisi), kaynak (Taha / park / playtest / TODO taraması / Claude Code oturumu), playtest sayısı ("3 kişi").
Üstte kilometre taşına ve türe göre filtre. Hata türünde önem (kritik / önemli / küçük) ve "nasıl tekrarlanır" alanı.
"Bugüne al" görevi Bugün'ün akış bandında boş bir yere yerleştirir.
Kolonun üstündeki hızlı satır (Ctrl G'nin proje bağlamlı hali) tek satırda görev ekler; hızlı giriş ayrıştırması
(`!hata`, `!kritik`, `@taş`, `30dk`) aynen çalışır.

### 3. Yol haritası
Kilometre taşları yatay zaman çizelgesinde (akış bandı dilinin haftalık/aylık hali): her taş bir blok, hedef tarih pini, bugün çizgisi.
Taş: ad, hedef tarih, açıklama, bağlı görevler, **çıkış kriterleri** (onay kutulu liste; bir kriter göreve bağlanabilir,
görev bitince kriter kendiliğinden işaretlenir).
Unity oyunu şablonu hazır taşlarla gelir (düzenlenebilir): Oynanabilir prototip → Dikey kesit → Mağaza sayfası → Demo → Beta → Çıkış.
Mağaza sayfası taşının kontrol listesi platforma göre gelir (`release_platform`; Runika: itch.io, Steam iptal):
- **Steam:** kapsül görseller, açıklama, ekran görüntüleri, fragman, etiketler, fiyat, çıkış tarihi.
- **itch.io:** kapak görseli (630×500), kısa açıklama, ekran görüntüleri, GIF/fragman, etiketler, fiyat/ödeme, Windows ve WebGL yapıları.
Taş planlanırken park alanındaki bekleyen öğeler yan sütunda listelenir: her biri tek tuşla bu taşa görev olur ya da atılır.
Ayrıca **proje takvimi**: projeye ait tarihli her şey (taş hedefleri, son tarihli görevler, planlanmış çalışma blokları) ay görünümünde.

**Kapsam ölçer** (taş detayında grafik, Kokpit'te özet cümle):
- Grafik: son 8 hafta, hafta başına iki çubuk: taşa **eklenen** görev (görevin taşa bağlandığı an, `milestone_set_at`)
  ve **biten** görev. Üstte kalan görev sayısı çizgisi.
- Cümle kuralı (son 14 gün): eklenen > biten × 1,5 ve eklenen ≥ 4 → "kapsam büyüyor" (mercan);
  biten ≥ eklenen → "kapanıyor"; arası → "dengede".
- **Gerçekçi bitiş tahmini:** `oran` = tahmin ve gerçek süresi olan son 20 bitmiş proje görevinin gerçek/tahmin
  oranlarının medyanı (5 örnekten azsa 1,5; gerçek süre = göreve bağlı oturumların toplamı). `kalan` = taşın açık
  görevlerinin tahmini toplamı (süresiz görev 60 dk) × oran. `hız` = son 14 günde bu projede çalışılan dakikanın günlük
  ortalaması. Tahmin = bugün + kalan / hız gün. Ayrıca net akış (biten − eklenen) ≤ 0 ise "bu hızla bitmiyor".
  Tahmin hedef tarihi geçiyorsa taş mercan: "Hedef 20 Eki · gerçekçi tahmin 3 Kas".
- Boş durum: "Taşa bağlı görev yok. Park alanından ya da kanbandan görev bağla."

### 4. Dokümantasyon
Projenin yaşayan tasarım dokümanı. Solda sayfa **ağacı** (iç içe, sürüklenerek sıralanır), sağda TipTap editör (markdown, resim yapıştırma, tablo, kod bloğu).
Tür şablonları:
- **GDD (Unity oyunu):** Oyun özeti · Temel döngü · Mekanikler (alt sayfa her mekanik) · Bölümler / Sahneler · Karakterler ·
  Sanat yönü · Ses listesi (tablo: parça, sahne, süre, döngü, durum) · Arayüz ve menüler · Kontroller · Teknik notlar · Yayın.
- **Teknik doküman (yazılım):** Genel bakış · Mimari · Kurulum · Veri modeli · Kararlar.
- **Yaratıcı proje:** Konsept / niyet · Parça listesi · Sözler / metinler · Prodüksiyon notları · Görsel kimlik.

**Bağlı dosya sayfaları:** Proje klasöründe zaten markdown doküman varsa (Runika: `Assets/Notlar/GDD_Runika.md` ve dört not
dosyası) kopyalanmaz; ağaca "bağlı dosya" olarak eklenir, diskten okunur, salt okunur gösterilir ("Klasörde düzenle").
Tarama klasördeki `.md` dosyalarını önerir, tek tıkla bağlanır. Bir bağlı dosya "GDD" işaretlenebilir (GDD karşılaştırması onu okur).

**Kararlar (ADR)** ayrı bir sayfa türüdür: başlık, tarih, bağlam, karar, alternatifler, sonuç. Projenin teknik ve tasarım kararları buradadır
(Zihin'deki karar günlüğü kişisel kararlar içindir, karıştırma).
Dokümantasyon sayfaları FTS aramasına girer ve Claude Code köprüsüyle dışarı verilebilir (aşağıda).

**GDD ile gerçeklik karşılaştırması** (Dokümantasyon'da GDD sayfasının üstünde şerit, Kokpit'te karo):
- GDD'den sayılar: markdown tablolarında ilk hücre bir etiket, sonraki hücrelerden birinde sayı olan satırlar
  (Runika §12: "Silah | 8", "Düşman tipi | 3", "Tur | 12") ve başlığında "ses listesi", "sahneler" ya da "bölümler" geçen
  bölümdeki tablonun satır sayısı ya da madde sayısı. Sayı hücredeki ilk tam sayıdır.
- Klasörden sayılar (tarama): `.unity` sahne sayısı, `EditorBuildSettings`'teki etkin sahne sayısı, ses dosyası sayısı
  (alan kuralı "Ses"), script sayısı, ve **sayım kuralları**: GDD etiketi ↔ glob (Runika için örn.
  "Silah" ↔ `Assets/Data/Items/Weapons/*.asset`). Kural yoksa etiket `Assets/**` altındaki klasör adlarıyla eşleştirilip
  öneri olarak sunulur; tek tıkla kabul, tek satırda düzeltme.
- Gösterim: "GDD'de 12 parça, klasörde 7" — eksik olan mercan, fazla olan nötr. Eşleşen sayımlar katlanır.
- Boş durum: "GDD'de sayı içeren tablo bulunamadı. Ses listesi ya da içerik özeti tablosu ekle, SecondMind klasörle karşılaştırsın."

### 5. Günlük (devlog)
Projenin zaman çizelgesi, en yeni üstte, gün gün gruplu. Öğe türleri kendi ikon ve rengiyle:
commit grubu (mesajlar + değişen alanlar), oturum (elle ya da Claude Code; "nerede bıraktın" + sıradaki adım),
Claude Code oturum raporu, tamamlanan görev, kilometre taşı olayı, zaman makinesi görüntüsü, playtest yapıştırması,
Taha'nın serbest günlük notu (`+ Not`).
Filtre: hepsi / commit'ler / oturumlar / notlar.

**Devlog taslağı** (Günlük'ün üstünde `Bu hafta` butonu, Ctrl D): seçilen haftanın (varsayılan içinde bulunulan) verisinden
**şablonla** kopyalanabilir metin. AI yok; güzel yazılmış hali Aşama 4'ten sonra.
- Girdiler: biten taşlar, biten görevler (türüne göre: "Yeni", "Düzeltilen hatalar"), commit mesajları (merge ve
  "wip"/"fix typo" gibi kısa mesajlar elenir, aynı başlangıçlı mesajlar birleşir), oturum sayısı ve toplam süre,
  haftanın ilk ve son zaman makinesi görüntüsü.
- Şablon: başlık ("Runika · Hafta 39"), 1 cümle özet ("Bu hafta 6 oturum, 11 saat; 9 iş bitti."), "Yeni" maddeleri,
  "Düzeltilen" maddeleri, "Sırada" (sıradaki adım motorunun ilk 3'ü), görseller.
- Biçimler: Markdown (Discord / itch.io) ve Steam BBCode; `Kopyala` panoya yazar, görseller ayrıca "görselleri klasöre
  çıkar" ile verilir. Taslak düzenlenebilir; `Günlüğe kaydet` onu Günlük'e not olarak ekler.
- Boş durum: "Bu hafta kayıt yok. Bir oturum aç ya da commit at, taslak kendiliğinden dolar."

### 6. Varlıklar
Projeye ait görseller, ekran görüntüleri, konsept çizimleri, PDF'ler, ses dosyaları. Izgara; resimde önizleme, seste oynatıcı
(Albüm için önemli: parça demoları dinlenebilir). Varlık bir doküman sayfasına veya göreve bağlanabilir.
Yaratıcı projelerde klasör taramasından gelen ses/görsel dosyaları da burada listelenir (kopyalanmaz, yoldan gösterilir).

**Zaman makinesi** (Varlıklar'ın ilk bölümü; Unity projelerinde): oyunun zaman içindeki görüntüleri.
- Kaynaklar, hepsi otomatik ya da tek hareket:
  1. **Editor betiği** (köprüyle kurulur, 5e): Play moduna girişte, o gün henüz görüntü yoksa, 2 sn sonra Game görünümünü
     `.secondmind/goruntuler/YYYY-MM-DD_HHmm.png` olarak kaydeder (en fazla 1280 px genişlik). Günde bir.
  2. **Görüntü klasörleri:** proje klasöründe zaten görüntü biriken klasörler (Runika: `Captures/`, `Assets/Screenshots/`)
     tarama tarafından önerilir; bağlanırsa yeni `.png/.jpg` dosyaları dosya tarihine göre eklenir.
  3. **Oturum kapanışında yapıştırma:** kapanış modalında Ctrl V ile isteğe bağlı görüntü.
- Görüntüler `media/`'ya kopyalanır (hash'li; klasörden silinse de kalır). Aynı içerik bir kez.
- Galeri: gün gün şerit, en yeni solda; her görüntünün altında tarih ve o günün en çok dosya değiştiren alanı.
  **Karşılaştırma:** iki görüntü seç → yan yana ya da sürgülü üst üste ("1 Ağu ↔ 28 Eyl"). Varsayılan: ilk ve son.
  Yıldızlanan görüntüler devlog taslağına öncelikle girer.
- Boş durum: "Henüz görüntü yok. Köprüyü kur: Play'e her gün ilk girişte bir kare kaydedilir."

## Oturumlar

Oturum, projede geçen kesintisiz çalışma aralığıdır. İki kaynaktan gelir ve tek listede birleşir.

**Elle (Taha):** `Başla` bir oturum açar (başlangıç saati, varsa bağlı görev). Aynı anda tek oturum; başka projede
`Başla` önceki oturumu kapanış modalıyla kapatır. Bugün'ün Şimdi bölümündeki `Başla` da proje görevinde oturum açar,
oturum sürerken orada `Oturumu kapat` görünür.

**Otomatik (Claude Code kayıtları, 5b):** Claude Code her projenin konuşmalarını
`%USERPROFILE%\.claude\projects\<klasör-yolu-kodlanmış>\*.jsonl` altında tutar (Runika: `C--ajanda-Runika`).
Tarama bu dosyalardan **sadece üst veri** okur: satır zaman damgaları, `cwd`, dosya düzenleyen araç çağrılarının
`file_path`'leri. Mesaj içeriği okunmaz, saklanmaz. Kural: aynı `cwd` altındaki olaylar, aralarında 30 dakikadan uzun
boşluk yoksa tek oturumdur; süre ilk ve son olay arası. Değişen dosyalar alan kurallarıyla gruplanır.
Elle açılmış oturumla çakışan otomatik oturum ayrı kayıt olmaz, elle olanı zenginleştirir (dosyalar eklenir).
Jsonl dosyası değiştirme zamanı son taramadan eskiyse atlanır.
Uygulanan ayrıntılar (5b-2): okunan kayıt klasörleri projenin kendisi, üstü ve altı (`C:\ajanda`'dan açılıp Runika'da
çalışılan oturum da sayılır), eşleşme her satırın `cwd`'siyle; yan ajan kayıtları okunmaz. 5 dakikadan kısa aralık
oturum sayılmaz. Dosya sayılan araçlar: `Edit`, `Write`, `MultiEdit`, `NotebookEdit` (Unity MCP'nin `execute_code`
değişiklikleri görünmez; commit'te görünür). Otomatik oturum projenin sıradaki adımını değiştirmez; çöp kutusuna
atılan otomatik oturum sonraki taramada geri gelmez.

**Oturum kapanışı:** `Oturumu kapat` → proje renginde modal: "NEREDE BIRAKTIN?" (isteğe bağlı, çok satır),
"SIRADAKİ İLK SOMUT ADIM NE?" (zorunlu, tek satır; mevcut sıradaki adımla dolu ve seçili gelir, Enter aynen kabul eder).
Altında "Yarın Bugün ekranında ilk bunu göreceksin." Oturum süresi ve bu oturumda park edilenler küçük satırda görünür.
Kaydedince `sessions` kaydı kapanır, projenin sıradaki adımı güncellenir. Ctrl Enter kaydeder, Esc iptal eder (oturum sürer).
Otomatik oturumların kapanış sorusu yoktur; bir sonraki `Başla`'da ya da projeye dönüşte brifing sorar.

## Geri dönüş brifingi

**Ne zaman:** Proje açılınca, projeye son dokunuştan (açma, oturum, commit) bu yana **3 günden** fazla geçmişse Kokpit'in
en üstünde bant olarak. `Tamam` ya da `Başla` kapatır; o açılışta bir daha çıkmaz.
**Ne gösterir** (her satır bir soru, veri yoksa satır yok):
- Son oturum: "4 gün önce, 1 sa 35 dk. Nerede bıraktın: Boss fazı 2 müziği yarım."
- Son commit'ler: son açılıştan bu yana en fazla 5 mesaj + değişen alanlar ("Kod 12 dosya, Ses 3").
- Çalışılan dosyalar: son 2 oturumda ve commit'lerde en çok değişen 5 dosya.
- Commit'lenmemiş değişiklikler: `git status` ile "4 dosya commit'lenmemiş, en eskisi 6 gün önce" (mercan: 3 günden eski).
- Sıradaki adım: motorun 1. adımı, gerekçesiyle.
- Aradaki gelişmeler: bu sürede gelen playtest yapıştırmaları, park öğeleri, yaklaşan taş ("Demo'ya 12 gün").
**Veri:** `sessions`, `commits`, tarama anındaki `git status`, `parking`, `playtest_feedback`, `milestones`. Tamamen algoritmik.
**Boş durum:** Hiç veri yoksa bant çıkmaz.

## Park alanı ("Sonra")

Çalışırken gelen fikri odak bozulmadan projenin "Sonra" listesine atmak.
- **Küresel kısayol Ctrl Alt P** (sadece uygulama açıkken; Electron `globalShortcut`, arka plan süreci değil): Unity ya da
  editör öndeyken bile küçük, kenarlıksız, her zaman üstte tek satırlık bir pencere açılır. Proje = süren oturumun projesi,
  yoksa son açılan; Tab projeyi değiştirir. Enter kaydeder ve pencere kaybolur, odak önceki uygulamaya döner. Esc vazgeçer.
- Uygulama içinde: P (şerit/Kokpit), komut paletinde "Park et", Hızlı Döküm'de `#runika sonra` önekiyle.
- Öğe: metin, proje, zaman, kaynak (kısayol / uygulama / köprü), durum (bekliyor / göreve çevrildi / atıldı).
- Nerede görünür: Kokpit "Sonra" karosu, şeritte "Sonra: 4", taş planlarken yan sütun, kanbanda Yapılacak'ın üstünde katlı satır.
  Oturum kapanışında o oturumda park edilenler listelenir.
- Göreve çevirme görev oluşturur (kaynak "park", metin başlık olur) ve öğeyi "göreve çevrildi" yapar; atma yumuşak siler.
- Sıradaki adım motoru bekleyen park öğesi 10'u geçerse "Park alanını gözden geçir" adımını önerir.
- Boş durum: karo gizli. Park listesinin kendi görünümünde: "Aklına gelen her şeyi Ctrl Alt P ile buraya at, akışını bozma."

## Sıradaki adım motoru

`domain/nextSteps.ts`, saf fonksiyon, Vitest testli. `rankNextSteps(input, now) → Step[]` (ilk 3 gösterilir).
Kullananlar: Kokpit vurgulu karo, şeritteki sıradaki adım, Bugün'ün Şimdi bölümü (proje görevleri arasında), `BAGLAM.md`.

**Adaylar:** projenin açık görevleri (tüm türler), bağlı görevi olmayan işaretlenmemiş çıkış kriterleri (aktif taşın),
son oturumun sıradaki adımı (serbest metin; bir göreve eşleşirse o görevle birleşir), "park alanını gözden geçir"
(bekleyen > 10), "commit'lenmemiş değişiklikleri commit'le" (3 günden eski değişiklik varsa).

**Puan** (toplanır; her terim bir gerekçe cümlesi üretir):
| Girdi | Puan | Gerekçe |
| --- | --- | --- |
| Son oturumun sıradaki adımı | +35 | "son oturumda buradan devam edecektin" |
| Hata, kritik / önemli / küçük | +50 / +20 / +5 | "kritik hata" |
| Playtest: bildiren kişi sayısı k | +min(8·k, 40) | "3 test eden bildirdi" |
| Aktif taşın çıkış kriteri ya da ona bağlı | +20 | "Demo taşının çıkış kriteri" |
| Aktif taşa bağlı ve taşa g gün kaldı (g ≤ 21) | +(21 − g) | "12 gün kaldı" |
| Kanbanda Yapılıyor | +15 | "yarım duruyor" |
| Öncelik yüksek / düşük | +10 / −5 | "yüksek öncelik" |
| Erteleme ≥ 3 | −10 ve "Böl" işareti | "3 kez ertelendi, bölmeyi düşün" |
| Test kolonunda | +8 | "test bekliyor" |
Aktif taş = tamamlanmamış, hedef tarihi en yakın taş. Eşitlikte `domain/tasks.compareTasks` sırası.
Gerekçe: puana en çok katkı veren en fazla 3 terim, çoktan aza, " · " ile.
**Boş durum:** "Sırada bir şey yok. Bir görev ekle ya da oturumu kapatırken sıradaki adımı yaz."

## Playtest kutusu

Test edenlerin mesajlarını yapıştır, SecondMind benzerleri gruplayıp sayar. Kokpit'te karo, kanbanın yanında `Playtest` görünümü.
- **Giriş (tek hareket):** `+ Yapıştır` (Ctrl Shift V proje içinde): metin alanı + "Kim" (önceki adlardan otomatik tamamlama)
  + tarih (bugün). Discord/WhatsApp kopyasındaki "[12:03] Ali: ..." satırlarından kişi ve tarih kendiliğinden çıkarılır.
- **Bölme:** metin satır, madde işareti ve cümle sonlarından **noktalara** bölünür; 3 kelimeden kısa parçalar öncekine eklenir.
- **Benzerlik (algoritmik, `domain/playtest.ts`, testli):** küçük harf (`tr-TR`), noktalama ve Türkçe dolgu kelimeleri
  (ve, ama, çok, bir, bu, şu, da, de, ki, gibi, sonra...) atılır, her kelimenin ilk 5 harfi kök sayılır. İki nokta benzer:
  kök kümelerinin Jaccard'ı ≥ 0,34 ya da en az 2 ortak "içerik kökü" (proje sözlüğünde, yani görev başlıklarında ve
  GDD'de geçen kelimeler). Kümeleme tek bağlantılı, yeni nokta en benzer kümeye girer. Taha bir noktayı sürükleyip başka
  kümeye taşıyabilir ya da ayırabilir; elle yerleşim kilitlenir, algoritma bir daha dokunmaz.
- **Sayı:** "5 kişiden 3'ü" — payda: son 30 gündeki farklı test eden sayısı; pay: kümede farklı kişi sayısı.
- **Tek tık:** küme → hata (varsayılan) ya da görev; başlık kümenin en kısa noktası, açıklamaya bütün alıntılar ve kişiler.
  Göreve bağlı kümeye gelen yeni nokta görevin playtest sayısını artırır (motor bunu kullanır).
- **Boş durum:** "Test edenlerin mesajlarını olduğu gibi yapıştır. Benzer olanları SecondMind gruplar ve sayar."

## Tarama (algoritmik, AI yok)

`project_folders`: bir projeye bir veya birden fazla klasör. Tarama sırasında:

**Git (varsa):** son taramadan beri gelen commit'ler (hash, mesaj, tarih, dosya bazında ekleme/silme). `commits` tablosuna.
Dosyalar **alan kurallarıyla** gruplanır; kurallar proje ayarında düzenlenebilir glob listesidir.
**Commit'lenmemiş değişiklikler:** `git status --porcelain` → dosya listesi, alanlara göre sayım, her dosyanın mtime'ı
(en eski değişiklik yaşı). Tarama anlık görüntüsüne yazılır; brifing ve motor kullanır.

**Unity varsayılan alan kuralları:**

| Alan | Glob |
| --- | --- |
| Kod | `Assets/**/*.cs` |
| Sahneler | `Assets/**/*.unity` |
| Prefab | `Assets/**/*.prefab` |
| Ses | `Assets/**/{Audio,Sound,Sounds,Music,SFX}/**` ve `*.{wav,mp3,ogg}` |
| Görsel | `Assets/**/*.{png,psd,jpg,aseprite}`, `Assets/**/{Art,Sprites,Textures,Models}/**` |
| Animasyon | `Assets/**/*.{anim,controller}` |
| Veri | `Assets/**/*.asset` |
| Doküman | `**/*.md` |
| Ayarlar | `ProjectSettings/**`, `Packages/manifest.json` |

Her zaman yok sayılır: `Library/`, `Temp/`, `Logs/`, `obj/`, `Build/`, `Builds/`, `UserSettings/`, `*.meta`, `.git/`, `_Recovery/`.

**Unity tanıma:** `ProjectSettings/ProjectVersion.txt` varsa tür Unity; editör sürümü okunur. Sahne listesi `.unity` dosya adlarından,
yapıdaki sahne sırası `ProjectSettings/EditorBuildSettings.asset`'ten (YAML, basit ayrıştırma).
Script sayısı ve kabaca satır sayısı hesaplanır. GDD karşılaştırması için sayımlar (yukarıda) anlık görüntüye yazılır.

**Koddaki notlar:** `.cs` (Unity) veya kaynak dosyalarda `TODO`, `FIXME`, `HACK` satırları dosya:satır ile `code_todos`'a.
Önceki taramayla karşılaştırılır: yeniler "eklendi", kaybolanlar "çözüldü" olarak işaretlenir. Taha isterse bir TODO'yu tek tıkla göreve çevirir.

**Git'siz klasör (yaratıcı):** dosya envanteri (yol, boyut, mtime). Önceki anlık görüntüyle fark: yeni / değişen / silinen.
Hash sadece mtime veya boyut değişince hesaplanır.

**Claude Code oturumları** ve **görüntü klasörleri:** yukarıdaki Oturumlar ve Zaman makinesi bölümlerinde.

**Sessizlik:** son commit, oturum veya dosya değişikliğinden bu yana gün sayısı. Radar 14 günde uyarır.

Tarama sonucu: kısa bir toast ("Runika'da 4 yeni commit, SecondMind'da 1 değişiklik") ve Günlük'e commit grupları.
Tarama proje klasörlerine **asla yazmaz** (köprü dosyaları hariç, onlar da sadece `.secondmind/` altında ve kurulum onayıyla).

## Claude Code köprüsü

Taha projelerinde (özellikle Unity/Runika) Claude Code ile çalışıyor. Köprü, SecondMind ile o oturumlar arasında **dosya üzerinden**
iki yönlü bilgi akışı sağlar. AI çağrısı gerektirmez; SecondMind tarafı tamamen algoritmiktir.

Projenin kök klasöründe:

```
<proje>/.secondmind/
  BAGLAM.md            SecondMind yazar, Claude Code okur
  oturumlar/           Claude Code yazar, SecondMind okur
    2026-09-27-1430.md
  goruntuler/          Editor betiği yazar (zaman makinesi), SecondMind okur
Assets/Editor/SecondMindSnapshot.cs   Editor betiği (Unity projelerinde, kurulum onayıyla)
```

**`BAGLAM.md` (SecondMind → Claude Code):** Her Güncelle'de ve `Başla`'ya basınca yeniden üretilir. İçerik:
sıradaki adım motorunun ilk 3 adımı gerekçeleriyle, aktif kilometre taşı ve çıkış kriterleri, "Yapılıyor" ve en öncelikli
10 "Yapılacak" görev (id'leriyle), açık kritik hatalar ve playtest sayıları, son 5 karar (ADR başlıkları + tek cümle),
son oturumun "nerede bıraktın" notu, commit'lenmemiş dosya sayısı,
ve Taha'nın "Claude Code'a açık" işaretlediği doküman sayfalarının yolları (tam metin değil; ajan gerekirse
`.secondmind/dokumanlar/` altına dışa verilmiş markdown'ı okur).
En fazla ~1.500 token.

**Oturum raporu (Claude Code → SecondMind):** Claude Code oturum sonunda şu biçimde bir dosya yazar:

```markdown
---
tarih: 2026-09-27T14:30
sure_dk: 95
tamamlanan_gorevler: [01J8...]
sonraki_adim: "Boss fazı 2 müziğini hızlandır"
---
## Yapılanlar
- Menü sahnesinde ses geçişleri eklendi
## Yeni görev önerileri
- [ ] Ses ayarlarına müzik/efekt ayrı kaydırıcı ekle
## Sonra
- Pause menüsüne ses önizlemesi olabilir
## Açık sorunlar
- Pause menüsünde müzik tekrar baştan başlıyor
## Kararlar
- Müzik geçişleri için AudioMixer snapshot kullanılacak
```

Güncelle bu dosyaları okur (frontmatter + başlıklara göre basit ayrıştırma, AI yok) ve:
- Günlük'e "Claude Code oturumu" öğesi ekler ve eşleşen otomatik oturumu raporla zenginleştirir (algoritmik, Aşama 4'e bağlı değil),
- `tamamlanan_gorevler`, `sonraki_adim`, yeni görev önerileri, "Sonra" maddeleri (park öğesi olarak), açık sorunlar
  (hata görevi olarak) ve kararları (ADR olarak) **Onay Kutusu'na öneri** olarak koyar. Doğrudan yazmaz.
  **Bu kısım Aşama 4'e (Onay Kutusu) bağlıdır**; o zamana kadar rapor Günlük'te okunur, maddeler elle `Göreve çevir` / `Park et` ile alınır.
İşlenen rapor dosyası `oturumlar/islendi/` altına taşınır.

**Editor betiği (zaman makinesi):** `resources/proje-koprusu/SecondMindSnapshot.cs`. `[InitializeOnLoad]`,
`EditorApplication.playModeStateChanged` → `EnteredPlayMode`'da o gün `goruntuler/` içinde dosya yoksa 2 sn bekleyip
`ScreenCapture.CaptureScreenshotAsTexture` ile Game görünümünü alır, küçültüp PNG yazar. Hata olursa sessizce geçer;
oyunun kendisine (Runtime) hiçbir şey eklemez, sadece `Assets/Editor/` altındadır ve yapıya girmez.

**Kurulum:** Proje ayarlarında `Köprüyü kur` butonu: `.secondmind/` klasörünü oluşturur, `resources/proje-koprusu/CLAUDE-ek.md`
içeriğini gösterir ve Taha'nın onayıyla projenin kendi `CLAUDE.md`'sinin sonuna ekler (dosya yoksa oluşturur).
Unity projesinde Editor betiğini de gösterir ve onayla `Assets/Editor/`'a kopyalar.
`.gitignore`'a `.secondmind/` eklemek isteyip istemediği sorulur. `Köprüyü kaldır` eklenenleri geri alır.

İleride (bu aşamada değil): aynı işlevi bir MCP sunucusu olarak sunmak.

## Veri tabloları

Ayrıntılı kolonlar `docs/MIMARI.md` > Projeler.

- `projects`: ad, tür, renk, durum, sıradaki adım, açıklama, sayım kuralları, yayın platformu, son açılma, arşivlenme.
- `project_folders`: proje, yol, alan kuralları (JSON), görüntü klasörleri, köprü aktif mi, son tarama.
- `sessions`: proje, görev, başlangıç, bitiş, nerede bıraktın, sıradaki adım, kaynak (Taha / Claude Code), dış id, dosyalar.
- `parking`: proje, metin, kaynak, durum, görev, çözülme.
- `milestones`: proje, ad, hedef tarih, sıra, çıkış kriterleri (JSON), tamamlanma.
- `tasks` (ortak tablo) ekleri: `kanban_status`, `severity`, `repro_steps`, `milestone_set_at`, `source`, `source_id`.
- `playtest_feedback` (yapıştırma), `playtest_points` (nokta + küme), `playtest_clusters` (küme + görev).
- `project_docs`: proje, üst sayfa, sıra, başlık, `body_md` ya da bağlı dosya yolu, tür (sayfa / ADR / GDD), Claude Code'a açık mı.
- `commits`, `code_todos`, `scan_snapshots` (özet JSON: alanlar, commit'lenmemişler, sayımlar, sahneler).
- `project_shots`: zaman makinesi görüntüleri (media id, gün, kaynak, yıldız).
- `project_log_notes`: Günlük'teki serbest notlar ve kaydedilmiş devlog taslakları.
- `assets`: proje, media id veya dış yol, tür, bağlı doküman/görev.
