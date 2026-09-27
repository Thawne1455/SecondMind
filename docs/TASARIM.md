# Tasarım sistemi

Kaynak: Claude Design çıktısı, "Poster" yönü (v0.2). Görseller `design/referans/` altında:
`tasarim-sistemi.png`, `bugun-acik.png`, `bugun-koyu.png`, `hizli-dokum-modal.png`.
Ölçüler ve renkler bu dokümandaki değerlerle birebir uygulanır.

## İlke

Beyaz zemin, siyah akış bandı, büyük ve geniş başlıklar, düz renkli karolar.
Her karo tek bir soruya cevap verir; rengi o sorunun alanını söyler.
Gölge yok, derinliği renk ve boyut verir. Yapı sade, içerik renkli.

## Renk token'ları

`src/renderer/styles/tokens.css` olarak kurulur:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --bg: #FFFFFF; --s2: #F4F4F7; --s3: #EAEAF0; --line: #E3E3EA;
  --ink: #131316; --ink2: #4A4A55; --ink3: #5F5F6B;
  --band: #131316; --on-ink: #FFFFFF; --hover: rgba(19,19,22,.06);
  --indigo: #3D3DF5; --t-coral: #C4321F;
}
.dark {
  --bg: #0F0F13; --s2: #1A1A21; --s3: #24242D; --line: #2A2A33;
  --ink: #F2F2F5; --ink2: #B5B5C2; --ink3: #9C9CAA;
  --band: #1D1D25; --on-ink: #0F0F13; --hover: rgba(255,255,255,.07);
  --indigo: #5454FF; --t-coral: #FF8A7A;
}

@theme inline {
  --color-bg: var(--bg); --color-s2: var(--s2); --color-s3: var(--s3); --color-line: var(--line);
  --color-ink: var(--ink); --color-ink2: var(--ink2); --color-ink3: var(--ink3);
  --color-band: var(--band); --color-on-ink: var(--on-ink); --color-hover: var(--hover);
  --color-indigo: var(--indigo); --color-t-coral: var(--t-coral);

  /* Dolgu renkleri iki temada da aynı */
  --color-amber: #FFB21E; --color-green: #3BE08F; --color-sky: #7CC4FF;
  --color-lilac: #DAD5FF; --color-lilac2: #BDB3FF; --color-teal: #5FE3D0;
  --color-coral: #D93A26; --color-orange: #FF8A3D; --color-pink: #F59BE6;
  --color-fill-ink: #131316;

  /* Isı haritası (yeşil ölçek) */
  --color-hm0: var(--s3); --color-hm1: #CFF7E2; --color-hm2: #96ECC0; --color-hm3: #3BE08F; --color-hm4: #138A52;

  --font-sans: "Archivo", system-ui, sans-serif;
  --radius-modal: 32px; --radius-tile: 28px; --radius-field: 14px; --radius-block: 14px;
}
```

Alan renkleri:

| Alan | Dolgu | Üstündeki metin |
| --- | --- | --- |
| Bugün | indigo `#3D3DF5` | beyaz |
| Döküm | amber `#FFB21E` | `#131316` |
| Projeler | yeşil `#3BE08F` | `#131316` |
| Okul | gök `#7CC4FF` | `#131316` |
| Zihin | leylak `#DAD5FF`, koyu ton `#BDB3FF` | `#131316` |
| Bilgi | turkuaz `#5FE3D0` | `#131316` |
| Uyarı | mercan `#D93A26` | beyaz |

Dolgulu yüzeylerin üstündeki metin her iki temada da `#131316`'dır (mercan ve indigo hariç: beyaz).
Proje renkleri projeye atanır: Runika yeşil, SecondMind turuncu `#FF8A3D`, Albüm pembe `#F59BE6`.
Okul'daki her ders gök mavisinin farklı bir tonunu alır (ders detayında hesaplanır, tek renk paletten).

## Tipografi

Font: **Archivo** variable (ağırlık 400–900, genişlik `wdth` 62–125). Dosyalar `src/renderer/public/fonts/` altında
(`archivo-latin.woff2`, `archivo-latin-ext.woff2`; latin-ext Türkçe karakterleri kapsar). OFL lisanslı.

```css
@font-face { font-family: "Archivo"; font-weight: 400 900; font-stretch: 62% 125%; font-display: swap;
  src: url("/fonts/archivo-latin.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Archivo"; font-weight: 400 900; font-stretch: 62% 125%; font-display: swap;
  src: url("/fonts/archivo-latin-ext.woff2") format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
```

Gövde: 15px, satır aralığı 1.5, `-webkit-font-smoothing: antialiased`.

