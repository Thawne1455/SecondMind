# Açık karar: Yerel LLM (Qwen) ile Claude Code

**Durum:** Taha düşünüyor (28 Eylül 2026). Karar verilene kadar Aşama 4 (AI akışı ve Onay Kutusu) bekliyor.
Karar verilince bu dosya "Karar" bölümüyle kapatılır; MIMARI.md (AI akışı), EKRANLAR.md (Döküm, Ayarlar > AI)
ve YOL-HARITASI.md (Aşama 4) güncellenir.

## Soru

AI işleri için Claude Code'u her seferinde çağırmak yerine uygulamanın içine ücretsiz, yerel bir model (Qwen) koyalım mı?

AI'ın bu uygulamadaki işleri (CLAUDE.md, değişmez kural 2): ham dökümü ayrıştırmak, serbest metinden özet çıkarmak,
resim/PDF okumak, haftalık değerlendirme. Sıralama, yerleştirme, arama gibi işler zaten algoritmayla yapılıyor.

## Donanım (Taha'nın bilgisayarı)

- NVIDIA RTX 4060 Laptop, 8 GB VRAM · 16 GB RAM · i7-13620H
- 7–8B model (Q4, yaklaşık 5 GB) VRAM'e tamamen sığar ve hızlı çalışır. 14B (yaklaşık 9 GB) sığmaz, yavaşlar.
  Pratik üst sınır 7–8B.

## Artıları

- **Tamamen yerel:** Dökümler, notlar ve Zihin kayıtları makineden çıkmaz; internetsiz çalışır. Projenin ilkesiyle uyumlu.
- **Mimari değişmez:** AI yine sadece `changes.json` önerisi üretir, zod doğrular, Onay Kutusu'nda Taha onaylar.
  Model kötü öneri üretse de veri bozulmaz.
- **Geçerli JSON garantisi:** llama.cpp çıktıyı JSON şemasına (grammar) zorlayabilir; Claude Code'da bu sadece rica edilebilir.
- **Hız:** Her iş için ayrı süreç başlatma yükü yok.
- **Ücretsiz**, kullanım sınırı yok.

## Eksileri

- **Türkçe ayrıştırma kalitesi:** Karışık bir dökümü ("cuma'dan önce Lineer Cebir quiz'ine 3. bölümü çalış, hocaya
  soru 4'ü sor") 7B model Claude kadar iyi ayrıştıramaz. Daha çok yanlış öneri, Onay Kutusu'nda daha çok düzeltme.
- **Görüntü okuma:** Qwen2.5-VL var, ama el yazısı Türkçe tahta fotoğrafında Claude'dan belirgin şekilde zayıf.
- **Uzun düşünme gerektiren işler** (haftalık değerlendirme) zayıf kalır.
- **Boyut:** Model dosyası yaklaşık 5 GB. Kurulum dosyasına gömülmez, ilk kullanımda veri klasörüne bir kez indirilir.

## Önerilen yol (Claude'un önerisi)

İkisi birlikte, tasarımdaki **HIZLI / DERİN** model seçimine oturtulur:

| Seçim | Model | Kullanım |
| --- | --- | --- |
| HIZLI (varsayılan) | Yerel Qwen 7–8B | Günlük döküm ayrıştırma, kısa özetler |
| DERİN (isteğe bağlı) | Claude Code | Tahta fotoğrafı, PDF, haftalık değerlendirme, Qwen'in karıştırdığı döküm |

- Model uygulamanın içinde çalışır (`node-llama-cpp`, CUDA destekli hazır derlemeler). Ollama gibi ayrı bir program kurulmaz.
  Uygulama kapanınca model de kapanır; "arka plan süreci yok" kuralı (CLAUDE.md kural 3) korunur.
- AI çalıştırıcı bir arayüzün arkasına alınır (`AiRunner`: yerel / Claude Code). İş paketi, doğrulama ve Onay Kutusu
  ikisinde de aynı kalır.
- Claude Code tamamen çıkmaz: Aşama 5e'deki **Claude Code köprüsü** (proje oturum raporları) ayrı bir özelliktir ve Claude Code'a bağlıdır.

## Karar vermeden önce önerilen deneme (yarım gün)

1. Qwen 7–8B'yi (ve görüntü için Qwen2.5-VL-7B'yi) indir, `node-llama-cpp` ile ana süreçte çalıştır.
2. Taha'nın gerçek 5–10 dökümü + 1 tahta fotoğrafıyla, `changes.json` şemasına zorlanmış çıktı al.
3. Önerileri, aynı girdide Claude Code çıktısıyla yan yana göster. Aşama 4'ün "bitti sayılır" ölçütüyle değerlendir:
   5 karışık döküm (metin + tahta fotoğrafı) doğru önerilere dönüşüyor mu?

## Taha'ya açık sorular

1. Önce deneme mi, yoksa doğrudan "HIZLI = Qwen, DERİN = Claude" planı mı?
2. Deneme için gerçek döküm örnekleri var mı? (Yoksa seed'deki 9 döküm kullanılır.)
3. Claude Code isteğe bağlı olarak kalsın mı, yoksa tamamen yerel mi olsun?
