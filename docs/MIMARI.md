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
    jobs/<id>/    her AI işinin paketi ve çıktısı: girdi.md, kurallar.md, media/, cikti.json (son 30 iş tutulur)
  models/         yerel AI modeli (Qwen3.5-9B GGUF, ilk kullanımda Ayarlar > AI'dan indirilir)
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
- `collections`: ad, sıra, `ai_excluded` (koleksiyondaki notlar AI'a gitmez), soft delete. Ad sadece canlı koleksiyonlar arasında benzersiz (kısmi unique index);
  silinen koleksiyon geri gelirken ad çakışırsa "(2)" eki alır.
- `notes`: başlık, `body_md` (markdown; resimler `![](sm-media://m/…)`), `collection_id` (null = koleksiyonsuz),
  bağlam (`project_id` | `course_id` | `week_id`; FK yok, tablolar Aşama 5/6'da), `pinned`, `ai_excluded`, soft delete.
  `project_id` dolu not = proje notu (Projeler > Notlar, 5b); `note:list`/`note:create` `projectId` alır.
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
- `schedule_blocks` (Aşama 3b): `day` (`YYYY-MM-DD`), `start_min` / `end_min` (günün dakikası, 08:00 = 480), `kind`
  (`task`/`routine`; ders ve sınav blokları Aşama 6), `source_id` (görev ya da rutin id'si, FK yok), `pinned` (Taha elle
  taşıdı: o gün sabit). Algoritmanın türettiği plan: soft delete yok, satırlar farkla güncellenir/silinir ve bu yazımlar
  log'a düşmez; Taha'nın taşıması, sabitliği kaldırması ve "Başla"sı loglanır. `schedule:today` her okumada (dakikada
  bir) önce gün sonu kaydırmasını, sonra `domain/scheduler.planDay`'i `fill` kipinde çalıştırır: kayıtlı yerleşim korunur,
  bloğu olmayan bugünkü görevler şimdiden sonraki ilk boşluğa girer; süresi değişen, rutinle/sabitle çakışan blok yeniden
  yerleşir; bitmiş görevin başlamamış bloğu kalkar, sürerken biteninki bitiş anında kesilir. "Yeniden yerleştir"
  (`replace`) sabitlenmemiş, başlamamış ve kaçırılmış blokları yeniden yerleştirir; sabit ve süren bloklara dokunmaz.
  Kurallar: 08–24, 5 dk adım, bloklar arası 10 dk tampon, süresiz göreve 30 dk, geçmişe yerleştirme yok, sığmayan
  "sığmadı" listesine. Gün sonu kaydırma (açılışta ve her okumada): planlanan günü geçmişte kalan açık görevler bugüne
  kayar, `postpone_count` kaç gün kaçırılmış olursa olsun bir artar, hepsi `system` aktörüyle tek grupla loglanır.
- `activity_log`: kim (`taha`/`ai`/`scan`/`system`), işlem (`create`/`update`/`delete`/`restore`), hedef tablo+id,
  `before_json`, `after_json`, `group_id` (birlikte uygulananlar), `undone_at`. Değişiklikle aynı transaction'da yazılır.
  `id` tekdüze artan ulid (aynı milisaniyedekiler de sıralı; `logUpdateMerged` son kaydı id'yle bulur).
  Not otomatik kaydı her tuşta kayıt açmaz: aynı nota 10 dk içinde gelen update'ler (grupsuz, geri alınmamış son kayıt)
  tek 'update' kaydında birleşir, `after_json` güncellenir (`logUpdateMerged`). Koleksiyon silme notlarla aynı
  `group_id`'yi paylaşır; `collection:restore` grubu izleyip silinen notları döndürür, ayrılanları geri bağlar ve
  grubu `undone_at` ile işaretler.

**Projeler** (ayrıntı `docs/PROJELER.md`)
5a (`0007_projects`) ve 5b tarama tabloları (`0008_scan`) yazıldı; gerisi taslak. Her alt aşama kendi migration'ını getirir; hepsi **sadece ekleme**
(yeni tablo, `tasks`'a null olabilen/varsayılanlı kolon). Geri dönüş: yeni tabloları düşür, `tasks` kolonları için SQLite
`DROP COLUMN`. `tasks`/`reminders`/`ideas.project_id`'ye FK eklenmez; bütünlük sorgu katmanında.
Proje kararları (ADR) ayrı tablo değil, `project_docs.kind = 'adr'`.
- `projects` (5a): `name`, `kind` (`unity`/`software`/`creative`/`general`), `color` (proje paleti, `#RRGGBB`), `status`
  (`active`/`paused`/`archived`), `next_step` (oturum kapanışı yazar; 5c'de motorun girdisi), `description`,
  `release_platform` (`steam`/`itch`/null; Runika = `itch`), `last_opened_at` (log'a yazılmaz), `archived_at`
  (arşive alınınca dolar, çıkınca boşalır), soft delete. Ad canlılar arasında benzersiz (kısmi unique index).
  Silme süren oturumu kapatır, ikisi tek grupla loglanır. 5d eki: `count_rules_json` (GDD etiketi ↔ glob).
- `project_folders` (5a): `project_id`, `path` (mutlak, `resolve` ile normalleşmiş), `area_rules_json` (null = türün
  varsayılanı, 5b), `bridge_enabled`, `last_scan_at`. Soft delete yok; klasör kaldırmak satırı siler (log'lu).
  Aynı klasör iki projeye bağlanamaz: karşılaştırma `folderKey` ile (sondaki ayraç atılır, `/` → `\`, büyük/küçük harf
  duyarsız), çünkü Windows yolları öyle. DB'deki unique index düz metin üzerinde, asıl kontrol sorgu katmanında.
  5d eki: `image_dirs_json` (zaman makinesi klasörleri).
- `sessions` (5a): `project_id`, `task_id` (null olabilir), `started_at`, `ended_at` (null = sürüyor), `left_off`,
  `next_step`, `source` (`taha`/`claude_code`), `external_id` (`<jsonl oturum id>:<aralık başlangıcı ms>`, unique, 5b),
  `files_json` (değişen dosyalar + alan, 5b), soft delete. **Tüm projelerde aynı anda en fazla bir açık oturum**: DB
  kısıtı değil, `startSession` başka projede süren oturum varsa hata verir (arayüz önce onun kapanışını açar).
  Kapanış `durationMin` alabilir (4 saatten uzun oturumda gerçek süre; bitiş şimdiyi geçmez) ve projenin `next_step`'ini
  aynı grupta günceller. "Oturumu at" satırı çöp kutusuna atar. Açma, kapama, atma loglanır; otomatik oturumlar (5b)
  `scan` aktörüyle. 5d eki: `shot_media_id` (kapanışta yapıştırılan görüntü).
- `parking` (5a): `project_id`, `text`, `source` (`shortcut`/`app`/`dump`/`bridge`), `status`: `waiting` → `converted`
  (aynı grupta görev oluşturulur, `task_id` dolar) ya da `dismissed`; ikisinde de `resolved_at` dolar. Sadece bekleyen
  öğe çözülür. Geri alma öğeyi yeniden `waiting` yapar, çevrilmiş görevi çöp kutusuna atar. Soft delete.
Tarama tabloları (5b, `0008_scan`) tarama verisidir: soft delete yok, satır başına log yok; her klasör taraması
`activity_log`'a `scan` aktörüyle tek özet satırı yazar. `folder_id` FK'leri `ON DELETE CASCADE` (klasör kaldırılınca
tarama verisi gider). Çöp kutusundaki projenin klasörü yeni projeye geçerse `commits`/`code_todos.project_id` de geçer.
- `commits` (5b): `project_id`, `folder_id`, `hash` (klasörde unique; tekrar gelen yok sayılır), `message`, `author`,
  `committed_at`, `areas_json` (alan → dosya sayısı), `files_json` (yol, ekleme, silme). İlk tarama HEAD'in tüm geçmişi,
  sonra son bilinen commit'in 14 gün öncesinden beri.
- `code_todos` (5b): `project_id`, `folder_id`, `key` (yol + etiket + metin; satır numarası kimliğe girmez, klasörde
  unique), `path`, `line`, `text`, `tag` (TODO/FIXME/HACK), `first_seen_at`, `resolved_at` (kaybolunca dolar, yeniden
  görünürse boşalır), `task_id`. Sadece Unity (`Assets/**/*.cs`) ve Yazılım (kaynak uzantıları) taranır; tırnak
  içindeki yorum işaretleri sayılmaz.
- `scan_snapshots` (5b): `folder_id`, `scanned_at`, `summary_json` (`SnapshotSummary`: commit'lenmemişler + alanları +
  en eski mtime, Unity sürümü / sahneler / yapı sahneleri / script ve satır sayısı, açık not sayısı, envanter dosya
  sayısı, `latest_mtime`, tarama sonucu; 5d'de GDD sayımları), `inventory_json` (git'siz klasörde yol→boyut/mtime/hash;
  hash sadece bilinen dosyanın boyutu ya da mtime'ı değişince). Klasör başına son 30'u tutulur.
- Sessizlik (liste, radar): son oturum, son commit ve son taramadaki `latest_mtime`'ın en yenisi (gelecek zaman kırpılır).
- `milestones` (5c): `project_id`, `title`, `description`, `target_date` (`YYYY-MM-DD`), `sort`, `criteria_json`
  (`[{id,text,done,taskId}]`), `done_at`, soft delete.
- `tasks` ekleri (5c): `kanban_status` (`todo`/`doing`/`testing`/`done`; null = proje dışı görev), `severity`
  (`critical`/`major`/`minor`), `repro_steps`, `milestone_set_at` (kapsam ölçer), `source` (`taha`/`park`/`playtest`/
  `todo`/`claude_code`), `source_id`. `status = done` ↔ `kanban_status = done` aynı yazımda senkron. Mevcut `project_id`,
  `milestone_id` kolonlarına FK eklenmez (SQLite tabloyu yeniden kurmak ister); bütünlük sorgu katmanında.
- `playtest_feedback` (5c): `project_id`, `tester`, `received_on`, `raw_text`, soft delete.
- `playtest_points` (5c): `feedback_id`, `text`, `stems` (hesaplanmış kök kümesi, boşlukla), `cluster_id`, `locked` (elle yerleşti).
- `playtest_clusters` (5c): `project_id`, `label`, `task_id`, soft delete.
- `project_docs` (5d): `project_id`, `parent_id`, `sort`, `title`, `body_md` ya da `source_path` (bağlı dosya, salt okunur),
  `kind` (`page`/`adr`/`gdd`), `ai_open` (Claude Code'a açık), soft delete. FTS: `notes_fts` benzeri `project_docs_fts`.
- `project_shots` (5d): `project_id`, `media_id` (projede unique), `taken_on`, `taken_at` (gün içi sıra), `source` (`editor`/`folder`/`session`),
  `source_path`, `starred`, soft delete.
- `project_log_notes` (5d): `project_id`, `day`, `kind` (`note`/`devlog`), `body_md`, soft delete.
- `assets` (5d): `project_id`, `media_id` ya da `external_path`, `kind`, `title`, `doc_id`, `task_id`, soft delete.
  5d'nin hepsi `0010_docs` (geri dönüş `down/0010_docs.down.sql`). Klasörden alınan kareler tarama verisidir
  (satır başına log yok); yapıştırma, yıldız, silme, klasör bağlama ve varlık yazımları loglanır. Yaratıcı projede
  klasör dosyaları `sm-file://f/<klasör id>/<yol>` ile gösterilir (sadece bağlı klasörün içi, görsel/ses/PDF).

**Okul** (ayrıntı `docs/OKUL.md`, `0011_school`)
- `terms` (tek `active`), `courses` (ton, kredi, `attendance_limit_json`, `letter_table_json` null = varsayılan,
  elle `letter`, `target_letter`, `sort`), `course_slots` (hafta günü + dakika; soft delete yok, log'lu silinir),
  `instructors`, `instructor_notes` (hocanın bütün derslerinde görünür), `course_weeks` (dönem hafta sayısı kadar satır;
  tarih hesaplanır), `topics` (`week_no`, `emphasized`), `grade_components` (ağırlık + tek `score`; ayrı `grades` yok),
  `exams` (`component_id`, `week_from/to` kapsam, `review_md`, `unfit_min`), `exam_topics` (PK sınav+konu, `level` 0–3,
  `estimate_min`), `study_blocks` (onaylı plan: `planned`/`done`/`missed`), `assignments` (`reminder_id`: 48 sa önce),
  `attendance` (slot + gün unique, süre saklanır), `course_materials` (media), `note_flags` ("anlamadım").
- Çöpe atılabilenler tek kanalla: `school:delete` / `school:restore` (dönem dersleriyle aynı anlı döner).
- `schedule_blocks.kind` ekleri `class` / `study` (sadece TS enum; SQL değişmedi): `schedule:today` her okumada önce
  `sweepMissedStudy`, sonra aktif dönemin o günkü dersleri (iptal hariç) ve çalışma blokları sabit blok olarak girer.

**Zihin**
- `checkins` (Aşama 3c): `day` (`YYYY-MM-DD`, benzersiz; günde tek kayıt), `mood` / `energy` (1–5, null = girilmedi),
  `sleep_min` (uyku süresi dk), `note`. Bugün'deki Nasılsın? karosu her seçimde yazar; alanlar tek tek dolar. Silme
  arayüzü yok, soft delete de yok (alanı boşaltmak null yazmak). İlk yazım `create`, sonrakiler 10 dk içinde tek
  `update` kaydında birleşir (`logUpdateMerged`).
- `journal_entries`, `decisions` (karar, beklenti, gözden geçirme tarihi, sonuç), `achievements` (türetilir, tablo gerekirse).

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

İki çalıştırıcı, tek arayüz (`main/ai/runner.ts` `AiRunner`; karar `docs/YEREL-LLM.md`):
**HIZLI** = yerel Qwen3.5-9B (`main/ai/localRunner.ts`, `node-llama-cpp`), **DERİN** = Taha'nın bilgisayarındaki
Claude Code, aboneliğiyle, `-p` modunda (`main/ai/claudeRunner.ts`; API anahtarı yok). İkisi de aynı kuralları
(`resources/ai-agent/CLAUDE.md`) ve aynı `girdi.md`'yi alır. Akışı `main/ai/jobs.ts` (`processDumps`) yürütür.

1. **Paket (algoritma):** "AI ile İşle" → dökümler çalıştırıcıya göre gruplanır (eki olan döküm HIZLI seçilse de
   DERİN'e gider; `domain/aiInput.splitByModel`), her grup bir `ai_jobs` satırı ve `ai/jobs/<id>/` klasörü olur:
   - `girdi.md` (`domain/aiInput.buildJobInput`): bugünün tarihi ve önümüzdeki 7 günün adları, profil özeti (ayar
     `aiProfile`), aktif projeler (ad, id, sıradaki adım, açık kilometre taşı), aktif dönemin dersleri (ad, id, yaklaşan
     sınavlar), son 10 not başlığı, işlenecek döküm öğeleri (id, yazıldığı gün/saat, ekler). Bağlam en fazla ~3.000
     token; aşılınca notlar, sonra dersler, sonra projeler sondan düşer (dökümler kırpılmaz). Pakette görünmeyen id
     bilinmez sayılır. "AI'a kapalı" notlar ve AI'a kapalı koleksiyonlardaki notlar hiç okunmaz (`db/aiContext.ts`).
   - `kurallar.md`: o işte kullanılan kuralların kopyası (adı CLAUDE.md değil, Claude Code kendiliğinden yüklemesin).
   - `media/`: dökümdeki resim ve PDF'lerin kopyaları.
2. **Çağrı:**
   - HIZLI: model ilk işte yüklenir, uygulama kapanana kadar bellekte kalır (`will-quit`'te bırakılır). Kurallar sistem
     talimatı, `girdi.md` mesaj; çıktı `domain/changesGrammar.ts`'teki JSON şemasıyla grammar'a zorlanır, düşünme
     kapalı. Aynı anda tek üretim.
   - DERİN: `claude -p <talimat> --output-format json --model <aiDeepModel> --system-prompt <kurallar>
     --json-schema <changesSchema'dan> --tools Read --permission-mode dontAsk --safe-mode --restricted
     --strict-mcp-config --no-session-persistence`, `cwd = iş klasörü`. `--safe-mode` CLAUDE.md, hook, eklenti, MCP
     yüklemez; `--restricted` okumayı iş klasörüne kapatır. `claude.exe` ayar `aiClaudePath`'ten, yoksa PATH ve
     `~/.local/bin`'den bulunur. Zaman aşımı 5 dakika; iptalde süreç ağacı öldürülür.
   - Ham çıktı `cikti.json`'a yazılır. İptal ya da hata: iş `cancelled`/`failed`, dökümler bekliyor'a döner. Açılışta
     `running` kalmış iş (uygulama iş sürerken kapandı) `failed` olur (`recoverStaleJobs`).
3. **Doğrulama (algoritma):** Çıktıdaki JSON `changesSchema` (zod) ile doğrulanır. Geçersiz işlemler tek tek reddedilir ve
   işe not düşülür; geçerliler `proposals`'a yazılır. Hiç geçerli işlem yoksa iş "başarısız" olur ve dökümler bekliyor'a döner.
4. **Onay (Taha):** Onay Kutusu'nda gösterilir. Onaylanan her öneri tek bir DB transaction'ında uygulanır ve `activity_log`'a yazılır.
5. **Geri alma:** `activity_log`'daki önceki değerle ters işlem. Uygulayıcı (`main/ai/apply.ts`) mevcut yazma fonksiyonlarını
   `withActivityContext('ai', groupId)` altında çağırır: bütün kayıtlar `actor = ai` ve önerinin tek grubuyla düşer.
   `undoGroup` (`db/undo.ts`) grubu tersten işler: oluşanlar çöp kutusuna, değişen kolonlar eski değerine; arada Taha aynı
   kolonu değiştirdiyse geri alma reddedilir.

Şema: `src/shared/schemas/ai.ts` (`operationSchema`, dış kabuk `changesEnvelopeSchema`); doğrulama `domain/changes.ts`
(işlemler tek tek, girdide olmayan id reddedilir, kapsanmayan döküm "atlandı"); iş ve öneriler `db/ai.ts`.

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
    { "op": "create_exam", "sourceDumpIds": ["..."], "courseId": "...", "title": "Vize", "date": "2026-11-02", "time": "10:30", "weekFrom": 1, "weekTo": 7 },
    { "op": "set_project_next_step", "sourceDumpIds": ["..."], "projectId": "...", "text": "..." },
    { "op": "add_instructor_note", "sourceDumpIds": ["..."], "courseId": "...", "text": "..." },
    { "op": "import_term", "sourceDumpIds": ["..."], "name": "2026-2027 Bahar", "startDate": "2027-02-15", "endDate": null, "weekCount": 14 },
    { "op": "import_course", "sourceDumpIds": ["..."], "name": "Veri Yapıları", "code": "BIL201", "instructor": "Dr. Öğr. Üyesi Ayşe Kaya",
      "slots": [ { "weekday": 1, "start": "09:00", "end": "10:50", "room": "D-201" } ] }
  ],
  "unprocessed": [ { "dumpId": "...", "reason": "Hangi derse ait olduğu belirsiz" } ]
}
```

**Ders programı** (4e-2, iş türü `schedule_import`; Okul > Programdan doldur ya da Döküm'deki program fotoğrafı):
`import_term` / `import_course` id taşımaz; hedef dönem ve dersin yeni mi güncelleme mi olduğu uygulamada bulunur
(`domain/school/scheduleImport`: dönem adla, ders kodla sonra adla, hoca unvansız). Önizleme (`db/inbox.ts`
`schedulePreview`) ve uygulayıcı aynı fonksiyonları kullanır. Ders onaylanınca işin bekleyen dönem önerisi aynı grupla
uygulanır (`db/ai.ts`).

Ajanın kuralları `resources/ai-agent/CLAUDE.md`'dedir. Oraya yazılan her kural `changesSchema` ile tutarlı olmalı.

**Haftalık değerlendirme** (Zihin, Pazar): aynı akış, tür `weekly_review`; çıktı tek bir `create_note` (koleksiyon "Haftalık") ve
en fazla 3 `create_task` önerisi. Girdisi algoritmayla hazırlanan haftalık istatistik özetidir, ham notlar değil.

## Hatırlatmalar

Uygulama açıkken ana süreç (`src/main/reminderTimer.ts`) dakika başlarında ve uykudan dönüşte `reminders`'ı kontrol
eder (`domain/recurrence.sweepReminders`), zamanı gelenler için Electron bildirimi gösterir; bildirime tıklanınca pencere
öne gelir ve Bugün açılır (`nav:today` olayı). Açılıştaki ilk kontrol de aynı kuralla çalışır: 10 dakikadan az
gecikmiş olan yine çalar, daha eskisi `missed_at` alır ve Bugün'ün üst çubuğunda "N hatırlatma kaçtı · Bugüne al"
rozetiyle gösterilir. Değişiklikler renderer'a `reminders:changed` olayıyla bildirilir (`window.api.on`).
