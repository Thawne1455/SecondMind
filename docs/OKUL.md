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

Ders kartlarından oluşan bir ızgara **değildir**. Dönemin tamamını tek bakışta gösteren bir panodur:

1. **Üst bant (gök mavisi dolgu, köşe 28):** dönem adı (2026-2027 GÜZ), "HAFTA 5 / 14" büyük sayı, dönem ilerleme çubuğu,
   sağda **dönem ortalaması (tahmini)** ve **genel ortalama** büyük sayılarla.
2. **Sınav şeridi:** yaklaşan sınavlar soldan sağa tarih sırasıyla, her biri bir geri sayım karosu:
   "12 GÜN · VERİ YAPILARI VİZE", hazırlık yüzdesi (konu hazırlık puanlarından), planlanan / yapılan çalışma saati.
   7 günden az kaldıysa ve hazırlık %50'nin altındaysa mercan.
3. **Haftalık program (sol, geniş):** Pzt–Cum kolonları, 08–20 satırları. Akış bandı bloklarının **dikey** hali.
   Ders blokları gök tonlarında (ders adı, derslik), sınav çalışma blokları çizgili, sınav günleri mercan pin.
   Bu haftanın geçmiş dersleri üzerinde küçük **yoklama** işareti: katıldım / katılmadım (tek tık).
4. **Not durumu tablosu (sağ):** her ders bir satır: ders, kredi (AKTS), şu anki ağırlıklı puan, harf tahmini,
   **"Finalde en az X almalısın"** (hedef harf için), devamsızlık `3 / 8` (sınıra 2 kala amber, aşınca mercan).
5. **Bu hafta teslim:** ödevler, son tarih sırasıyla, ders renk noktasıyla.

Boş durum (dönem yok): "Dönem tanımlanmadı. Derslerini ve programını gir, SecondMind haftanı kursun." + `+ Dönem oluştur`.

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

Dönem panosundaki ortalama sayısına tıklayınca açılır. Tüm dönemler ve dersleri: kredi, harf, katsayı.
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
