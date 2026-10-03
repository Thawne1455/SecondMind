# Diğer ekranlar

Projeler ve Okul kendi dokümanlarında. Burada: Bugün, Döküm, Onay Kutusu, Zihin, Bilgi, Ayarlar.
Bugün ve Hızlı Döküm modalı tasarlandı (`design/referans/`); diğerleri `docs/TASARIM.md` kurallarıyla türetilir.

## Bugün — "Şu an ne yapmalıyım?"

Tasarımı birebir uygula (`bugun-acik.png`, `bugun-koyu.png`, `design/referans/bugun.html`). Yukarıdan aşağı:

1. **Üst çubuk:** "PAZAR 27 EYLÜL", kaçırılan hatırlatma rozeti ("2 hatırlatma kaçtı" + `Bugüne al`), arama, Güncelle, AI ile İşle, + Döküm.
2. **Akış bandı:** 08–24, günün tüm blokları (bkz. TASARIM.md). Görev blokları sürüklenerek taşınır; `Yeniden yerleştir` algoritmayı tekrar çalıştırır.
3. **Şimdi:** "ŞİMDİ · RUNIKA · 50 DK KALDI" + poster başlıkta şu anki bloğun işi + `Başla` / `Oturumu kapat`.
   Şu an blok yoksa sıradaki bloğu gösterir ("13:00'TE"), hiç yoksa en eski sıradaki adımı.
4. **Sıradaki adımlar (sağ):** diğer aktif projelerin sıradaki ilk adımları, proje renk noktasıyla, `Başla`.
5. **Karolar (3 × 2):** Nasılsın? (ruh hâli, enerji, uyku) · Radar (en uzun sessiz proje/fikir, "16 GÜN SESSİZ") ·
   Kuluçka (süresi dolan fikir, "Hâlâ heyecanlandırıyor mu?") · Hatırlatmalar · Karar gözden geçirme ("3 AY ÖNCE KARAR VERDİN") ·
   Bu hafta başardıkların (görev, commit, quiz sayıları). İçeriği olmayan karo gizlenir, yerini diğerleri doldurur.

**Yerleştirme algoritması** (`domain/scheduler`): Sabit bloklar (dersler, rutinler, sınav çalışma blokları) önce yerleşir.
Bugüne alınmış görevler; önce son tarihi yakın olan, sonra öncelik, sonra erteleme sayısı yüksek olan sırasıyla ilk uygun boşluğa.
Tahmini süresi olmayan göreve 30 dk verilir. Bloklar arası 10 dk tampon. Sığmayanlar "sığmadı" listesinde.
Gün sonunda tamamlanmayan görev yarına kayar ve `postpone_count` 1 artar.

**Erteleme sayacı:** 3'e ulaşan görev, Bugün'de o görev bloğuna tıklanınca "Bu 3. erteleme: Böl · Sil · Bugün yap" sorusu.

## Döküm — "Aklımdakini nereye atayım?"

**Hızlı Döküm modalı** (Ctrl N, her ekrandan; tasarımı `hizli-dokum-modal.png`): amber üst şerit, büyük metin alanı,
resim yapıştırma ve dosya sürükleme, eklerin küçük kartları. Enter kaydeder, Shift+Enter yeni satır, Esc kapatır.

