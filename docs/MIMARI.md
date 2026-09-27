# Mimari

## Süreçler

- **Ana süreç (`src/main`)**: SQLite bağlantısı (tek bağlantı, WAL modu), IPC handler'ları, tarayıcılar, AI çalıştırıcı,
  hatırlatma zamanlayıcısı (uygulama açıkken dakikada bir kontrol), Electron `Notification`.
- **Preload (`src/preload`)**: `contextBridge.exposeInMainWorld('api', ...)`. Mantık içermez.
- **Renderer (`src/renderer`)**: React. Veriyi yalnızca `window.api` ile alır, TanStack Query ile önbelleğe alır.

Uygulama kapanınca her şey durur. Tray, arka plan servisi, otomatik başlatma yok.

## IPC sözleşmesi

`src/shared/ipc.ts` tek kaynaktır: her kanal için girdi ve çıktı zod şeması ve TypeScript tipi.
Kanal adları `alan:eylem` biçiminde (`dump:create`, `project:scan`, `course:grades`, `proposal:apply`).
Ana süreç her girdiyi şemayla doğrular. Renderer tarafında her kanal için tipli bir hook (`useDumps`, `useScanProject`...).
Uzun işler (tarama, AI) ilerlemeyi `webContents.send('progress', ...)` ile yayınlar.

## Veri klasörü

