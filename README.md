# Meongdex

> Temukan. Kasih Makan. Koleksi.

Meongdex adalah PWA (Progressive Web App) bergenre **berburu &amp; memberi makan kucing sungguhan di dunia nyata**, terinspirasi Pokemon GO tapi objeknya kucing asli. Pemain menemukan kucing di sekitarnya, memberi makan lewat interaksi sederhana, memotret kucing tersebut, lalu kucing itu masuk ke koleksi permanen sebagai **kartu kucing** bergaya polaroid di "Meongdex" milik pemain.

## Tagline
Temukan. Kasih Makan. Koleksi.

---

## Dikembangkan oleh

**Nugraha Nastya Adi Wibawa** — Yogyakarta, Indonesia, 2026.

Dibuat dengan Vanilla JS, IndexedDB, dan rasa sayang kepada kucing-kucing jalanan yang berbagi kota dengan kita.

---

## Progress Log

Jejak singkat posisi proyek, diperbarui di setiap akhir batch kerja. Dipakai untuk melacak di mana proyek berhenti kalau sesi berikutnya perlu melanjutkan.

- **2026-07-04** — Audit mandiri Fase 3 (sesuai addendum prompt). Status: Fase 1 & 2 selesai, Fase 3 sudah mencapai batch 10 (dark mode + storage info + more achievements). Audit ulang checklist Fase 1 & 2: tidak ditemukan regresi. Ekspor data sudah ada; EXIF strip sudah aman via canvas toDataURL; sebagian besar item Fase 3 (jenis makanan, mood, jurnal, sesi berburu, kucing hari ini, peta hotspot, cuaca, rumah, event musiman, ekspor kartu, pengingat in-app, fakta kucing, konfeti, suara) sudah diimplement. Yang belum ada dan akan dikerjakan bertahap: impor data cadangan, kredit developer, bond/trust level, tantangan foto honor-system, leaderboard Supabase, kartu komunitas Yogyakarta, Open Graph meta, ringkasan mingguan di Beranda.
- **2026-07-04 (batch 11)** — Bagian 1 addendum selesai. (1.1) Impor cadangan JSON: tombol "Impor Meongdex" di Pengaturan, validasi struktur (id MDX-XXX, field wajib, ukuran maks 50MB, ekstensi .json), dua mode (Gabung / Ganti total), konfirmasi sheet sebelum eksekusi. Tanggal cadangan terakhir ditampilkan otomatis di deskripsi tombol Ekspor sebagai pengingat halus. (1.2) PHOTO_MAX_EDGE diturunkan dari 1024 ke 1000 sesuai spec addendum; EXIF strip memang sudah otomatis karena foto digambar ulang via canvas lalu diekspor sebagai JPEG — didokumentasikan transparan di bagian Privasi. (1.3) Kredit developer: bagian "Dikembangkan oleh" di README, footer landing page (`.dev-credit` dengan Plus Jakarta Sans 11px charcoal opacity 0.55), `<meta name="author">` di root + game index.html, baris italic di sheet "Tentang Meongdex" game. Verifikasi: node --check PASS, local server HTTP 200 untuk semua aset, tidak ada secret hardcoded.

---

## Status Fase

