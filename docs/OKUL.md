# Okul paneli

**Soru:** Bu dönem nasıl gidiyor, hangi sınav yaklaşıyor, şu an ne çalışmalıyım?
**Ruh:** Bir karne ve bir ders defteri. Sabit uzunlukta bir dönem, haftalık tekrar eden program, puanlarla ölçülen sonuç.
Projeler'den farkı: kanban, kilometre taşı, doküman ağacı, git **yoktur**. Dönem, hafta, not ortalaması, devamsızlık, hoca, sınav **vardır**.
Her şey zamana (hafta) ve puana bağlıdır.

Örnek dersler (2026-2027 Güz): Veri Yapıları (D-201), Lineer Cebir (B-105), Olasılık ve İstatistik, Bilgisayar Mimarisi, Teknik İngilizce.

## Hiyerarşi

**Dönem → Ders → Hafta (1–14) → Konu.** Sınavlar konulara, notlar haftalara bağlanır.
Bir dönem "aktif"tir; geçmiş dönemler salt okunur arşivdir ama ortalama hesabına girer.

## Ana ekran: dönem panosu

Ders kartlarından oluşan bir ızgara **değildir**. Taha paneli iki iş için açar: **bugün/yarın ne var** ve **bir dersin
içeriğine gitmek**. Pano bu ikisine göre dizilir (2026-09-30 yeniden düzen; eski düzende haftalık program ekranın yarısını
kaplıyordu, not girilmemişken tablo ve sınav şeridi boş duruyordu):

1. **İnce üst bant (gök mavisi dolgu, köşe 28):** dönem adı ve tarihleri, "HAFTA 5 / 14" ve ilerleme çubuğu,
   `Haftalık program` butonu, sağda dönem ve genel ortalama (küçük). Hiç harf yoksa ortalamalar gizlenir.
   Ortalamaya tıklamak **Notlar ve ortalama** ekranını açar.
2. **Bugün / Yarın / Yaklaşan şeridi (üç kolon):**
   - Bugün ve Yarın: o günün dersleri saat sırasıyla (ton çizgisi, ad, saat, derslik), sınav çalışma blokları (çizgili,
     bugün tek tıkla "çalıştım"), o güne düşen sınav mercan etiketle. Bugün biten derste yoklama: katıldım / katılmadım.
   - Yaklaşan: 2–7 gün içindeki sınavlar (geri sayım, hazırlık yüzdesi; 7 günden az ve hazırlık %50 altı mercan) ve
     48 saat içindeki (ya da gecikmiş) açık teslimler, tek tıkla "teslim ettim".
   - Boş kolon tek satırdır ("Ders yok."), büyük boş kutu çizilmez.
3. **Ders defterleri:** her ders tam genişlikte bir satır. Solda ders tonunda sırt, ders adı, kodu, sıradaki sınav
   ("Vize · 12 gün") ve devamsızlık uyarısı (sadece amber/mercan durumda). Ortada **14 hafta karesi**: içerik (başlık, konu,
   dolu not ya da materyal) varsa ders tonunda, açık "anlamadım" varsa mercan ve sayısıyla, içinde bulunulan hafta
   halkalı, gelecek boş haftalar soluk. Kareye tıklamak dersin o haftasını açar (`?hafta=N`), ada tıklamak dersi.
   Sağda sıradaki ders: "Şimdi · D-201", "Yarın 09:00 · D-201", "Pzt 09:00".
4. **Haftalık program modalı:** Pzt–Cum kolonları, 08–20 satırları; akış bandı bloklarının **dikey** hali. Ders blokları gök
   tonlarında, çalışma blokları çizgili, sınav günleri mercan pin, bu haftanın geçmiş derslerinde yoklama.
5. **Notlar ve ortalama ekranı** (`/okul/gano`): önce bu dönemin not durumu tablosu (ders, Kredi, puan, harf,
   "hedef için en az X", devamsızlık), altında GANO (aşağıda).

Sınav şeridi ayrı bölüm değildir: sınavlar Bugün/Yarın/Yaklaşan şeridine ve ders satırlarına dağılır; tümü ders
detayındaki Sınavlar sekmesindedir. `+ Sınav` ve `Dönem ayarları` ders defterleri başlığının sağında.