Varsayılan `%USERPROFILE%\SecondMind\` (Ayarlar'dan değiştirilebilir, `app.getPath('userData')/config.json`'da saklanır).
`Belgeler` kullanılmaz: Windows'ta genellikle OneDrive ile senkronlanır, senkron istemcisi açık SQLite/WAL dosyalarını
kilitleyip bozabilir. Seçilen yol OneDrive altındaysa (`OneDrive*` ortam değişkenleri veya yol içinde `OneDrive`
klasörü) uygulama uyarı gösterir; engellemez.

```
SecondMind/
  secondmind.db
  media/          yüklenen resim, PDF, ses; dosya adı = içerik hash'i + uzantı (tekrarları önler)
  ai/
    CLAUDE.md     ajan kuralları (resources/ai-agent/CLAUDE.md'den kopyalanır, sürümlü)
    jobs/<id>/    her AI işinin paketi ve çıktısı (son 30 iş tutulur)
  backups/        "Yedek al" ile oluşan tarihli kopyalar
```

## Veritabanı taslağı

Drizzle şeması `src/main/db/schema/` altında alan başına dosya. Her tabloda `id` (ulid), `created_at`, `updated_at`,
silinebilenlerde `deleted_at`. Aşağısı başlangıç taslağıdır; aşamalarda genişler.

**Çekirdek**
- `dump_items`: tür (text/image/file), içerik, media referansı, durum (bekliyor/işleniyor/işlendi/atlandı), iş id.
- `media`: hash, yol, mime, boyut, orijinal ad.
- `notes`: başlık, `body_md`, koleksiyon, bağlam (`project_id` | `course_id` | `week_id` | null), sabitlenmiş, AI'a kapalı.
- `notes_fts`: FTS5 sanal tablo (başlık + gövde), trigger'larla senkron.
- `tags`, `note_tags`.
- `tasks`: başlık, açıklama, bağlam (proje/ders/genel), durum, öncelik, tahmini süre, son tarih, planlanan blok,
  `postpone_count`, kilometre taşı, tür (görev/hata/araştırma — tür sadece proje görevlerinde anlamlı).
- `reminders`: saat, tekrar kuralı, bağlam, `fired_at`, `missed`.
- `routines`: ad, tekrar kuralı (gün + saat + süre).
- `schedule_blocks`: gün, başlangıç, bitiş, tür (ders/sınav/görev/rutin), kaynak id, sabit mi.
- `ideas`: başlık, not, `incubate_until`, durum (kuluçka/proje oldu/arşiv).
- `activity_log`: kim (Taha/AI/tarama), işlem, hedef tablo+id, önceki değer, yeni değer, geri alındı mı.

**Projeler** (ayrıntı `docs/PROJELER.md`)
- `projects`, `project_folders`, `milestones`, `project_docs` (ağaç), `sessions`, `commits`, `code_todos`, `scan_snapshots`, `project_decisions`, `assets`.

**Okul** (ayrıntı `docs/OKUL.md`)
- `terms`, `courses`, `course_slots`, `instructors`, `course_weeks`, `topics`, `grade_components`, `grades`,
  `exams`, `exam_topics`, `assignments`, `attendance`, `course_materials`.

**Zihin**
- `checkins` (tarih, ruh hâli 1–5, enerji 1–5, uyku saati, not), `journal_entries`, `decisions` (karar, beklenti, gözden geçirme tarihi, sonuç), `achievements` (türetilir, tablo gerekirse).

**AI**
- `ai_jobs`: tür, model, durum, başlangıç/bitiş, girdi özeti, ham çıktı yolu, hata.
- `proposals`: iş id, işlem türü, JSON yük, kaynak döküm id'leri, durum (bekliyor/onaylandı/reddedildi/düzenlendi), uygulama log id'si.

Profil ("Beni tanı" metni) ve ayarlar `settings` tablosunda anahtar-değer.

## Tarama (Güncelle)

Güncelle butonu `scan:all` çağırır. Sırasıyla her bağlı proje klasörü taranır, ilerleme yayınlanır.
Tarama tamamen algoritmiktir, AI kullanmaz. Sonuçlar `scan_snapshots` ile bir önceki taramayla karşılaştırılır,
sadece farklar kaydedilir. Ayrıntı ve Unity kuralları `docs/PROJELER.md`'de.

## AI akışı

AI = Taha'nın bilgisayarındaki **Claude Code**, aboneliğiyle, `-p` (tek seferlik) modunda. API anahtarı yok.

1. **Paket (algoritma):** "AI ile İşle" → `ai/jobs/<id>/` oluşturulur:
   - `girdi.md`: işlenecek döküm öğeleri (id'leriyle) + kısa bağlam: bugünün tarihi, profil özeti, aktif projeler
     (ad, id, sıradaki adım, açık kilometre taşı), bu dönemin dersleri (ad, id, yaklaşan sınavlar), son 10 not başlığı.
     Bağlam en fazla ~3.000 token olacak şekilde kırpılır. "AI'a kapalı" işaretli içerik asla girmez.
   - `media/`: dökümdeki resim ve PDF'lerin kopyaları.
2. **Çağrı:** `claude -p "<kısa talimat>" --model <model> --output-format json` komutu `cwd = iş klasörü` ile çalıştırılır.
   Model: Hızlı = Haiku sınıfı, Derin = Sonnet sınıfı (Ayarlar'dan değiştirilebilir). İzinler salt okumaya sınırlanır;
   ajan dosya yazmaz, sonucu stdout'a JSON olarak verir. Kesin bayrakları uygulamadan önce `claude --help` ile doğrula.
   Zaman aşımı 5 dakika; iptal edilebilir.
3. **Doğrulama (algoritma):** Çıktıdaki JSON `changesSchema` (zod) ile doğrulanır. Geçersiz işlemler tek tek reddedilir ve
   işe not düşülür; geçerliler `proposals`'a yazılır. Hiç geçerli işlem yoksa iş "başarısız" olur ve dökümler bekliyor'a döner.
4. **Onay (Taha):** Onay Kutusu'nda gösterilir. Onaylanan her öneri tek bir DB transaction'ında uygulanır ve `activity_log`'a yazılır.
5. **Geri alma:** `activity_log`'daki önceki değerle ters işlem.

`changes.json` biçimi (başlangıç seti; yeni işlem türü eklemek = şema + uygulayıcı + önizleme bileşeni):

```json
{
  "version": 1,
  "operations": [
    { "op": "create_task", "sourceDumpIds": ["..."], "title": "...", "context": { "projectId": "..." }, "dueDate": null, "estimateMin": 30 },
    { "op": "create_note", "sourceDumpIds": ["..."], "title": "...", "bodyMd": "...", "context": { "courseId": "..." } },
    { "op": "append_to_note", "sourceDumpIds": ["..."], "noteId": "...", "appendMd": "..." },
    { "op": "create_reminder", "sourceDumpIds": ["..."], "title": "...", "at": "2026-09-28T09:00" },
    { "op": "create_idea", "sourceDumpIds": ["..."], "title": "...", "note": "..." },
    { "op": "create_exam", "sourceDumpIds": ["..."], "courseId": "...", "date": "...", "topics": ["..."] },
    { "op": "set_project_next_step", "sourceDumpIds": ["..."], "projectId": "...", "text": "..." },
    { "op": "add_instructor_note", "sourceDumpIds": ["..."], "courseId": "...", "text": "..." }
  ],
  "unprocessed": [ { "dumpId": "...", "reason": "Hangi derse ait olduğu belirsiz" } ]
}
```

Ajanın kuralları `resources/ai-agent/CLAUDE.md`'dedir. Oraya yazılan her kural `changesSchema` ile tutarlı olmalı.

**Haftalık değerlendirme** (Zihin, Pazar): aynı akış, tür `weekly_review`; çıktı tek bir `create_note` (koleksiyon "Haftalık") ve
en fazla 3 `create_task` önerisi. Girdisi algoritmayla hazırlanan haftalık istatistik özetidir, ham notlar değil.

## Hatırlatmalar

Uygulama açıkken ana süreç dakikada bir `reminders`'ı kontrol eder, zamanı gelenler için sistem bildirimi gösterir.
Açılışta `at < şimdi` ve `fired_at` boş olanlar `missed` işaretlenir ve Bugün'ün üst çubuğunda "N hatırlatma kaçtı" rozetiyle gösterilir.