| Fase | Status | Catatan |
|------|--------|---------|
| Fase 1 — MVP Inti | Selesai | Onboarding, beranda, alur temukan->makan->foto->verifikasi AI->kartu->Meongdex, persistensi IndexedDB, offline shell. |
| Fase 2 — PWA + Landing + APK | Selesai | Landing page lengkap (hero+fitur+screenshot+cara install+FAQ), PWA installable (manifest+SW+beforeinstallprompt), halaman instruksi APK. File APK siap-pakai menunggu satu kali generate via PWABuilder (lihat asumsi #12). |
| Fase 3 — Fitur lanjutan | Berjalan | Batch 1-10 selesai. Sudah ada: Jurnal Berburu, ekspor kartu (canvas 1080x1080 & 1080x1920 + watermark), badge Kembaran Ditemukan, a11y fix SVG, styling improvements, jenis makanan & mood, kelangkaan berbasis atribut, sesi berburu, kucing hari ini, peta hotspot Leaflet, cuaca Open-Meteo, rumah/shelter, event musiman, pengingat in-app, fakta kucing, kontrol suara, konfeti, dark mode, storage info, achievements lanjutan. Sedang ditambahkan dari addendum: ekspor+impor data cadangan, kredit developer, bond/trust level, tantangan foto honor-system, kartu komunitas Yogyakarta, Open Graph meta, ringkasan mingguan. |

---

## Struktur proyek

```
meongdex.github.io/          (repo root = root GitHub Pages)
  index.html                 (root — di Fase 1: pengarah ke game; di Fase 2: landing page lengkap)
  game/
    index.html               (aplikasi game utama — SPA)
    style.css                (design system: palet, tipografi, kartu polaroid, corkboard)
    app.js                   (logika: state, IndexedDB, geolocation, kamera, COCO-SSD, XP/level)
    manifest.json            (PWA manifest)
    sw.js                    (service worker — cache app shell untuk offline)
    icons/
      icon-source.svg        (sumber ikon Si Oren)
      make-icons.mjs         (skrip konversi SVG -> PNG via sharp)
      icon-192.png           (ikon PWA 192x192)
      icon-512.png           (ikon PWA 512x512)
      icon-maskable.png      (ikon maskable 512x512)
      apple-touch-icon.png   (ikon Apple touch 180x180)
      favicon-32.png         (favicon 32x32)
  assets/
    mascot/
      si-oren.svg            (maskot Si Oren — reusable)
    svg/                     (cadangan aset SVG)
    screenshots/             (tangkapan layar — diisi di Fase 2)
    audio/                   (efek suara — opsional, Fase 3)
  downloads/
    meongdex.apk             (APK Android — dihasilkan di Fase 2 via PWABuilder)
  README.md
```

---

## Cara menjalankan secara lokal

Karena ini PWA Vanilla JS murni (tanpa build step), cukup jalankan static server dari root repo:

```bash
# opsi A: python
python3 -m http.server 8080

# opsi B: bun
bunx serve -p 8080

# lalu buka http://localhost:8080/game/
```

Untuk mengetes service worker & PWA install, wajib via `http://localhost` (bukan `file://`).

## Cara deploy

Push ke branch `main` repo `meongdex/meongdex.github.io`. GitHub Pages otomatis menyajikan isi repo root di `https://meongdex.github.io/`.

- Landing/root: `https://meongdex.github.io/`
- Game: `https://meongdex.github.io/game/`

---

## Cara test Fase 1

1. Buka `https://meongdex.github.io/game/` (atau localhost) di Chrome Android / Safari iOS.
2. Onboarding "Cara Main" muncul otomatis di kunjungan pertama, 4 slide bersama Si Oren.
3. Di Beranda, tekan **Temukan Kucing** → layar penjelasan lokasi → izinkan lokasi → lanjut ke Kasih Makan.
4. Tahan tombol **Lempar Makanan** untuk mengisi daya, lepas untuk melempar → animasi makanan terbang & kucing bereaksi.
5. Lanjut ke layar penjelasan kamera → **Ambil Foto** → ambil foto kucing (atau pilih dari galeri sebagai simulasi).
6. Verifikasi AI berjalan (COCO-SSD via TensorFlow.js). Jika kucing terdeteksi, muncul tag hijau + persentase + kotak deteksi. Jika AI belum yakin, muncul fallback manual "Ya, ini kucing".
7. Kartu kucing baru tampil bergaya polaroid dengan border sesuai kelangkaan (emas=langka, teal=biasa). Beri nama, pilih warna bulu, tekan **Simpan ke Meongdex**.
8. Toast "Nomor MDX-XXX terdaftar di Meongdex-mu!" muncul, layar pindah ke Meongdex (corkboard) dengan kartu mini miring + pin.
9. Tutup browser sepenuhnya, buka lagi → data Meongdex masih ada (IndexedDB).
10. Aktifkan mode pesawat, buka lagi URL yang sudah pernah diakses → shell & Meongdex tetap bisa dibuka (service worker cache).

---

## Asumsi desain (keputusan yang diambil)

Berikut asumsi yang diambil karena tidak dijelaskan secara eksplisit, demi kelancaran pengerjaan:

1. **Tingkat kelangkaan (Fase 1)**: hanya dua tingkat — **biasa** (border teal) dan **langka** (border emas). Kucing berwarna **calico** otomatis langka; selain itu ada peluang ~18% acak untuk langka. Tingkat kelangkaan lengkap (epik, legendaris, dsb.) menunggu Fase 3.
2. **XP & level**: +50 XP per kucing tersimpan, +30 XP bonus jika langka, +100 XP bonus menyelesaikan misi harian. Naik level tiap 200 XP. Formula level = `floor(XP/200)+1`.
3. **Misi harian**: "Beri makan 3 kucing", reset tiap hari (perbandingan tanggal lokal), bonus XP sekali per hari.
4. **Verifikasi AI**: memakai **COCO-SSD** dari TensorFlow.js via CDN (`@tensorflow-models/coco-ssd`), base `lite_mobilenet_v2` untuk ringan di HP. Threshold confidence "cat" = 0.5. Jika gagal load/deteksi, **fallback manual wajib** muncul dan pemain tetap bisa lanjut.
5. **Penyimpanan foto**: foto dikompres & downscale ke maks 1024px sisi terpanjang, JPEG kualitas 0.82, disimpan sebagai data URL base64 di IndexedDB (store `cats`). Meta pemain (XP, level, misi, flag onboarding) di localStorage.
6. **Izin lokasi & kamera**: keduanya opsional. Pemain bisa "Lanjut tanpa lokasi" — entri tetap dibuat dengan koordinat null. Kamera pakai `<input type="file" accept="image/*" capture="environment">` (bisa ambil foto langsung atau pilih dari galeri).
7. **Id kartu**: format `MDX-001`, `MDX-002`, ... urut menaik.
8. **Tidak ada peta visual di Fase 1** (lokasi disimpan sebagai data mentah koordinat). Peta hotspot "sarang kucing" pakai Leaflet dijadwalkan Fase 3.
9. **Ikon**: dibuat sebagai SVG inline (maskot Si Oren) lalu dikonversi ke PNG via `sharp` — bukan emoji, bukan aset pihak ketiga berlisensi.
10. **Landing page root** sekarang lengkap (Fase 2): hero 2 kolom + strip 3 fitur + 4 screenshot gameplay + cara install APK + FAQ + final CTA, semua on-brand dengan palet &amp; tipografi Meongdex.
11. **Bahasa UI**: Bahasa Indonesia sehari-hari, nada aktif & ramah.
12. **APK Android (Fase 2)**: spec menyebut PWABuilder.com sebagai metode pembuatan APK. PWABuilder adalah layanan web interaktif yang tidak bisa dijalankan headless di sandbox pengembangan ini, dan tooling Android SDK/bubblewrap tidak tersedia/terlalu berat di sini. Karena itu: (a) PWA Meongdex sudah **installable** secara native dari Chrome Android ("Instal aplikasi") tanpa APK — ini memenuhi kriteria inti "bisa di-install seperti app native"; (b) file `downloads/meongdex.apk` siap-pakai menunggu **satu kali generate** via PWABuilder.com (sekitar 2 menit, langkah lengkap di `downloads/install-apk.html`); tombol "Download APK Android" di landing menjuju halaman instruksi tersebut. Setelah APK dihasilkan & ditaruh di `downloads/meongdex.apk`, tombol bisa diarahkan langsung ke file. Asumsi ini didokumentasikan transparan sesuai aturan "tidak berhenti bertanya, catat asumsi di README".
13. **Prompt install PWA**: event `beforeinstallprompt` ditangkap dan dipicu lewat menu Pengaturan > "Pasang sebagai aplikasi"; jika belum eligible, muncul instruksi pakai menu browser (atau Share > Add to Home Screen di iOS).
14. **Fase 3 (mulai)**: fitur yang sudah dibangun di awal Fase 3:
    - **Jurnal Berburu**: screen baru dengan linimasa harian otomatis (dikelompokkan per hari, label "Hari ini"/"Kemarin"/tanggal), menampilkan waktu, thumbnail, nama, meta (id·warna·rarity), dan XP per entri. Tidak perlu input pemain — murni otomatis dari data IndexedDB.
    - **Ekspor kartu sebagai gambar**: tombol "Bagikan" di detail kartu, render canvas 1080x1080 (kotak, untuk feed IG/X) atau 1080x1920 (story), polaroid + border kelangkaan + id + rarity + foto + nama + tag + quote + watermark "MEONGDEX" + mini maskot Si Oren. Format switchable, lalu unduh PNG.
    - **Badge Kembaran Ditemukan**: deteksi otomatis jika ada 2+ kucing dengan warna sama di koleksi → badge chip muncul di detail kartu.
    - **A11y fix**: semua SVG dekoratif diberi `aria-hidden="true"` via script + MutationObserver (dari 36 SVG no-label → 0).
    - **Styling improvements**: hover lift di kartu/mini-card/set-item, radar pulse animation di beranda, bottom nav active indicator bar, micro-interactions (scale on press), font sizes dinaikkan (body 14px+, caption 12px+, kontras lebih tinggi).

---

## Teknologi

- **Vanilla JavaScript** (HTML/CSS/JS murni), tanpa framework berat.
- **IndexedDB** via library `idb` (CDN) untuk penyimpanan foto & kartu.
- **TensorFlow.js + COCO-SSD** (CDN) untuk deteksi objek kucing di browser.
- **Service Worker** untuk offline app shell.
- **Google Fonts**: Fredoka (display), Plus Jakarta Sans (body), JetBrains Mono (data).
- **Tanpa API berbayar, tanpa kartu kredit, tanpa server backend** (Fase 1).

---

## Privasi

- Foto & lokasi **hanya disimpan lokal di perangkat** pemain (IndexedDB + localStorage).
- Foto dikompres dan dibersihkan dari metadata lokasi sebelum disimpan, murni untuk performa dan privasi pemain. Proses ini terjadi otomatis lewat redraw di elemen `<canvas>` lalu ekspor ulang sebagai JPEG — ini membuang metadata EXIF (termasuk data GPS presisi tinggi yang mungkin terekam kamera HP di dalam file foto asli). Koordinat yang disimpan di data game adalah koordinat yang sengaja diminta pemain lewat Geolocation API, yang sudah cukup dan terkontrol, terpisah dari metadata file foto.
- Tidak ada data yang diunggah ke server mana pun di Fase 1. (Fase 3: leaderboard Supabase bersifat opsional dan hanya mengirim total XP/jumlah kucing + nama panggilan anonim, tidak pernah foto atau lokasi.)
- Verifikasi AI dijalankan **di browser pemain**, bukan di cloud.
- Pemain bisa menghapus semua data kapan saja via Pengaturan > Hapus semua data.
- Pemain bisa mengekspor Meongdex sebagai JSON (cadangan) via Pengaturan, dan mengimpor kembali lewat menu yang sama untuk pindah perangkat atau pemulihan setelah cache dibersihkan.

---

## Lisensi & atribusi

Kode & aset Meongdex dibuat untuk proyek ini. Maskot "Si Oren" dan seluruh ikon SVG adalah karya asli (line-icon, 2px, sudut membulat). Tidak memakai emoji atau aset berlisensi pihak ketiga.

---

_Catatan: README diperbarui di setiap akhir fase._