| Rol | Boyut / ağırlık | Özellik | Örnek |
| --- | --- | --- | --- |
| Poster | 64 / 900 | wdth 125, büyük harf, line-height .95 | MENÜ MÜZİĞİNİ 1:20'YE KIRP |
| Büyük sayı | 56 / 900 | wdth 125, tabular | 12 · 16 · 1:20 |
| Sayfa başlığı | 28 / 900 | wdth 125, büyük harf | PAZAR 27 EYLÜL |
| Karo başlığı | 20 / 800 (soru karosunda 18) | normal genişlik | Ders notlarından bilgi kartı çıkaran mod |
| Etiket | 13 / 800 | wdth 125, büyük harf, letter-spacing .04em | KULUÇKA · 14 GÜN DOLDU |
| Gövde | 15 / 400 | | Aklındakini dök... |
| Gövde vurgu | 15 / 700 | | Erdem'in doğum günü — mesaj at |
| İkincil | 13 / 600 | renk ink3, **en küçük boyut budur** | Son tarama 2 saat önce |

Yardımcı sınıflar (tasarımdaki adlarıyla):
`.x` = wdth 125 + tabular + letter-spacing -0.01em; `.cx` = etiket stili.
Tailwind'de `font-stretch` için `@utility wide { font-stretch: 125%; }` tanımla.
Sayılar, saatler ve tarihler her yerde tabular.
Büyük harfe çevirmede `toLocaleUpperCase('tr-TR')` (CSS `text-transform: uppercase` ile `lang="tr"` birlikte; `<html lang="tr">` şart, yoksa "i" → "I" olur).

## Şekil, boşluk, derinlik

- Köşe: modal 32, karo ve bant 28, input ve akış bloğu 14, buton ve etiket tam yuvarlak (pill).
- Boşluk ölçeği: 6, 10, 16, 20, 32, 64.
- Karo ve bantta gölge ve kenarlık yok. Hover'da karo 2px yükselir (`translateY(-2px)`, .18s).
- Gölge yalnızca modal ve açılır menüde.
- Bölüm başlığı: 28/900 geniş büyük harf başlık + yanında açıklama, altında 3px `ink` çizgi.

## Uygulama iskeleti

- **Kenar çubuğu:** 80px, zemin `s2`. Üstte 48px indigo "S" logosu (köşe 16). Sonra ikon bağlantıları:
  Bugün (güneş), Döküm (inbox, amber sayı rozeti), Onay Kutusu (list-checks, indigo sayı rozeti),
  Projeler (folder), Okul (graduation-cap), Zihin (smile), Bilgi (book-open). Ayırıcı çizgi.
  Altında aktif projelerin 14px renkli kareleri (en fazla 5). En altta tema değiştirici, Ayarlar, avatar.
  Aktif öğe: dolgulu `ink` kare, ikon `on-ink`. Her ikonun `aria-label`'ı var.
- **Üst çubuk:** Solda sayfa başlığı (28/900 geniş), yanında durum rozeti (örn. mercan "2 hatırlatma kaçtı" + "Bugüne al").
  Sağda: arama kutusu ("Ara veya komut yaz… CTRL K"), `Güncelle` (ikincil, yanında "2 sa önce"),
  `AI ile İşle` (amber, sayı rozeti), `+ Döküm` (birincil).
- İçerik tam genişlik, 1440×900 hedef, en küçük pencere 1100×700.

## Bileşenler

**Butonlar** (hepsi pill, yükseklik 42, küçük 34, font 15/700; basılıyken `scale(.96)`; yüklenirken genişliğini korur ve spinner + metin gösterir):

| Tür | Görünüm | Kullanım |
| --- | --- | --- |
| Birincil | `ink` dolgu, `on-ink` metin | Döküme at, Kapat ve kaydet |
| Eylem | indigo dolgu, beyaz | Başla |
| İkincil | `s2` dolgu | Güncelle, Oturumu kapat |
| AI | amber dolgu | AI ile İşle |
| Tehlike | mercan dolgu, beyaz | Klasörü kaldır |
| Karo üstünde | karo renginin üstünde: siyah dolgu veya yarı saydam koyu | Projeye çevir / Arşivle, Aç / Arşivle |

Focus: `outline: 3px solid var(--indigo); outline-offset: 2px`. Devre dışı: opaklık .38.

**Karolar** (dört tür; içinde tek soru, en fazla iki eylem):
1. *Vurgulu*: beyaz zemin, 3px `ink` kenar (tek istisna), poster başlık + Başla/Oturumu kapat. Sıradaki ilk adım için.
2. *Standart*: `s2` zemin. Hatırlatmalar gibi listeler.
3. *Uyarı*: mercan dolgu, büyük sayı + "GÜN SESSİZ". Radar için.
4. *Soru*: alan renginde dolgu, soru + iki buton. Kuluçka ve karar için.

