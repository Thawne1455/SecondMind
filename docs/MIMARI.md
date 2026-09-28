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
- `dump_items`: tür (text/image/file; ek yoksa text, varsa ilk ekin türü), içerik, durum (bekliyor/işleniyor/işlendi/atlandı), iş id.
- `dump_attachments`: döküm id, media id, sıra. Bir döküm = bir gönderim (metin + birden çok ek).
- `media`: hash (sha256, unique), dosya adı, mime, boyut, orijinal ad. Satırlar silinmez; aynı içerik tek dosya.
  Renderer dosyaları `sm-media://m/<hash>.<ext>` protokolüyle okur (salt okunur, sadece `media/`, ad biçimi doğrulanır).
- `collections`: ad, sıra, soft delete. Ad sadece canlı koleksiyonlar arasında benzersiz (kısmi unique index);
  silinen koleksiyon geri gelirken ad çakışırsa "(2)" eki alır.
- `notes`: başlık, `body_md` (markdown; resimler `![](sm-media://m/…)`), `collection_id` (null = koleksiyonsuz),
  bağlam (`project_id` | `course_id` | `week_id`; FK yok, tablolar Aşama 5/6'da), `pinned`, `ai_excluded`, soft delete.
  `updated_at` sadece içerik (başlık, gövde, etiket) değişince ilerler; sabitleme/taşıma liste sırasını bozmaz.
- `notes_fts`: FTS5 external content (`content='notes'`, rowid), `unicode61 remove_diacritics 2`; insert/update/delete
  trigger'larıyla senkron. Sorgu kelimeleri tırnaklanır, son kelime önek eşleşir; `bm25` başlığı 5 kat ağır tartar.
  Bilinen sınırlar: büyük I "i"ye katlanır, küçük ı katlanmaz. `notes`'un açık INTEGER PK'sı olmadığından
  `VACUUM` rowid'leri değiştirebilir: VACUUM sonrası `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')`.
- `tags` (ad `toLocaleLowerCase('tr-TR')` ile normalize, unique), `note_tags` (PK not+etiket). Etiketler
  `note:update` ile örtük oluşur; listede sadece canlı notu olanlar görünür.
- `ideas`: fikir = bir not + bu satır (1:1, `note_id` unique). Başlık, gövde, etiket, arama ve silme notun kendi
  akışında; fikir notu koleksiyona taşınmaz ve notlar listesinde (Tümü/koleksiyon/Koleksiyonsuz/Sabitlenenler)
  görünmez, sadece Fikirler görünümünde, etiket filtresinde ve aramada ("Fikir" işaretiyle). Kolonlar: `status`
  (`incubating`/`active`/`project`/`archived`), `incubate_until` (oluşturmadan 14 gün sonraki günün başı), `decided_at`,
  `last_opened_at` (editörde açılınca; log'a yazılmaz), `project_id` (Aşama 5). "Karar bekliyor" (`due`) saklanmaz,
  `domain/incubation` zamana göre hesaplar. Kuluçka dolunca Evet → `active`, Hayır → `archived` (loglanır, geri
  alınabilir). Radar: 30 gündür dokunulmamış (açılma/karar/oluşturma) `active` fikir.
- `tasks`: `title`, `notes`, `status` (`open`/`done`), `priority` (1 düşük, 2 normal, 3 yüksek), `estimate_min`,
  `due_date` (son tarih), `planned_date` (yapılacağı gün; bugün ya da geçmiş = "bugüne alınmış", ileri tarih o gün
  Bugün'e düşer, null = sonra), `postpone_count` (sadece gün sonu kaydırmada artar; elle gün değiştirmek erteleme
  sayılmaz), `completed_at`, `kind` (görev/hata/araştırma — sadece proje görevlerinde anlamlı), `project_id`,
  `course_id`, `milestone_id` (FK yok, tablolar Aşama 5/6'da; ikisi de boşsa bağlam "genel"), soft delete.
  Gün alanları yerel takvim günü metni `YYYY-MM-DD`. Sıra `domain/tasks.compareTasks`: bugünkü önce, sonra son tarih,
  öncelik, erteleme sayısı, eskilik.
- `reminders`: `title`, `at` (sıradaki çalma), `rule_json` (null = tek seferlik; `{kind:'weekly',days,time}`,
  `{kind:'monthly',day,time}` — ayda o gün yoksa son gün, `{kind:'yearly',month,day,time}` — 29 Şubat → 28),
  `fired_at` (son çalma; tek seferlikte dolu = bitti), `missed_at` (kaçırılan çalma anı; ele alınana kadar dolu),
  `project_id`, `course_id`, soft delete. Tekrarlayanın `at`'i her çalma/kaçırmada sıradakine ilerler; birden çok
  kaçırılan tekrar tek kayıt olur. Kaçırılan "Bugüne al" ile bugünkü göreve dönüşür ya da kapatılır (tek grupla
  loglanır). Çalma/kaçırma sistem sinyalidir, `activity_log`'a yazılmaz.
- `routines`: `title`, `days_json` (ISO hafta günleri, 1 = Pzt), `start_time` (`HH:mm`), `duration_min`, `active`, soft delete.
- `schedule_blocks` (Aşama 3b): gün, başlangıç, bitiş, tür (ders/sınav/görev/rutin), kaynak id, sabit mi.
- `activity_log`: kim (`taha`/`ai`/`scan`), işlem (`create`/`update`/`delete`/`restore`), hedef tablo+id,
  `before_json`, `after_json`, `group_id` (birlikte uygulananlar), `undone_at`. Değişiklikle aynı transaction'da yazılır.
  Not otomatik kaydı her tuşta kayıt açmaz: aynı nota 10 dk içinde gelen update'ler (grupsuz, geri alınmamış son kayıt)
  tek 'update' kaydında birleşir, `after_json` güncellenir (`logUpdateMerged`). Koleksiyon silme notlarla aynı
  `group_id`'yi paylaşır; `collection:restore` grubu izleyip silinen notları döndürür, ayrılanları geri bağlar ve
  grubu `undone_at` ile işaretler.

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

**Örnek veri:** `npm run seed -- --data-dir <klasör> [--reset]` (`scripts/seed.ts`, tsx ile). Klasör zorunlu; gerçek
veri klasörü (varsayılan ya da uygulamanın `config.json`'undaki) reddedilir. Dolu DB `--reset` olmadan reddedilir;
`--reset` DB'yi ve `media/`'yı silip baştan doldurur. Ana süreçteki sorgu fonksiyonlarını kullanır, tarihleri geçmiş
haftalara kaydırır; örnek veri Taha'nın işlemi olmadığı için sonunda `activity_log` boşaltılır.

**Migration ve geri dönüş:** Migration'lar mümkün olduğunca sadece ekleme yapar. Açılışta bekleyen migration varsa önce
`backups/pre-migrate-<n>-<zaman>.db` kopyası alınır (`VACUUM INTO`). Her migration'ın elle çalıştırılacak geri dönüşü
`src/main/db/migrations/down/<ad>.down.sql` dosyasındadır.

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

Uygulama açıkken ana süreç (`src/main/reminderTimer.ts`) dakika başlarında ve uykudan dönüşte `reminders`'ı kontrol
eder (`domain/recurrence.sweepReminders`), zamanı gelenler için Electron bildirimi gösterir; bildirime tıklanınca pencere
öne gelir ve Bugün açılır (`nav:today` olayı). Açılıştaki ilk kontrol de aynı kuralla çalışır: 10 dakikadan az
gecikmiş olan yine çalar, daha eskisi `missed_at` alır ve Bugün'ün üst çubuğunda "N hatırlatma kaçtı · Bugüne al"
rozetiyle gösterilir. Değişiklikler renderer'a `reminders:changed` olayıyla bildirilir (`window.api.on`).
