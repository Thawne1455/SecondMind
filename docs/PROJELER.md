# Projeler paneli

**Soru:** Nerede kaldım, sırada ne var, proje nereye gidiyor?
**Ruh:** Bir atölye. Açık uçlu, hedefe doğru ilerleyen işler. Projenin hafızası burada tutulur:
tasarım dokümanı, kararlar, oturumlar, görevler, yol haritası, varlıklar.
Okul'dan farkı: dönemi, notu, haftası yoktur; kilometre taşı, kanban ve dokümantasyon ağacı vardır.

Örnek projeler: **Runika** (Unity oyunu, Steam'e çıkacak, yeşil), **Albüm** (müzik, git yok, pembe), **SecondMind** (bu uygulama, turuncu).

## Proje türleri

Proje oluştururken tür seçilir. Tür; tarayıcıyı, doküman şablonunu ve görev türlerini belirler.

| Tür | Tarayıcı | Doküman şablonu | Ek |
| --- | --- | --- | --- |
| Unity oyunu | git + Unity | GDD | Hata görevleri, sahne listesi, koddaki TODO'lar |
| Yazılım | git + kod | Teknik doküman | Koddaki TODO'lar |
| Yaratıcı (müzik, görsel, yazı) | dosya envanteri | Yaratıcı proje | Ses/görsel varlık oynatıcı |
| Genel | yok | Boş | — |

## Liste ekranı: proje şeritleri

Kart ızgarası **değil**. Her aktif proje tam genişlikte yatay bir şerittir (köşe 28, zemin `s2`).
Proje rengi soldaki büyük harf adın arkasındaki blokta ve ilerleme çubuğunda görünür. Şeritte soldan sağa:

1. Proje adı (sayfa başlığı stili) + tür + durum rozeti (AKTİF / DURAKLADI / ARŞİV).
2. **Sıradaki ilk adım** (karo başlığı stili) + `Başla` butonu.
3. **Sonraki kilometre taşı**: ad, hedef tarih, "12 gün kaldı", görevlerden hesaplanan ilerleme çubuğu.
4. Son 8 haftanın aktivite çubukları (commit + oturum dakikası).
5. Sessizlik: "3 gün önce". 14 günü geçtiyse şerit mercan "16 GÜN SESSİZ" rozeti alır.

Üstte: `+ Proje`, filtre chip'leri (Aktif / Duraklatılmış / Arşiv). Altta arşivlenmiş projeler katlanmış.
Boş durum: "Henüz proje yok. Bir klasör bağla, SecondMind takibe başlasın." + `+ Klasör bağla`.

## Proje detayı

Üstte **proje başlığı bandı** (proje renginde dolgu, köşe 28): büyük harf ad, tür, bağlı klasör yolu (kopyalanabilir),
son tarama zamanı, sağda `Tara`, `Oturumu kapat`, `Klasörde aç`.

Altında sekmeler. Her sekme projenin farklı bir hafızası:

### 1. Kokpit
Projeyi açınca ilk görülen yer. Karo düzeni, her karo tek soru:
- **Vurgulu karo:** Sıradaki ilk adım (poster başlık) + Başla / Oturumu kapat.
- **Son oturum:** tarih, süre, "nerede bıraktın" notu, varsa Claude Code oturum raporundan özet.
- **Kilometre taşı:** sonraki taş, kalan gün, ilerleme; gecikiyorsa mercan.
- **Bu hafta:** commit sayısı, değişen alanlar (Kod 12 dosya, Ses 3 dosya, Sahneler 1), çalışılan dakika.
- **Koddaki notlar** (Unity/Yazılım): TODO/FIXME sayısı, son taramadan beri eklenen/çözülen.
- **Açık hatalar** (Unity): önem derecesine göre sayı.
- **Aktivite ısı haritası:** son 12 hafta, gün bazında.

### 2. Görevler (kanban)
Kolonlar: **Yapılacak · Yapılıyor · Test · Bitti**. Kartlar sürüklenir.
Kart: başlık, tür ikonu (görev / hata / araştırma), kilometre taşı etiketi, tahmini süre, erteleme sayacı (≥3 ise mercan rozet ve
"Böl · Sil · Bugün yap" önerisi), kaynak (Taha / AI / TODO taraması / Claude Code oturumu).
Üstte kilometre taşına ve türe göre filtre. Hata türünde önem (kritik / önemli / küçük) ve "nasıl tekrarlanır" alanı.
"Bugüne al" görevi Bugün'ün akış bandında boş bir yere yerleştirir.

### 3. Yol haritası
Kilometre taşları yatay zaman çizelgesinde (akış bandı dilinin haftalık/aylık hali): her taş bir blok, hedef tarih pini, bugün çizgisi.
Taş: ad, hedef tarih, açıklama, bağlı görevler, **çıkış kriterleri** (onay kutulu liste).
Unity oyunu şablonu hazır taşlarla gelir (düzenlenebilir): Oynanabilir prototip → Dikey kesit → Steam sayfası → Demo → Beta → Çıkış.
"Steam sayfası" taşının hazır kontrol listesi: kapsül görseller, açıklama, ekran görüntüleri, fragman, etiketler, fiyat, çıkış tarihi.
Ayrıca **proje takvimi**: projeye ait tarihli her şey (taş hedefleri, son tarihli görevler, planlanmış çalışma blokları) ay görünümünde.

### 4. Dokümantasyon
Projenin yaşayan tasarım dokümanı. Solda sayfa **ağacı** (iç içe, sürüklenerek sıralanır), sağda TipTap editör (markdown, resim yapıştırma, tablo, kod bloğu).
Tür şablonları:
- **GDD (Unity oyunu):** Oyun özeti · Temel döngü · Mekanikler (alt sayfa her mekanik) · Bölümler / Sahneler · Karakterler ·
  Sanat yönü · Ses listesi (tablo: parça, sahne, süre, döngü, durum) · Arayüz ve menüler · Kontroller · Teknik notlar · Yayın.
- **Teknik doküman (yazılım):** Genel bakış · Mimari · Kurulum · Veri modeli · Kararlar.
- **Yaratıcı proje:** Konsept / niyet · Parça listesi · Sözler / metinler · Prodüksiyon notları · Görsel kimlik.
**Kararlar (ADR)** ayrı bir sayfa türüdür: başlık, tarih, bağlam, karar, alternatifler, sonuç. Projenin teknik ve tasarım kararları buradadır
(Zihin'deki karar günlüğü kişisel kararlar içindir, karıştırma).
Dokümantasyon sayfaları FTS aramasına girer ve Claude Code köprüsüyle dışarı verilebilir (aşağıda).

### 5. Günlük (devlog)
Projenin zaman çizelgesi, en yeni üstte, gün gün gruplu. Öğe türleri kendi ikon ve rengiyle:
commit grubu (mesajlar + değişen alanlar), oturum kapanışı ("nerede bıraktın" + sıradaki adım), Claude Code oturum raporu,
tamamlanan görev, kilometre taşı olayı, Taha'nın serbest günlük notu (`+ Not`).
Filtre: hepsi / commit'ler / oturumlar / notlar.

### 6. Varlıklar
Projeye ait görseller, ekran görüntüleri, konsept çizimleri, PDF'ler, ses dosyaları. Izgara; resimde önizleme, seste oynatıcı
(Albüm için önemli: parça demoları dinlenebilir). Varlık bir doküman sayfasına veya göreve bağlanabilir.
Yaratıcı projelerde klasör taramasından gelen ses/görsel dosyaları da burada listelenir (kopyalanmaz, yoldan gösterilir).

## Oturum kapanışı

`Oturumu kapat` → proje renginde modal: "NEREDE BIRAKTIN?" (isteğe bağlı, çok satır), "SIRADAKİ İLK SOMUT ADIM NE?" (zorunlu, tek satır).
Altında "Yarın Bugün ekranında ilk bunu göreceksin." Kaydedince `sessions` kaydı oluşur, projenin sıradaki adımı güncellenir.
`Başla` bir oturumu başlatır (başlangıç saati); kapanışta süre hesaplanır.

## Tarama (algoritmik, AI yok)

`project_folders`: bir projeye bir veya birden fazla klasör. Tarama sırasında:

**Git (varsa):** son taramadan beri gelen commit'ler (hash, mesaj, tarih, dosya bazında ekleme/silme). `commits` tablosuna.
Dosyalar **alan kurallarıyla** gruplanır; kurallar proje ayarında düzenlenebilir glob listesidir.

**Unity varsayılan alan kuralları:**

| Alan | Glob |
| --- | --- |
| Kod | `Assets/**/*.cs` |
| Sahneler | `Assets/**/*.unity` |
| Prefab | `Assets/**/*.prefab` |
| Ses | `Assets/**/{Audio,Sound,Sounds,Music,SFX}/**` ve `*.{wav,mp3,ogg}` |
| Görsel | `Assets/**/*.{png,psd,jpg,aseprite}`, `Assets/**/{Art,Sprites,Textures,Models}/**` |
| Animasyon | `Assets/**/*.{anim,controller}` |
| Ayarlar | `ProjectSettings/**`, `Packages/manifest.json` |

Her zaman yok sayılır: `Library/`, `Temp/`, `Logs/`, `obj/`, `Build/`, `Builds/`, `UserSettings/`, `*.meta`, `.git/`.

**Unity tanıma:** `ProjectSettings/ProjectVersion.txt` varsa tür Unity; editör sürümü okunur. Sahne listesi `.unity` dosya adlarından,
yapıdaki sahne sırası `ProjectSettings/EditorBuildSettings.asset`'ten (YAML, basit ayrıştırma).
Script sayısı ve kabaca satır sayısı hesaplanır.

**Koddaki notlar:** `.cs` (Unity) veya kaynak dosyalarda `TODO`, `FIXME`, `HACK` satırları dosya:satır ile `code_todos`'a.
Önceki taramayla karşılaştırılır: yeniler "eklendi", kaybolanlar "çözüldü" olarak işaretlenir. Taha isterse bir TODO'yu tek tıkla göreve çevirir.

**Git'siz klasör (yaratıcı):** dosya envanteri (yol, boyut, mtime). Önceki anlık görüntüyle fark: yeni / değişen / silinen.
Hash sadece mtime veya boyut değişince hesaplanır.

**Sessizlik:** son commit, oturum veya dosya değişikliğinden bu yana gün sayısı. Radar 14 günde uyarır.

Tarama sonucu: kısa bir toast ("Runika'da 4 yeni commit, SecondMind'da 1 değişiklik") ve Günlük'e commit grupları.

## Claude Code köprüsü

Taha projelerinde (özellikle Unity/Runika) Claude Code ile çalışıyor. Köprü, SecondMind ile o oturumlar arasında **dosya üzerinden**
iki yönlü bilgi akışı sağlar. AI çağrısı gerektirmez; SecondMind tarafı tamamen algoritmiktir.

Projenin kök klasöründe:

```
<proje>/.secondmind/
  BAGLAM.md            SecondMind yazar, Claude Code okur
  oturumlar/           Claude Code yazar, SecondMind okur
    2026-09-27-1430.md
```

**`BAGLAM.md` (SecondMind → Claude Code):** Her Güncelle'de ve `Başla`'ya basınca yeniden üretilir. İçerik:
projenin sıradaki ilk adımı, aktif kilometre taşı ve çıkış kriterleri, "Yapılıyor" ve en öncelikli 10 "Yapılacak" görev (id'leriyle),
açık kritik hatalar, son 5 karar (ADR başlıkları + tek cümle), son oturumun "nerede bıraktın" notu,
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
## Açık sorunlar
- Pause menüsünde müzik tekrar baştan başlıyor
## Kararlar
- Müzik geçişleri için AudioMixer snapshot kullanılacak
```

Güncelle bu dosyaları okur (frontmatter + başlıklara göre basit ayrıştırma, AI yok) ve:
- Günlük'e "Claude Code oturumu" öğesi ekler,
- `tamamlanan_gorevler`, `sonraki_adim`, yeni görev önerileri, açık sorunlar (hata görevi olarak) ve kararları (ADR olarak)
  **Onay Kutusu'na öneri** olarak koyar. Doğrudan yazmaz.
İşlenen rapor dosyası `oturumlar/islendi/` altına taşınır.

**Kurulum:** Proje ayarlarında `Köprüyü kur` butonu: `.secondmind/` klasörünü oluşturur, `resources/proje-koprusu/CLAUDE-ek.md`
içeriğini gösterir ve Taha'nın onayıyla projenin kendi `CLAUDE.md`'sinin sonuna ekler (dosya yoksa oluşturur).
`.gitignore`'a `.secondmind/` eklemek isteyip istemediği sorulur.

İleride (bu aşamada değil): aynı işlevi bir MCP sunucusu olarak sunmak.

## Veri tabloları

- `projects`: ad, tür, renk, durum, sıradaki adım, açıklama, oluşturulma, arşivlenme.
- `project_folders`: proje, yol, alan kuralları (JSON), köprü aktif mi, son tarama.
- `milestones`: proje, ad, hedef tarih, sıra, çıkış kriterleri (JSON onay listesi), tamamlandı mı.
- `tasks` (ortak tablo): `project_id`, `milestone_id`, `kanban_status`, `kind` (task/bug/research), `severity`, `repro_steps`.
- `project_docs`: proje, üst sayfa, sıra, başlık, `body_md`, tür (sayfa/ADR), Claude Code'a açık mı.
- `sessions`: proje, başlangıç, bitiş, nerede bıraktın, sıradaki adım, kaynak (Taha/Claude Code).
- `commits`: proje, hash, mesaj, tarih, alan bazında dosya sayıları (JSON).
- `code_todos`: proje, dosya, satır, metin, tür, ilk görülme, çözülme.
- `scan_snapshots`: klasör, tarih, özet (JSON), envanter hash'i.
- `assets`: proje, media id veya dış yol, tür, bağlı doküman/görev.