**Etiket ve rozet:** Alan etiketleri pill, alan renginde. İşlem türü etiketleri `s2` pill (+ Yeni görev, Not güncelleme, Hatırlatma, Proje durumu).
Sayı rozetleri 20px daire. Durum rozetleri geniş büyük harf: AKTİF (yeşil), KULUÇKADA · 5 GÜN (turkuaz), GECİKTİ (mercan), ARŞİV (s3).
Filtre chip'leri: seçili olan `ink` dolgu.

**Form:** Dolgulu alan (`s2`, yükseklik 46, köşe 14, kenarlık 2px şeffaf); odakta 2px `ink` kenar ve `bg` zemin.
Etiket 13/800 geniş büyük harf. Ölçek seçici (1–5): `s3` segmentler, seçili `ink`. Dosya bırakma alanı kesikli kenar;
sürüklenirken amber dolgu ve "BIRAK · 2 DOSYA".

**Akış bandı:** `band` zemin, köşe 28, 08–24 tek satır. Üst şerit hatırlatma pinleri (amber pill, saat siyah kutuda),
alt şerit bloklar. Blok türleri: Ders (gök, sabit, sürüklenemez), Sınav bloğu (gök çapraz çizgili desen), Görev (proje renginde,
sürüklenebilir; şu anki blok 2px beyaz kenarlı), Boş (kesikli kenar, "boş · 2 sa"), Rutin (kısa gri blok, etiket dışarıda).
Geçmiş bloklar %72 opaklık. "Şimdi" çizgisi mercan, altında saat etiketi. Sağ altta "4 sa 20 dk boş" + "Yeniden yerleştir".
Hover'da blok tam başlığı ve saatini ipucu olarak gösterir. Okul'daki haftalık program aynı bloğu **dikey** kullanır.

**Grafik:** Kalın çizgi, tam yuvarlak çubuk uçları, dolgu renkleri, eksen neredeyse yok, `s2` karo içinde.
Türler: çizgi (ruh hâli/enerji, dikey kesikli işaret çizgisi, siyah ipucu kutusu), çubuk (son çubuk koyu ton, üstte toplam),
ısı haritası (gün × saat, hm0–hm4), dağılım (indigo noktalar + kesikli eğilim çizgisi).

**Fark (diff):** Karo içinde; başlıkta alan etiketi + not adı + "+2 −1". Silinen satır açık mercan zemin ve üstü çizili,
eklenen açık yeşil zemin. Altta kaynak ("Döküm'den · bugün 10:12") ve Reddet / Düzenle / Onayla.

**Bildirim (toast):** `band` zemin (başlık alan renginde küçük etiket) veya alan rengi dolgu; sağda tek eylem (Gör / Aç).

**Açılır menü:** Beyaz, gölgeli, köşe 20; seçili öğe amber dolgu (örn. model seçimi: HIZLI / DERİN).

**Modal:** Köşe 32, üst şerit alanın renginde ve başlık geniş büyük harf, sağda kapat. Altta `s2` şerit: sol klavye ipuçları, sağ butonlar.
Örnekler: Hızlı Döküm (amber), Runika Oturumunu Kapat (proje rengi).

**Komut paleti:** Ctrl K. Gruplar: PROJELER, KOMUTLAR, NOTLAR. Eşleşen metin amber vurgulu, seçili satır `ink` dolgu + ENTER.

**Durumlar:** Boş = tek cümle + tek eylem ("Henüz proje yok. Bir klasör bağla, SecondMind takibe başlasın." + "+ Klasör bağla").
Yükleniyor = iskelet (shimmer), spinner değil. Hata = ne oldu + "Tekrar dene"
("Tarama olmadı. D:\Oyunlar\Runika bulunamadı. Klasör taşındıysa Ayarlar'dan yeniden bağla.").

## Hareket

Geçişler 150–200ms. Basma `scale(.96)`. Karo hover 2px. Onay ve tamamlamada küçük tik animasyonu. Abartı yok.

## Çizilmemiş ekranlar için kurallar

1. Önce ekranın tek sorusunu yaz (bkz. CLAUDE.md tablosu). Ekrandaki her karo bu soruya hizmet eder.
2. Paneller kendi düzenine sahip: Projeler'i Okul'dan, Okul'u Bilgi'den ayırt edemiyorsan tasarım yanlıştır.
3. Poster başlık (64/900) ekran başına en fazla bir kez, en önemli tek bilgi için.
4. Renk alanı söyler: bir panelin ana vurgusu kendi alan rengidir; mercan sadece uyarı içindir.
5. Düzen planını 5–10 satırla yaz, Taha onaylamadan kodlama.
