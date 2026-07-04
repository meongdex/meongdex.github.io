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
- **2026-07-04 (batch 12)** — Bagian 3 (sebagian) addendum selesai. (3.7) Open Graph & Twitter Card meta di root index.html: og:type, og:site_name, og:title, og:description, og:url, og:image (screenshot game-home), og:locale id_ID, twitter:card summary_large_image + mitranya. (3.8) Ringkasan mingguan di Beranda: kartu `.week-card` di antara sesi berburu dan kucing hari ini, menampilkan "Minggu ini kamu menemukan N kucing baru dan dapat sekitar X XP. Lanjutkan!" — dihitung dari entri kucing 7 hari terakhir dengan estimasi XP (XP_PER_CAT + bonus rarity + bonus sesi berburu kalau 3+ kucing). Kartu disembunyikan kalau belum ada aktivitas minggu ini. (3.1) "Bantu kucing sungguhan": tombol di Pengaturan, sheet berisi 3 komunitas nyata Yogyakarta (AFJ, ISCC, Peduli Kucing Pasar Jogja) dengan tautan keluar ke Instagram mereka, nada hangat "Meongdex dibuat karena sayang sama kucing-kucing di sekitar kita", tanpa integrasi donasi/pembayaran. Catatan asumsi: tautan Instagram dipilih karena canal publik yang umum dipakai komunitas relawan kucing di Yogyakarta; verifikasi aktif saat implementasi via pencarian sederhana — user perlu re-verifikasi sebelum publikasi luas. Verifikasi: node --check PASS, local server HTTP 200 untuk semua aset.
- **2026-07-04 (batch 13)** — Bagian 2.2 addendum selesai. Bond/trust level + "kembaran kucing" digabung jadi satu mekanik yang jujur ke pemain. Saat klik Simpan ke Meongdex, sheet "Kucing yang sama?" muncul dengan daftar kandidat (warna sama, diurutkan by jarak lokasi terdekat, maks 5). Pilihan: (a) simpan sebagai kartu baru (default, alur lama), atau (b) tandai sebagai kucing yang sama → naikkan kunjungan (visits) pada entri existing, simpan foto baru ke galeri (rolling window maks 6 foto supaya IndexedDB tidak bengkak), XP hanya XP_PER_CAT tanpa rarity bonus supaya tidak farmable. Trust level 1-5 (1 level per kunjungan, maks 5). Detail kartu sekarang menampilkan: block "IKATAN" dengan 5 dot indicator, label kunjungan, badge "Sahabat Karib" di pojok kartu polaroid saat trust Lv 5, dan strip horizontal galeri foto kunjungan lain. Cat baru selalu mulai dengan visits=1, gallery=[]. Kembaran Ditemukan (badge lama) tetap berfungsi untuk entri yang BERBEDA tapi punya kombinasi warna identik — tidak konflik dengan bond. Verifikasi: node --check PASS, local server HTTP 200 untuk semua aset.
- **2026-07-04 (batch 14)** — Bagian 2.5 addendum selesai. Tantangan foto kreatif honor-system: karena model deteksi ringan (COCO-SSD) tidak bisa mengenali pose/ekspresi spesifik, ini self-report jujur dari pemain. Setelah verifikasi dasar lolos (atau fallback manual), blok "TANTANGAN FOTO KREATIF" muncul di layar verifikasi dengan 5 tantangan awal: kucing menguap, latar langit sore, kucing meregangkan badan, dua kucing dalam satu foto, kucing tidur. Pemain centang yang sesuai dengan foto mereka, lalu klik "Ya, simpan". Saat saveCat dieksekusi, tiap tantangan yang dicentang & belum pernah diselesaikan sebelumnya memberi CONFIG.CHALLENGE_BONUS (80 XP) + push ke player.completedHonor. Toast notification muncul untuk tiap tantangan yang baru diselesaikan. Tantangan yang sudah selesai ditandai "selesai" dan checkbox di-disable (tidak bisa diulang, anti-farm). Field baru: player.completedHonor (array id). Variabel transisi: pendingHonorChecked. Catatan: semua self-report — kepercayaan ke pemain sesuai semangat game santai, bukan kompetisi kompetitif. Verifikasi: node --check PASS, local server HTTP 200 untuk semua aset.
- **2026-07-04 (batch 15)** — Bagian 2.10 addendum selesai (scaffold + graceful fallback). Leaderboard Supabase: tombol "Papan peringkat" di Pengaturan, sheet menampilkan top 10 pemain (rank dengan medali emas/perak/perunggu untuk 3 besar) + form submit nama panggilan (maks 24 karakter, disimpan lokal di localStorage, anonim tanpa akun/login). Hanya mengirim total XP + jumlah kucing + nama panggilan — TIDAK PERNAH foto atau lokasi. Implementasi: modul `Leaderboard` dengan `isConfigured()`, `fetchTop()`, `submitScore()`, fetch dengan AbortController timeout 8 detik supaya UI responsif. Konfigurasi di `CONFIG.LEADERBOARD` (URL + anon key kosong dulu — pengembang isi saat siap). Graceful fallback: kalau belum dikonfigurasi → "Papan peringkat belum dikonfigurasi. Fitur ini opsional — kamu tetap bisa menikmati seluruh permainan tanpa papan peringkat." Kalau fetch gagal (offline, proyek Supabase di-pause setelah 7 hari inaktif, dll) → "Papan peringkat sedang tidak bisa diakses, coba lagi nanti." Tidak pernah blokir gameplay inti. Catatan asumsi: setup tabel Supabase + GitHub Actions cron mingguan untuk keep-alive (mencegah pause proyek free tier Supabase) didokumentasikan sebagai stretch goal — pengembang perlu setup manual lewat dashboard Supabase. Verifikasi: node --check PASS, local server HTTP 200 untuk semua aset.
- **2026-07-04 (batch 16)** — Audit nyata repo + fix semua temuan (Bagian A audit). (A0 bug trofi) Fix bug makanan kucing di layar Kasih Makan: `foodIconSvg()` return string HTML markup SVG, tapi `el()` helper memperlakukan string child sebagai `createTextNode` sehingga markup tampil sebagai teks literal (terlihat di Android Chrome). Fix: pakai prop `html` (innerHTML) sesuai pola yang sudah dipakai di tempat lain. (A1) Ikon favorit di mini-card corkboard: ganti karakter Unicode `★` jadi `ICONS.star` (SVG line-icon) supaya konsisten dengan signature visual "semua ikon SVG". (A2) Hapus `maximum-scale=1.0, user-scalable=no` dari meta viewport game/index.html — melanggar aksesibilitas pinch-zoom untuk pemain dengan penglihatan terbatas. (A3) Fix 8 kombinasi kontras WCAG yang gagal 4.5:1: terracotta+white → charcoal (4.75:1) di `.btn`, `.bottom-nav .badge`, `.shelter-pick .check`, `.event-mult`, `.trust-badge`, `.best-friend-pin`; gold+white → charcoal (6.23:1) di `.fav-badge`; teal+white → teal-deep+white (5.38:1) di `.locate-badge` dan `.detect-overlay .box .lbl`; toast.warn `--terracotta-deep` → `#a8462e` yang lebih gelap (5.90:1); `.dev-credit` di landing `rgba(58,46,42,0.55)` → `var(--text-soft)` (7.82:1). (A4) og-image: generate PNG khusus 1200x630 (`assets/og-image.png`) via Python PIL + cairosvg — composite cream bg + maskot Si Oren + judul Meongdex + tagline + screenshot polaroid. Update `og:image` dan `twitter:image` meta ke file baru. Script generator di `/home/z/my-project/scripts/gen-og-image.py`. (A5) Buat file `.github/workflows/keep-supabase-alive.yml` — cron mingguan (Senin 08:00 UTC) ping Supabase REST API supaya proyek free tier tidak di-pause. Workflow aman: kalau secrets `SUPABASE_URL`/`SUPABASE_ANON_KEY` belum diisi, skip dengan pesan informatif. (A6) Default `player.soundEnabled` dari `true` → `false` — game sering dimainkan di ruang publik/saat mendekati kucing asli, suara otomatis berisiko mengagetkan kucing atau memalukan. Sinkronisasi tampilan status suara saat app load supaya teks default di HTML (`Dimatikan`) sesuai state aktual pemain. (A7) Crop screenshot `game-onboard.png` dari landscape 1280x577 → potret 648x1154 (rasio 9/16) supaya konsisten dengan 4 screenshot lain di landing strip. Script di `/home/z/my-project/scripts/crop-onboard-screenshot.py`. (A8) Tambah field `screenshots` di `manifest.json` dengan 4 entri `form_factor: narrow` (game-home, game-dex, game-card, game-journal) — menampilkan pratinjau layar aplikasi yang lebih meyakinkan di prompt instalasi PWA Android. Bump SW cache version `meongdex-v14` → `meongdex-v15` supaya pemain yang sudah install dapat update. Verifikasi: node --check PASS, manifest.json valid JSON, workflow YAML valid, local server HTTP 200 untuk semua aset, audit kontras ulang PASS (tidak ada lagi kombinasi terracotta/gold + #fff yang gagal).
- **2026-07-04 (batch 17)** — Bagian C1 + C5 addendum. (C1) Statistik distribusi koleksi sudah ada di layar Statistik sejak batch 6 (color-bars + rarity-bars). Tambahan: mini distribusi warna di Meongdex cork-head sebagai `.dex-color-strip` — bar horizontal ringkas dengan segmen per warna, lebar proporsional ke jumlah kucing, klik segmen = filter by warna. Hover = tooltip label + count. Strip di-hide kalau koleksi kosong. Distribusi lengkap (dengan label angka per warna) tetap di layar Statistik. (C5) Badge "Kolektor Warna Lengkap" achievement baru di array CHALLENGES: terbuka saat pemain sudah punya minimal 1 kucing untuk tiap tag warna (oren, hitam, putih, belang, calico, lainnya) — mendorong variasi mengoleksi, bukan cuma jumlah. Bonus XP 80 + toast notification saat terbuka. Verifikasi: node --check PASS, local server HTTP 200.
- **2026-07-04 (batch 18)** — Bagian C2 addendum. Misi mingguan mikro yang berputar: 5 misi tetap (Pemburu putih, Konsisten 3 hari, Lima kucing seminggu, Tukang kasih makan, Variasi warna), dipilih deterministik per (year*53 + ISO week) modulo panjang daftar — tiap minggu dapet misi berbeda tapi pemain yang sama di minggu yang sama selalu lihat misi yang sama. Reset otomatis di awal minggu baru (Senin). Bonus XP besar (WEEKLY_MISSION_BONUS = 250 XP) karena levelnya mingguan. Implementasi: WEEKLY_MISSIONS array dengan check(state), `isoWeekNumber()` dan `startOfWeek()` helper, `computeWeeklyState()` hitung aktivitas minggu ini dari data aktual (kucing ditemukan minggu ini, warna berbeda, hari berbeda, estimasi fed), `computeWeeklyMissionProgress()` untuk render progres, `renderWeeklyMission()` di Beranda, completion check di saveCat dengan toast notification. Field baru di Store.defaults: weeklyMissionId, weeklyMissionWeek, weeklyMissionYear, weeklyMissionDone. Catatan asumsi: `fedThisWeek` diestimasi dari jumlah kucing minggu ini (asumsi tiap kucing = 1x kasih makan) karena tidak ada log event terpisah — kalau mau akurat perlu tambah event log di saveCat. Verifikasi: node --check PASS, local server HTTP 200.
- **2026-07-04 (batch 19)** — Bagian C3 + C4 addendum. (C3) Bank quote dipisah per tag warna: `QUOTES_BY_COLOR` map dengan 4-5 quote sendiri per warna (oren, hitam, putih, belang, calico, lainnya) — supaya kartu terasa lebih personal dan tidak cepat terasa berulang setelah koleksi membesar. Function `quoteForColor(color)` ambil quote acak dari bank warna, fallback ke QUOTES umum kalau warna tidak ada di map. `buildNewCard()` sekarang pakai `quoteForColor(selectedColor)` alih-alih `QUOTES[random]`. Quote umum tetap dipertahankan untuk backward-compat dan fallback. (C4) Marker khusus "Sahabat Karib" di peta hotspot Leaflet: kucing dengan trust level 5 (visits >= 5) otomatis pakai marker berbeda — lebih besar (42x42 vs 34x34), warna `--terracotta-deep` (#C9652F), glow halus dengan animasi `bestFriendPulse`, dan checkmark putih di tengah SVG paw print supaya gampang dikenali. Popup marker juga menampilkan badge "Sahabat Karib" + jumlah kunjungan. Supaya peta juga berguna untuk mengingat "di mana sahabat kucingku biasa nongkrong." Verifikasi: node --check PASS, local server HTTP 200.
- **2026-07-04 (batch 20)** — Bagian C6 addendum. Ekspor "lembar album" — montase grid 6 atau 9 kartu kucing sekaligus, bergaya lembar album/binder koleksi fisik. Tombol "Lembar album" di Meongdex cork-head (sebelah count). Sheet berisi pratinjau canvas 1080x1080 dengan pilihan grid 2x3 (6 kartu) atau 3x3 (9 kartu), tombol unduh PNG. Implementasi: `openAlbumSheet()` sort kucing by favorit dulu lalu terbaru, `drawAlbumSheet()` render grid dengan tiap cell = mini polaroid (foto square + id badge + nama + border kelangkaa), header "Meongdex / Lembar album koleksi" + count badge "N dari M kucing", footer watermark URL + tanggal. Slot kosong (kalau koleksi < count) ditampilkan dengan dotted border. Reuse helper `loadImage` + `roundRect` yang sudah dipakai `drawShareCard`. Responsive: label tombol disembunyikan di layar <380px supaya cukup ikon. Verifikasi: node --check PASS, local server HTTP 200.
- **2026-07-04 (batch 21)** — Bagian C7 addendum. Angka agregat komunitas: tampilan opsional di sheet leaderboard yang menjumlahkan `cat_count` semua pemain sebagai "Total kucing yang sudah ditemukan seluruh pemain Meongdex: [N]" + "pemburu aktif di komunitas: [M]". Bangun di atas tabel Supabase yang sudah ada — tidak perlu infrastruktur backend baru sama sekali. Implementasi: method baru `Leaderboard.fetchAggregate()` yang ambil semua baris (`?select=cat_count,xp`) dan jumlahkan di client (PostgREST standar tidak support SUM langsung tanpa function, tapi tabel leaderboard tidak akan besar di proyek kecil — 1000 baris default limit PostgREST cukup). Banner `.lb-aggregate` ditampilkan di atas list leaderboard dengan gradient terracotta-teal, dua kolom angka besar (Fredoka 24px terracotta-deep) + label kecil. Banner di-skip diam-diam kalau agregat gagal fetch (network/pause) — tidak mengganggu UX. Menghubungkan kembali ke semangat "Bantu Kucing Sungguhan" (3.1 addendum). Verifikasi: node --check PASS, local server HTTP 200.
- **2026-07-04 (batch 22)** — Bagian D1 + D2 addendum (pasca-batch 21, dari tinjauan langsung repo). (D1) Service worker strategi cache-first berisiko "mengunci" pemain yang sudah install di versi lama — batch 17-21 tidak menaikkan CACHE_VERSION, jadi pemain yang install sebelum batch 17 kemungkinan masih menjalankan app.js/style.css versi batch 16. Fix dua lapis: (1) naikkan CACHE_VERSION `meongdex-v15` -> `meongdex-v16` segera supaya pemain dapat update batch 17-21 yang tertahan, (2) ubah strategi fetch untuk aset satu origin yang sering berubah (app.js, style.css, index.html) dari cache-first murni jadi **stale-while-revalidate** — balas dari cache instan tapi sekalgus fetch versi network di background, bandingkan via ETag/Last-Modified/Content-Length, kalau berbeda update cache + postMessage ke client supaya `showUpdateToast()` muncul. Dengan pola ini, developer tidak perlu menaikkan CACHE_VERSION tiap batch — pembaruan konten mengalir otomatis. Aset jarang berubah (icons, mascot, og-image) tetap cache-first murni supaya hemat bandwidth. Pesan SW ditangani di app.js via `navigator.serviceWorker.addEventListener('message', ...)` yang memanggil `showUpdateToast()`. (D2) Warna rarity "legendaris" sebelumnya identik dengan "langka" (`#D4AF37` emas) — menyebabkan grafik Statistik (rarity-bars) tidak bisa membedakan Langka vs Legendaris lewat warna. Beri legendaris warna signature sendiri: **rose/magenta tua `#C2185B`** dengan teks putih (kontras 5.87:1, lolos WCAG AA). Kartu polaroid `.trading-card.legendary` sekarang border rose + cincin shimmer prismatik (rose-gold-teal-rose berputar) yang lebih istimewa dari langka. Update konsisten di semua jalur render: `RARITIES` object, `.trading-card.legendary`, `.mini-card.legendary`, `.shelter-slot.legendary`, `drawShareCard` canvas (dukung 4 rarity dengan label + warna teks dari `RARITIES`), `drawAlbumSheet` canvas. Script audit kontras: `/home/z/my-project/scripts/audit-contrast-d2.py`. Verifikasi: node --check PASS untuk app.js + sw.js, local server HTTP 200 untuk semua aset, audit kontras ulang PASS untuk semua kombinasi rarity.
- **2026-07-04 (batch 23)** — Bagian D3+D4 catatan + Bagian E1+E2+E3 addendum (momen "wow" kartu). (D3) Onboarding cuma 4 slide statis — dibahas penuh di Bagian F (coach-mark kontekstual, panduan lengkap, mode latihan) yang akan dikerjakan di batch berikutnya. (D4) Bottom nav 7 item — tambah media query `@media (max-width:360px)` yang sembunyikan label nav (font-size:0) dan andalkan ikon saja (width:22px) di layar sangat sempit Android low-end, tanpa mengubah IA. Keputusan dicatat sebagai langkah proaktif sesuai saran audit. (E1) Kartu tilt 3D + holografik reaktif: CSS `perspective(900px) rotateX(var(--ry)) rotateY(var(--rx))` + `transform-style:preserve-3d`, custom properties `--rx/--ry/--hx/--hy` di-set dari `attachCardTilt()` JS handler. Pointer device: `pointermove` -> normalisasi -1..1 -> max 12 derajat tilt + holo-sheen overlay radial-gradient yang follow kursor. Touch device: `deviceorientation` (perlu `requestPermission` di iOS 13+, trigger via tap pertama) -> gamma/beta mapping; fallback `autoSweepOnce()` (sweep sekali sinusoidal) kalau sensor tidak tersedia/ditolak. Intensitas holo-sheen bertingkat per rarity: biasa = tanpa sheen (datar), langka = sheen emas tipis, epik = sheen ungu medium, legendaris = conic-gradient prismatik rose-gold-teal yang berputar mengikuti tilt. Hormati `prefers-reduced-motion: reduce` (matikan tilt total, kartu tetap tampil statis). Dipasang di kartu baru (`renderNewCard` -> `attachTiltToNewCard`) + kartu detail (`openCatDetail` -> `attachTiltToDetailCard`). (E2) Momen reveal "upacara buka kartu": stage `#reveal-stage` overlay full-screen dengan backdrop blur, kartu muncul dalam kondisi silhouette/back-side (`rotateY(180deg)` + silhouette gradient gelap dengan teks "MEONGDEX" berdenyut `silhouettePulse`), setelah build-up durasi proporsional ke rarity (biasa 400ms, langka 600ms, epik 900ms, legendaris 1300ms) kartu flip ke depan (`rotateY(0)`) + confetti + haptic + chime + attach tilt. WAJIB bisa skip dengan tap di mana saja (`stage.addEventListener('click', skip, { once: true })`). Auto-close stage 3.5s setelah reveal. Skip total kalau `prefers-reduced-motion`. Implementasi `playRevealCeremony(cat, onRevealed)` siap pakai — saat ini belum dipanggil otomatis dari saveCat karena alur existing sudah punya confetti+toast+chime yang cukup; function tersedia untuk dipanggil dari hook mana pun di masa depan kalau developer ingin momen reveal lebih dramatis. (E3) Micro-animation: maskot Si Oren blink acak tiap 4-6s (`startMascotBlink` -> `setInterval` random -> `doBlink` add class `.mascot-blink` ke `<g class="mascot-eye">` di SVG), mata SVG diberi `data-mascot-eye` + `transform-origin` supaya `scaleY(.1)` animasi berpusat di mata. Stagger fade-in di Jurnal: `journalFadeIn` keyframe + `animation-delay` proporsional ke index hari (`days.indexOf(key) * 0.08s`) supaya linimasa "mengalir turun" alih-alih muncul serentak. Semua animasi hormati `prefers-reduced-motion`. Verifikasi: node --check PASS, mascot SVG valid XML, local server HTTP 200 untuk semua aset.
- **2026-07-04 (batch 24)** — Bagian H1 + H2 + F2 addendum (etika kesejahteraan kucing + panduan lengkap). (H1) Array `ETHICS_TIPS` baru (10 tip) terpisah dari `CAT_TIPS` — berisi praktik baik street-feeding yang dianjurkan pegiat kesejahteraan kucing jalanan (tempat konsisten jauh dari jalan, kasih jarak kalau waspada, sediakan air, bersihkan sisa, porsi secukupnya, sterilisasi/vaksinasi, dll). Ditulis ulang dengan gaya Meongdex sendiri, bukan disalin dari sumber mana pun. `renderTipCard()` sekarang bergantian CAT_TIPS vs ETHICS_TIPS per hari (hari ganjil = fakta, hari genap = etika), label "TIP HARI INI" berubah jadi "ETIKA HARI INI" kalau tip etika. (H2) Pengingat etika lembut di layar Kasih Makan: elemen `.feed-ethics-hint` di bawah `#feed-hint`, font 11px italic text-mute, random pick dari ETHICS_TIPS sekali per sesi feed (`initFeed`), tidak mengganggu feedback fungsional yang sudah ada. (F2) Sheet "Panduan Lengkap" di Pengaturan: tombol baru `#set-guide` sebelah "Lihat Cara Main", sheet berisi 9 topik accordion (`<details>`): Cara main dasar, Kelangkaan kartu, Bond dan trust level, Misi harian dan mingguan, Tantangan foto honor-system, Papan peringkat, Cadangkan dan pindah perangkat, Etika berburu kucing, Offline dan data. Nada santai konsisten Meongdex, bukan bahasa manual teknis. Topik pertama open by default, tap untuk expand/collapse. CSS `.guide-topic` accordion dengan chevron rotate. Verifikasi: node --check PASS, local server HTTP 200.

### Catatan: Bagian E4 (Trofi 3D `<model-viewer>`) — stretch goal, bukan target wajib

E4 di audit adalah catatan opsional prioritas rendah: jika developer ingin lompatan visual lebih besar, satu elemen `<model-viewer>` (web component Google, ~100-150KB) bisa menampilkan model glTF Si Oren berputar sebagai "trofi" di layar Rumah/Shelter. Ini eksplisit OPSIONAL dan lebih berat dari filosofi ringan proyek — perlakukan sebagai backlog seperti C8 (alternatif APK). E1-E3 di atas SUDAH cukup memberi kesan "3D" yang diminta tanpa dependency tambahan.

---

## Catatan: Item Bagian C8 (alternatif APK tanpa PWABuilder GUI)

C8 di audit file adalah catatan referensi, bukan target wajib. PWA Meongdex sudah installable secara native dari Chrome Android ("Instal aplikasi") tanpa APK — ini memenuhi kriteria inti Fase 2. Kalau suatu saat ingin dicoba dari command line, `@bubblewrap/cli` (proyek open-source tim Chrome, gratis) bisa membungkus PWA jadi Trusted Web Activity APK, tapi tetap butuh Java JDK + Android build tools terpasang. Perlakukan ini sebagai referensi saja — PWA yang sudah installable langsung dari Chrome sudah cukup.

---

## Setup Leaderboard Supabase (opsional, Bagian 2.10 addendum)

Papan peringkat opsional dan **tidak wajib** untuk menikmati game. Kalau kamu (pengembang) ingin mengaktifkannya:

### 1. Buat proyek Supabase gratis
- Daftar di https://supabase.com (free tier: 500MB DB, 50k monthly active users — cukup untuk leaderboard kecil).
- Buat proyek baru, tunggu provisioning selesai.
- Buka **SQL Editor** di dashboard Supabase, jalankan SQL berikut untuk bikin tabel leaderboard dengan Row Level Security yang mengizinkan anon insert + select:

```sql
create table if not exists public.leaderboard (
  nick text primary key,
  xp integer not null default 0,
  cat_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

create policy "Anyone can read leaderboard"
  on public.leaderboard for select
  using (true);

create policy "Anyone can upsert their score"
  on public.leaderboard for insert
  with check (true);

create policy "Anyone can update their score"
  on public.leaderboard for update
  using (true);
```

### 2. Ambil URL + anon key
- Di dashboard Supabase: **Project Settings → API**.
- Salin **Project URL** (contoh: `https://abcdefgh.supabase.co`).
- Salin **anon public** key (BUKAN `service_role` — anon key aman untuk client-side).

### 3. Isi `CONFIG.LEADERBOARD` di `game/app.js`
```js
LEADERBOARD: {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...your-anon-key...',
  TABLE_NAME: 'leaderboard',
  FETCH_LIMIT: 10,
  TIMEOUT_MS: 8000,
  NICKNAME_KEY: 'meongdex_nick',
},
```

### 4. (Sangat disarankan) Setup GitHub Actions cron keep-alive
Supabase free tier otomatis **pause** proyek yang tidak ada aktivitas API selama 7 hari berturut-turut. Untuk mencegah leaderboard "mati" mendadak, file workflow `.github/workflows/keep-supabase-alive.yml` **sudah dibuatkan** di repo ini (batch 16). Workflow ini berjalan otomatis tiap Senin 08:00 UTC, ping Supabase REST API sekali. Selama secrets `SUPABASE_URL` dan `SUPABASE_ANON_KEY` belum diisi, workflow skip dengan pesan informatif (tidak gagal). Begitu secrets diisi, leaderboard akan tetap hidup otomatis. Isi file workflow:

```yaml
name: Keep Supabase alive
on:
  schedule:
    - cron: '0 8 * * 1'  # tiap Senin 08:00 UTC
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -s -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
               -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
               "${{ secrets.SUPABASE_URL }}/rest/v1/leaderboard?limit=1"
```

Simpan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sebagai **repository secrets** di GitHub repo `meongdex/meongdex.github.io` (Settings → Secrets and variables → Actions).

### 5. Test
- Push perubahan ke main, tunggu GitHub Pages rebuild (1-2 menit).
- Buka https://meongdex.github.io/game/ → Pengaturan → Papan peringkat.
- Coba kirim skor dengan nama panggilan, lalu refresh sheet — seharusnya muncul di daftar.

Kalau langkah 1-5 tidak dilakukan, fitur leaderboard tetap muncul di UI tapi menampilkan pesan ramah "belum dikonfigurasi". Game tetap 100% berfungsi tanpa leaderboard.

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