Boş durum (dönem yok): "Dönem tanımlanmadı. Derslerini ve programını gir, SecondMind haftanı kursun." + `+ Dönem oluştur`
ve `Programdan doldur` (amber).

**Programdan doldur** (4e-2): ders programının fotoğrafı, ekran görüntüsü ya da PDF'i (bırak / seç / Ctrl V) DERİN'e
gider; dönem, dersler, saatler, derslikler ve hocalar Onay Kutusu'na öneri olarak düşer (haftalık önizlemeyle).
Buton boş durumda ve Ders defterleri başlığında `Dönem ayarları`'nın yanında. Döküm'e atılan program fotoğrafı da aynı
önerilere dönüşür.

## Ders detayı

Üstte **ders bandı** (dersin gök tonunda dolgu): ders adı büyük harf, kod, kredi, derslik ve saatler, hoca adı.
Sağda üç büyük sayı: şu anki puan · devamsızlık · bir sonraki sınava kalan gün.

Altında sekmeler:

### 1. Hafta hafta (ders defteri)
Dersin kalbi. **Solda 14 haftalık dikey şerit**: her hafta bir satır (hafta no, tarih aralığı, konu başlığı, not var mı, materyal sayısı,
"anlamadım" işareti sayısı). İçinde bulunulan hafta vurgulu. **Sağda seçili haftanın defteri**:
- Konu(lar) ve bu haftanın ders notu (TipTap, markdown).
- Materyaller: slayt PDF'leri (pdf.js ile satır içi görüntüleme, sayfa küçük resimleri), tahta fotoğrafları, hocanın paylaştığı dosyalar.
- **"Anlamadım" işaretleri:** notta bir paragrafa işaret konur; ders detayında ve sınav hazırlığında "hocaya sor" listesi olarak toplanır.
- **"Hoca vurguladı" işareti:** konuya konur ("bu sınavda çıkar"). Sınav planında önceliği yükseltir.
Müfredat başta girilir (veya AI ile ders izlencesi PDF'inden çıkarılır, öneri olarak); hafta konuları sonra düzenlenebilir.

### 2. Sınavlar ve notlar
- **Değerlendirme şeması:** bileşenler ve ağırlıkları (Vize %30, Ödevler %20, Final %50). Toplam %100 değilse uyarı.
- **Aldığın notlar:** her bileşen için puan girişi. Girilince ağırlıklı puan ve harf tahmini anında güncellenir.
- **Hedef hesaplayıcı:** "Hedef harf: BB" seçilince kalan bileşenlerden her birinde en az kaç alınması gerektiği.
  Kaydırıcıyla "Finalden 60 alırsam?" senaryosu. Tamamen algoritmik.
- **Harf aralıkları:** ders bazında düzenlenebilir tablo (varsayılan: AA 90, BA 85, BB 80, CB 75, CC 70, DC 65, DD 60, FD 50, FF altı;
  4'lük sistem katsayıları AA 4.0 … FF 0). Üniversiteler farklı olduğu için değiştirilebilir; bağıl değerlendirme varsa elle harf girilebilir.
- **Sınav kartları:** tarih, tür, kapsam (konu listesi), yer. Sınav geçtikten sonra: alınan puan, **sınav sonrası analiz**
  (hangi soru türünde puan kaybettim, bir dahaki sefere ne yaparım). Bu analizler bir sonraki sınavın hazırlık ekranında gösterilir.

### 3. Hoca
- Hoca kartı: ad, e-posta, oda, ofis saatleri (Bugün ekranında ilgili gün hatırlatılabilir).
- **Hoca notları:** sınav tarzı ("ispat soruyor, test yok"), vurguladıkları, sevmedikleri, devam politikası, ödev geç teslim kuralı.
  Kısa madde listesi, tarihli. AI dökümden `add_instructor_note` ile öneri ekleyebilir.
- Bir hocanın birden fazla dersi olabilir; hoca notları derslerde paylaşılır.

### 4. Ödevler
Liste (kanban değil): başlık, son tarih, durum (başlanmadı / devam / teslim edildi / notlandı), puan, bağlı hafta.
Son tarihe 48 saat kala hatırlatma otomatik kurulur. Teslim edilince Başarılar'a düşer.

### 5. Devamsızlık
Dersin tüm oturumları tarih sırasıyla, katıldım / katılmadım / ders iptal. Sınır (Ayarlar'da ders bazında, örn. %30 veya 8 saat).
Kalan hak büyük sayıyla. Bugün ekranındaki ders bloğu geçtiğinde "Derse katıldın mı?" tek tık sorusu buraya yazar.

## Sınav hazırlık ekranı (sınavdan geriye plan)

Sınav kartından açılır. Okul'un en değerli ekranı.
- Üstte geri sayım posteri: "12 GÜN · VERİ YAPILARI VİZE".
- **Konu listesi:** her konuda hazırlık seviyesi 0–3 (Bilmiyorum · Tanıdık · Anladım · Çözebiliyorum), hoca vurgusu işareti,
  bağlı hafta notlarına bağlantı, o konudaki "anlamadım" işaretleri.
- **Plan (algoritma):** Girdi: sınav tarihi, konular, konu başına tahmini saat (hazırlık seviyesine ve hoca vurgusuna göre ağırlıklandırılır),
  günlük en fazla çalışma süresi (Ayarlar), dersler ve sabit bloklar. Çıktı: bugünden sınava kadar boş saatlere yerleştirilmiş çalışma blokları.
  Önce zor ve vurgulanan konular, sınavdan önceki son gün tekrar. Önizlenir, `Planı onayla` ile `schedule_blocks`'a yazılır.
- **Yeniden dağıtma:** kaçırılan blok (zamanı geçti, işaretlenmedi) kalan günlere otomatik yayılır; sığmıyorsa uyarı.
- Önceki sınavların analiz notları ("geçen sefer ispatlarda kaybettin") burada gösterilir.

## Ortalama ekranı (GANO)

Dönem panosundaki ortalama sayısına tıklayınca açılır (Notlar ve ortalama ekranının alt bölümü). Tüm dönemler ve dersleri: kredi, harf, katsayı.
Aktif dönem için tahmini harflerle **dönem ve genel ortalama simülasyonu**: bir dersin harfini değiştirince ortalamalar anında güncellenir.
Formül: Σ(kredi × katsayı) / Σ kredi. Tekrar alınan derste son not geçerli.

## Algoritmalar (`src/main/domain/school/`, hepsi Vitest ile test edilir)

- `weightedScore(components, grades)` → şu anki puan ve tamamlanan ağırlık.
- `requiredScores(components, grades, targetLetter, letterTable)` → kalan her bileşen için gereken en düşük puan (imkânsızsa belirt).
- `letterFor(score, letterTable)`, `gpa(courses)`.
- `attendanceStatus(sessions, limit)` → kullanılan, kalan, durum.
- `buildStudyPlan(exam, topics, freeSlots, dailyMax)` ve `redistribute(plan, missedBlocks, freeSlots)`.
- `examReadiness(topics)` → hazırlık yüzdesi.

## Veri tabloları

- `terms`: ad, başlangıç, bitiş, hafta sayısı, aktif mi.
- `courses`: dönem, ad, kod, kredi, renk tonu, hoca, devam sınırı, harf tablosu (JSON).
- `course_slots`: ders, gün, başlangıç, bitiş, derslik (haftalık program; `schedule_blocks` bundan üretilir).
- `instructors`: ad, e-posta, oda, ofis saatleri; `instructor_notes`: hoca, ders (opsiyonel), metin, tarih.
- `course_weeks`: ders, hafta no, tarih aralığı, konu başlığı.
- `topics`: ders, hafta, ad, hoca vurguladı mı.
- `grade_components`: ders, ad, tür (vize/final/ödev/quiz/proje), ağırlık.
- `grades`: bileşen, puan, tarih.
- `exams`: ders, bileşen, tarih, yer, kapsam; `exam_topics`: sınav, konu, hazırlık seviyesi 0–3, tahmini saat; `exam_reviews`: sınav, analiz metni.
- `assignments`: ders, başlık, son tarih, durum, puan, hafta.
- `attendance`: ders, tarih, durum (katıldı/katılmadı/iptal).
- `course_materials`: ders, hafta, media id, tür (slayt/tahta/izlence/diğer), başlık.
- Hafta notları `notes` tablosunda `week_id` bağlamıyla; "anlamadım" işaretleri not içinde işaret + `note_flags` tablosu (tür, konum, çözüldü mü).
