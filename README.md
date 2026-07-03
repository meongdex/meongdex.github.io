# Meongdex

> Temukan. Kasih Makan. Koleksi.

Meongdex adalah PWA (Progressive Web App) bergenre **berburu &amp; memberi makan kucing sungguhan di dunia nyata**, terinspirasi Pokemon GO tapi objeknya kucing asli. Pemain menemukan kucing di sekitarnya, memberi makan lewat interaksi sederhana, memotret kucing tersebut, lalu kucing itu masuk ke koleksi permanen sebagai **kartu kucing** bergaya polaroid di "Meongdex" milik pemain.

## Tagline
Temukan. Kasih Makan. Koleksi.

---

## Status Fase

| Fase | Status | Catatan |
|------|--------|---------|
| Fase 1 — MVP Inti | Selesai | Onboarding, beranda, alur temukan->makan->foto->verifikasi AI->kartu->Meongdex, persistensi IndexedDB, offline shell. |
| Fase 2 — PWA + Landing + APK | Selesai | Landing page lengkap (hero+fitur+screenshot+cara install+FAQ), PWA installable (manifest+SW+beforeinstallprompt), halaman instruksi APK. File APK siap-pakai menunggu satu kali generate via PWABuilder (lihat asumsi #12). |
| Fase 3 — Fitur lanjutan | Belum dimulai | Menyusul di percakapan berikutnya. |

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
- Tidak ada data yang diunggah ke server mana pun di Fase 1.
- Verifikasi AI dijalankan **di browser pemain**, bukan di cloud.
- Pemain bisa menghapus semua data kapan saja via Pengaturan > Hapus semua data.
- Pemain bisa mengekspor Meongdex sebagai JSON (cadangan) via Pengaturan.

---

## Lisensi & atribusi

Kode & aset Meongdex dibuat untuk proyek ini. Maskot "Si Oren" dan seluruh ikon SVG adalah karya asli (line-icon, 2px, sudut membulat). Tidak memakai emoji atau aset berlisensi pihak ketiga.

---

_Catatan: README diperbarui di setiap akhir fase._