**Döküm ekranı:** Üstte aynı giriş alanının geniş hali. Altında bekleyen öğeler kuyruğu: tür ikonu, önizleme (resimse küçük görsel),
"14 dk önce", sil. Sağ üstte `AI ile İşle (5)` + model açılır menüsü (HIZLI / DERİN).
İşlenirken öğelerde iskelet animasyonu, üst çubukta "İşleniyor 3/5". Bittiğinde toast: "7 öneri Onay Kutusu'nda" + `Aç`.
Sekme: Bekleyenler / İşlenenler (hangi önerilere dönüştüğüyle) / Atlananlar (AI'ın `unprocessed` gerekçesiyle, elle yönlendirme).
Boş durum: "Döküm boş. Aklına gelen her şeyi buraya at, gerisini SecondMind halleder."

## Onay Kutusu — "AI ne yapmak istiyor, onaylıyor muyum?"

Öneriler kaynağa göre gruplu ("Döküm'den · bugün 10:12 · 4 öneri", "Runika · Claude Code oturumu · 3 öneri").
Her öneri: işlem türü etiketi, hedef alan etiketi, tek cümle açıklama, kaynak döküm metninden alıntı.
Not güncellemelerinde fark karosu (TASARIM.md). Butonlar: Reddet · Düzenle · Onayla. Grup başında `Tümünü onayla`.
Düzenle: önerinin alanlarını formda değiştirip onaylar.
Alt sekme **İşlem günlüğü:** uygulanmış değişiklikler, kim yaptı (Taha / AI / tarama), `Geri al`.

## Zihin — "Nasılım, beni ne etkiliyor?"

Ana renk leylak. Dört sekme:
- **Bugün:** kayıt (ruh hâli 1–5, enerji 1–5, uyku saati, isteğe bağlı tek satır). 10 saniyede biter. Altında serbest günlük (TipTap).
- **Eğilimler:** 30 günlük ruh hâli + enerji çizgi grafiği (sınav günleri kesikli dikey çizgi) · verim ısı haritası (gün × saat, tamamlanan görev ve
  oturum dakikalarından) · uyku × ruh hâli dağılım grafiği · içgörü karoları. İçgörüler algoritmayla üretilir, sade cümlelerle:
  "7 saatten az uyuduğun günlerde ruh hâlin ortalama 1,2 puan düşük (14 gün veri)." En az 14 günlük veri yoksa
  "Birkaç hafta sonra burada örüntüler görünecek" boş durumu. Korelasyon iddiası için en az 10 veri noktası şartı.
- **Kararlar:** kişisel karar günlüğü. Karar, beklenti, tarih, gözden geçirme tarihi (varsayılan 3 ay). Vadesi gelenler üstte;
  gözden geçirme: Evet / Kısmen / Hayır + kısa not.
- **Başarılar:** aylara göre gruplu zaman çizelgesi: tamamlanan görevler, biten kilometre taşları, teslim edilen ödevler,
  sınav sonuçları, commit sayıları. Üstte ay özeti büyük sayılarla. Tamamen türetilir.

**Haftalık değerlendirme** Pazar günü Bugün'de bir karo olarak önerilir; AI akışıyla çalışır (MIMARI.md).

Zihin verilerinin AI'a gidip gitmeyeceği Taha'nın seçimidir (Ayarlar > AI'da anahtar, Aşama 7).

## Bilgi — "Şunu nereye yazmıştım?"

Ana renk turkuaz. Üç panel: solda koleksiyonlar ve etiketler (+ "Fikirler" koleksiyonu), ortada not listesi (başlık, iki satır önizleme,
küçük görsel, etiketler, tarih), sağda editör. Üstte arama (FTS5, eşleşme amber vurgulu).
Notun bağlamı (proje, ders, hafta) editörün üstünde chip olarak; tıklayınca o panele gider.
Proje dokümanları ve ders hafta notları da aramada çıkar ama Bilgi listesinde değil, kendi panellerinde düzenlenir.
**Fikirler:** yeni fikir 14 gün kuluçkaya girer ("KULUÇKADA · 5 GÜN KALDI"). Süre dolunca Bugün'de soru karosu.
"Projeye çevir" yeni proje oluşturur ve fikrin notunu projenin ilk doküman sayfası yapar.
**Radar:** 30 gündür açılmamış fikir veya 14 gündür sessiz proje Bugün'deki radar karosuna aday olur.

## Ayarlar

Bölümler: Profil ("Beni tanı" metni, AI her işte görür) · Veri klasörü ve `Yedek al` · Görünüm (Açık / Koyu / Sistem) ·
Rutinler · Okul (dönemler, ders programı, devam sınırları, günlük en fazla çalışma) · Projeler (bağlı klasörler, alan kuralları, köprü) ·
AI ("Beni tanı" profili, varsayılan model, HIZLI yerel model indir / sil, DERİN Claude Code yolu + model adı + Test et,
"AI'a kapalı" koleksiyonlar; not başına kapatma Bilgi editöründe).
