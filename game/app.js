/* =====================================================================
   Meongdex — game/app.js
   Logika inti Fase 1: onboarding, beranda, alur temukan -> kasih makan
   -> foto -> verifikasi AI (COCO-SSD + fallback manual) -> kartu ->
   koleksi Meongdex. Data persisten di IndexedDB (foto) + localStorage
   (meta pemain). Tanpa emoji, tanpa server, tanpa API berbayar.
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   0. Konstanta &amp; konfigurasi
   --------------------------------------------------------------------- */
const CONFIG = {
  XP_PER_CAT: 50,
  XP_RARE_BONUS: 30,
  XP_PER_LEVEL: 200,
  MISSION_GOAL: 3,
  MISSION_BONUS: 100,
  CAT_DETECT_THRESHOLD: 0.5,   // confidence minimum COCO-SSD untuk "kucing"
  PHOTO_MAX_EDGE: 1000,        // downscale foto sebelum disimpan (privasi: redraw canvas otomatis strip EXIF)
  PHOTO_QUALITY: 0.82,         // kualitas JPEG
  COTD_KEY: 'meongdex_cotd',
  SESSION_WINDOW_MS: 30*60*1000, // 30 menit antar temuan = sesi sama
  SESSION_BONUS_PER_CAT: 15,     // bonus XP per kucing tambahan dalam sesi
  SESSION_BONUS_CAP: 60,         // maks bonus sesi per kucing
  CHALLENGE_BONUS: 80,           // XP per tantangan selesai
  SHELTER_SLOTS: 6,              // jumlah slot rumah kucing
  RARITY_XP: { biasa:0, langka:30, epik:70, legendaris:150 },
  EVENT_XP_MULT: 2,              // multiplier XP saat event aktif
  DECOR_UNLOCK: { carpet:2, toy:3, plant:4, curtain:5, lamp:6 }, // level unlock decor
  WEEKLY_MISSION_BONUS: 250,     // bonus XP per misi mingguan selesai (lebih besar dari harian)
  WEEKLY_MISSION_GOAL: 3,        // target default misi mingguan
  // Leaderboard Supabase (Bagian 2.10 addendum) — opsional, graceful fallback.
  // Isi URL + anon key kalau sudah setup proyek Supabase. Kalau kosong, fitur
  // leaderboard tetap muncul tapi menampilkan pesan ramah bahwa fitur belum
  // dikonfigurasi. Tidak pernah blokir gameplay inti.
  LEADERBOARD: {
    SUPABASE_URL: '',                  // contoh: https://xxxx.supabase.co
    SUPABASE_ANON_KEY: '',             // anon public key (bukan service_role)
    TABLE_NAME: 'leaderboard',
    FETCH_LIMIT: 10,
    TIMEOUT_MS: 8000,                  // batas waktu fetch, supaya UX tetap responsif
    NICKNAME_KEY: 'meongdex_nick',     // localStorage key untuk nama panggilan
  },
  // Auth & sync (akun login) — opsional. Isi client ID setelah setup di
  // Google Cloud Console + Facebook App Dashboard. Kalau kosong, opsi login
  // tetap tampil tapi menampilkan pesan "belum dikonfigurasi" dan pemain
  // tetap bisa main dengan import/export manual (default).
  // Google: sync full (foto + metadata) via Google Drive appDataFolder.
  // Facebook: sync metadata only via Supabase Auth (foto tetap lokal).
  AUTH: {
    GOOGLE_CLIENT_ID: '',              // dari Google Cloud Console (OAuth 2.0 Client ID)
    FACEBOOK_APP_ID: '',               // dari Facebook App Dashboard
    // Supabase Auth untuk Facebook login (reuse LEADERBOARD config).
    // Pastikan Facebook provider enabled di Supabase Dashboard > Auth > Providers.
    DRIVE_FILE_NAME: 'meongdex-backup.json',
    SYNC_DEBOUNCE_MS: 3000,            // debounce auto-sync setelah saveCat
  },
};

// Tingkat kelangkaan lengkap (Fase 3): biasa < langka < epik < legendaris
const RARITIES = {
  biasa:      { label:'BIASA',      color:'#4A9B8E', ink:'#fff',      order:1 },
  langka:     { label:'LANGKA',     color:'#D4AF37', ink:'#4A3A0E',   order:2 },
  epik:       { label:'EPIK',       color:'#9b6dd4', ink:'#fff',      order:3 },
  // Bagian D2 addendum: legendaris dapat warna signature sendiri (rose/magenta
  // tua) supaya jelas berbeda dari emas langka di grafik Statistik dan dot
  // indicator. Untuk kartu polaroid, gradient prismatik dipakai via CSS class
  // .trading-card.legendary (lihat style.css).
  legendaris: { label:'LEGENDARIS', color:'#C2185B', ink:'#fff',       order:4 },
};

// Tema kartu kosmetik (Fase 3): skin alternatif (opsional, sukarela)
const CARD_SKINS = [
  { id:'default', label:'Klasik', color:'#4A9B8E' },
  { id:'mint',    label:'Mint',   color:'#7ec8b8' },
  { id:'rose',    label:'Rose',   color:'#e8a4b8' },
  { id:'night',   label:'Night',  color:'#4a4868' },
];

// Dekorasi rumah (Fase 3): item unlock by level
const DECOR_ITEMS = [
  { id:'carpet',  label:'Karpet',     unlockLevel:2, svg:'<rect x="3" y="14" width="18" height="6" rx="1" fill="#E8804C" opacity=".4"/><path d="M3 14l18 6" stroke="#C9652F" stroke-width="1"/>' },
  { id:'toy',     label:'Mainan',     unlockLevel:3, svg:'<circle cx="8" cy="14" r="3" fill="#4A9B8E"/><path d="M8 11v-3M5 14h6" stroke="#357569" stroke-width="1.5"/>' },
  { id:'plant',   label:'Tanaman',    unlockLevel:4, svg:'<path d="M12 20v-6M12 14c-3 0-5-2-5-5 3 0 5 2 5 5zM12 14c3 0 5-2 5-5-3 0-5 2-5 5z" fill="#4A9B8E"/>' },
  { id:'curtain', label:'Gorden',     unlockLevel:5, svg:'<path d="M4 4v16M20 4v16M4 4h16" stroke="#C9652F" stroke-width="1.5"/><path d="M4 4l2 16M8 4l2 16M12 4l2 16M16 4l2 16M20 4l2 16" stroke="#E8804C" stroke-width=".8" opacity=".6"/>' },
  { id:'lamp',    label:'Lampu',      unlockLevel:6, svg:'<path d="M9 4h6l2 6H7z" fill="#D4AF37"/><path d="M12 10v8M9 18h6" stroke="#3A2E2A" stroke-width="1.5"/>' },
];

// Tips harian kucing (Fase 3): random tip per hari
const CAT_TIPS = [
  'Kucing tidur rata-rata 12-16 jam sehari. Jangan ganggu yang sedang tidur!',
  'Dengkuran kucing frekuensinya 25-150 Hz, bisa bantu penyembuhan tulang.',
  'Kucing punya 32 otot di tiap telinga, bisa berputar 180 derajat.',
  'Setiap kucing punya pola hidung unik, seperti sidik jari manusia.',
  'Kucing bisa mendengar frekuensi tinggi yang tak bisa didengar anjing.',
  'Saat kucing pelan-pelan berkedip ke arahmu, itu tanda kepercayaan.',
  'Kucing oren lebih sering jantan daripada betina (sekitar 80%).',
  'Kucing calico hampir selalu betin karena genetika warna.',
  'Whiskers kucing selebar tubuhnya, bantu navigasi ruang sempit.',
  'Grup kucing disebut "clowder" — koleksimu adalah clowder!',
];

// H1 addendum: Kumpulan tip etika street-feeding, terpisah dari CAT_TIPS
// (yang berisi fakta lucu). Ditulis ulang dengan gaya Meongdex sendiri,
// berisi praktik baik yang dianjurkan pegiat kesejahteraan kucing jalanan.
// Muncul bergantian dengan CAT_TIPS di Beranda (tip harian) + satu tip
// etika muncul sesekali di layar penjelasan sebelum "Temukan Kucing".
const ETHICS_TIPS = [
  'Pilih tempat kasih makan yang konsisten dan jauh dari jalan ramai — kucing butuh merasa aman dulu sebelum makan.',
  'Kalau kucingnya masih waspada, kasih jarak. Biarkan dia yang memutuskan mendekat, jangan paksa.',
  'Sediakan air bersih juga, bukan cuma makanan. Terutama pas cuaca panas, air jauh lebih jarang tersedia untuk kucing jalanan.',
  'Bersihkan sisa makanan setelah kucing selesai. Area tetap nyaman untuk warga sekitar dan tidak mengundang hama.',
  'Porsi secukupnya saja tiap kali. Menumpuk banyak makanan sekali gus justru berisiko basi dan bikin kucing sakit.',
  'Sterilisasi dan vaksinasi adalah kontribusi jangka panjang yang jauh lebih besar dari sekadar kasih makan. Komunitas kucing lokal butuh bantuan di sana.',
  'Kalau kucing terlihat sakit atau terluka, jangan ditangani sendiri. Hubungi komunitas kucing atau dokter hewan terdekat.',
  'Kucing jalangan butuh waktu untuk percaya. Konsisten datang ke titik yang sama bikin mereka lebih tenang dari minggu ke minggu.',
  'Hindari memberi makanan manusia yang asin atau berbumbu — gorengan, sisa masakan, atau cokelat berbahaya untuk kucing.',
  'Catat pola kedatangan kucing di titik feeding-mu. Lama-lama kamu akan kenal individu mana yang rutin datang.',
];

// Event musiman (Fase 3): cek tanggal untuk event aktif
function getCurrentEvent(){
  const now = new Date();
  const m = now.getMonth()+1; // 1-12
  const d = now.getDate();
  // Event: Minggu Kucing Oren (setiap bulan, tanggal 1-7)
  if(d <= 7) return { id:'orange-week', label:'Minggu Kucing Oren', desc:'Bonus XP ganda untuk kucing berwarna oren!', mult:2, color:'#E8804C', filter:c=>c.color==='oren' };
  // Event: Akhir Pekan Kucing Hitam (Jumat-Sabtu)
  const day = now.getDay(); // 0=Min, 5=Jum, 6=Sab
  if(day===5 || day===6) return { id:'black-weekend', label:'Akhir Pekan Kucing Hitam', desc:'Bonus XP ganda untuk kucing hitam!', mult:2, color:'#3A2E2A', filter:c=>c.color==='hitam' };
  // Event: Musim Calico (Mei & November)
  if(m===5 || m===11) return { id:'calico-season', label:'Musim Calico', desc:'Calico lebih sering muncul bulan ini!', mult:1.5, color:'#D4AF37', filter:c=>c.color==='calico' };
  return null;
}

const COLORS = [
  { id:'oren',  label:'Oren',  hex:'#E8804C' },
  { id:'hitam', label:'Hitam', hex:'#3A2E2A' },
  { id:'putih', label:'Putih', hex:'#F2EADB' },
  { id:'belang',label:'Belang',hex:'#C9A87C' },
  { id:'calico',label:'Calico',hex:'#E8804C' },
  { id:'lainnya',label:'Lainnya',hex:'#9b8b7e' },
];

// Jenis makanan (Fase 3): tiap makanan punya efek mood & bonus XP kecil
const FOODS = [
  { id:'snack',   label:'Snack ikan',  icon:'fish',  moodBoost:1, xpBonus:0,  color:'#4A9B8E' },
  { id:'wet',     label:'Wet food',    icon:'bowl',  moodBoost:2, xpBonus:5,  color:'#E8804C' },
  { id:'dry',     label:'Dry food',    icon:'kibble',moodBoost:1, xpBonus:3,  color:'#D4AF37' },
  { id:'treat',   label:'Treat special',icon:'star', moodBoost:3, xpBonus:10, color:'#C9652F' },
];

// Tantangan Foto Kreatif (Fase 3): auto-check saat saveCat berdasarkan
// properti kucing (warna, rarity, verifiedByAI, jam temuan, dll).
// Tantangan subjektif (yg butuh konfirmasi pemain) ditandai manual:true.
const CHALLENGES = [
  { id:'first',      label:'Kucing pertama', desc:'Simpan kucing pertamamu ke Meongdex.', badge:'Langkah Awal', check:(c)=>true },
  { id:'rare',       label:'Pemburu langka', desc:'Temukan 1 kucing berkelangkaan langka.', badge:'Pemburu Emas', check:(c)=>c.rarity==='langka' },
  { id:'oren',       label:'Sahabat oren',   desc:'Koleksi 3 kucing berwarna oren.', badge:'Sahabat Oren', check:(c,all)=>all.filter(x=>x.color==='oren').length>=3 },
  { id:'hitam',      label:'Mata dalam malam',desc:'Temukan 1 kucing hitam.', badge:'Malam', check:(c)=>c.color==='hitam' },
  { id:'calico',     label:'Bintang tiga warna',desc:'Temukan 1 kucing calico.', badge:'Calico', check:(c)=>c.color==='calico' },
  { id:'night',      label:'Buruh malam',    desc:'Temukan kucing setelah jam 9 malam.', badge:'Buruh Malam', check:(c)=>{ const h=new Date(c.date).getHours(); return h>=21||h<5; } },
  { id:'morning',    label:'Penyapa pagi',   desc:'Temukan kucing sebelum jam 8 pagi.', badge:'Penyapa Pagi', check:(c)=>{ const h=new Date(c.date).getHours(); return h>=5&&h<8; } },
  { id:'ai',         label:'Terverifikasi',  desc:'Simpan kucing yang lolos verifikasi AI.', badge:'Terverifikasi AI', check:(c)=>c.verifiedByAI },
  { id:'five',       label:'Lima kucing',    desc:'Koleksi 5 kucing di Meongdex.', badge:'Kolektor', check:(c,all)=>all.length>=5 },
  { id:'ten',        label:'Sepuluh kucing', desc:'Koleksi 10 kucing di Meongdex.', badge:'Pemburu Sejati', check:(c,all)=>all.length>=10 },
  // C5 addendum: badge Kolektor Warna Lengkap — mendorong variasi mengoleksi,
  // bukan cuma jumlah. Terbuka saat pemain sudah punya minimal 1 kucing
  // untuk tiap tag warna yang tersedia.
  { id:'allcolors',  label:'Kolektor Warna Lengkap', desc:'Punya minimal 1 kucing untuk tiap tag warna.', badge:'Pelangi Kucing', check:(c,all)=>COLORS.every(col=>all.some(x=>x.color===col.id)) },
  // G2 addendum: badge Paham Karakter — mendorong pemain benar-benar
  // memperhatikan tiap kucing, bukan cuma spam simpan cepat.
  { id:'temperament10', label:'Paham Karakter', desc:'Isi temperamen untuk 10 kucing berbeda.', badge:'Paham Karakter', check:(c,all)=>all.filter(x=>x.temperament && x.temperament!=='unknown').length>=10 },
];

// Tantangan foto kreatif honor-system (Bagian 2.5 addendum).
// Karena model deteksi ringan tidak bisa mengenali pose/ekspresi spesifik,
// ini self-report jujur dari pemain. Setelah verifikasi dasar lolos,
// pemain bisa centang tantangan yang sesuai dengan foto mereka.
// Tiap tantangan yang dicentang & belum pernah diselesaikan sebelumnya
// memberi bonus XP. Histori tersimpan di player.completedHonor.
const HONOR_CHALLENGES = [
  { id:'yawn',    label:'Kucing sedang menguap',     badge:'Menguap Ringan' },
  { id:'sunset',  label:'Latar langit sore',          badge:'Fotografer Sore' },
  { id:'stretch', label:'Kucing sedang meregangkan badan', badge:'Peregangan' },
  { id:'duo',     label:'Dua kucing dalam satu foto', badge:'Duo Kucing' },
  { id:'sleep',   label:'Kucing sedang tidur',        badge:'Mimpi Manis' },
];

// flavor text lucu untuk kartu
const QUOTES = [
  'Curiga di awal, tapi langsung akrab setelah suapan kedua.',
  'Mendekat pelan-pelan seperti sedang menyelinap.',
  'Mata bulat menatap langsung, seolah tahu niat baikmu.',
  'Ekor bergerak-gerak, tanda mulai tertarik.',
  'Mendengkur pelan sehabis suapan pertama.',
  'Satu kucing, satu cerita baru di Meongdex-mu.',
  'Tinggal diam, lalu tiba-tiba mengucek kaki ke sepatumu.',
  'Melirik makanan dulu sebelum melirik kamu.',
];

// C3 addendum: bank quote dipisah per tag warna supaya kartu terasa
// lebih personal dan tidak cepat terasa berulang setelah koleksi membesar.
// Tiap warna punya 4-5 quote sendiri dengan nuansa yang pas sama warnanya.
// Kalau warna tidak ada di map (mis. 'lainnya' atau value lama), fallback ke QUOTES umum.
const QUOTES_BY_COLOR = {
  oren: [
    'Bulu orrennya berkilau di bawah matahari sore.',
    'Si oren ini langsung rubuh di dekatmu begitu mencium ikan kering.',
    'Warnanya persis seperti sunset yang lagi kamu kejar.',
    'Kucing oren selalu tahu cara bikin hari lebih hangat.',
  ],
  hitam: [
    'Seperti bayangan kecil yang tiba-tiba minta perhatian.',
    'Mata kuningnya menatap lekat dari bulu hitam yang legam.',
    'Misterius, tapi setelah dia mendengkur, semua curiga hilang.',
    'Hitam legam, tapi jantungnya sehangat tepat kompor.',
  ],
  putih: [
    'Seperti awan kecil yang turun ke bumi sebentar.',
    'Bulu putihnya bersih sekali, mungkin baru saja merapikan diri.',
    'Kucing putih selalu terlihat tenang, seolah tahu rahasia besar.',
    'Murni dan lembut, sampai dia mengucek kepala ke sepatu kamu.',
  ],
  belang: [
    'Pola belangnya unik, tidak ada kucing lain yang persis sama.',
    'Seperti harimau kecil yang lupa caranya mengaum.',
    'Belang hitam-putihnya kontras, seperti kue zebra yang bisa lari.',
    'Tiap garis bulunya cerita perjalanan sendiri.',
  ],
  calico: [
    'Tiga warna sekaligus, jarang ditemui dan layak dirayakan.',
    'Kombinasi warna yang membuatnya terlihat seperti karya seni.',
    'Calico katanya membawa keberuntungan, dan hari ini kamu dapet.',
    'Tiga warna, satu kucing, banyak cerita.',
  ],
  lainnya: [
    'Warnanya unik, susah diberi nama tapi gampang diingat.',
    'Tidak masuk kotak mana pun, dan itu justru yang istimewa.',
    'Bulu yang tidak biasa, kucing yang tidak biasa.',
    'Spesial dari alam, tidak butuh label.',
  ],
};

/**
 * Ambil quote acak untuk warna tertentu. Kalau warna punya bank sendiri,
 * pakai dari sana. Kalau tidak, fallback ke QUOTES umum.
 * G2 addendum: kalau temperamen diisi (bukan 'unknown'), coba cari
 * kombinasi warna+temperamen dulu; fallback ke warna-only kalau tidak ada.
 */
const QUOTES_BY_TEMPERAMENT = {
  pemalu: [
    'Butuh waktu, tapi akhirnya mendekat pelan-pelan.',
    'Sempat mundur dua langkah sebelum akhirnya diam di tempat.',
  ],
  manja: [
    'Langsung mengucek kepala ke tanganmu sejak detik pertama.',
    'Mendengkur keras sekali, seolah sudah kenal lama.',
  ],
  waspada: [
    'Mata tajam mengawasi setiap gerakanmu dari jarak aman.',
    'Baru mendekat setelah makanan habis setengah.',
  ],
  usil: [
    'Sambil makan, sesekali mainin ekornya ke arahmu.',
    'Purwa-purwa lari, tapi balik lagi setelah dua detik.',
  ],
  cuek: [
    'Makan pelan tanpa menatapmu sama sekali.',
    'Selesai makan, langsung pergi tanpa pamit.',
  ],
  ramah: [
    'Langsung ikut jalan di belakangmu setelah makan.',
    'Menggosokkan pipi ke kakimu, tanda sudah anggap keluarga.',
  ],
};

function quoteForColor(color, temperament){
  // G2: kalau temperamen diisi, 50% chance pakai quote temperamen
  if(temperament && temperament !== 'unknown' && Math.random() < 0.5){
    const tBank = QUOTES_BY_TEMPERAMENT[temperament];
    if(tBank && tBank.length > 0){
      return tBank[Math.floor(Math.random() * tBank.length)];
    }
  }
  const bank = QUOTES_BY_COLOR[color];
  if(bank && bank.length > 0){
    return bank[Math.floor(Math.random() * bank.length)];
  }
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

const MOODS = ['Penasaran','Waspada','Terpana','Suka makan','Mendengkur'];

// G1 addendum: Tag temperamen self-report saat menyimpan kartu.
// Opsional (boleh dilewati, default "Belum diketahui"). Murni self-report,
// sama jujurnya dengan tantangan foto honor-system — tidak ada klaim AI
// mendeteksi kepribadian. Dipakai di G2 untuk variasi quote + flavor.
const TEMPERAMENTS = [
  { id:'unknown', label:'Belum diketahui', icon:'?' },
  { id:'pemalu',   label:'Pemalu',          icon:'eye-off' },
  { id:'manja',    label:'Manja',           icon:'heart' },
  { id:'waspada',  label:'Waspada',         icon:'alert' },
  { id:'usil',     label:'Usil',            icon:'play' },
  { id:'cuek',     label:'Cuek',            icon:'minus' },
  { id:'ramah',    label:'Ramah',           icon:'check' },
];

// C2 addendum: Misi mingguan mikro yang berputar.
// Daftar tetap, dipilih per nomor minggu tahun berjalan (ISO week) modulo panjang daftar.
// Tiap misi punya: id, label, desc, goal, dan check(state, allCats) -> boolean.
// state: { fed, catsFoundThisWeek, distinctColorsThisWeek, daysActiveThisWeek }
// Misi mingguan = bonus XP lebih besar dari misi harian, reset tiap awal minggu.
const WEEKLY_MISSIONS = [
  {
    id: 'white-cat',
    label: 'Pemburu putih',
    desc: 'Temukan 1 kucing berwarna putih minggu ini.',
    goal: 1,
    check: (s) => s.distinctColorsThisWeek.includes('putih'),
  },
  {
    id: 'three-days',
    label: 'Konsisten 3 hari',
    desc: 'Berburu kucing di 3 hari berbeda minggu ini.',
    goal: 3,
    check: (s) => s.daysActiveThisWeek >= 3,
  },
  {
    id: 'five-cats',
    label: 'Lima kucing seminggu',
    desc: 'Temukan 5 kucing baru minggu ini.',
    goal: 5,
    check: (s) => s.catsFoundThisWeek >= 5,
  },
  {
    id: 'feed-ten',
    label: 'Tukang kasih makan',
    desc: 'Beri makan 10 kali minggu ini.',
    goal: 10,
    check: (s) => s.fedThisWeek >= 10,
  },
  {
    id: 'color-variety',
    label: 'Variasi warna',
    desc: 'Temukan kucing dari 3 warna berbeda minggu ini.',
    goal: 3,
    check: (s) => s.distinctColorsThisWeek.length >= 3,
  },
];

/**
 * Hitung nomor minggu ISO dari sebuah Date.
 * Minggu dimulai Senin. Minggu 1 = minggu pertama yang punya hari Kamis.
 * Dipakai untuk rotasi misi mingguan + reset progres mingguan.
 */
function isoWeekNumber(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Senin=0 ... Minggu=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Kamis di minggu yang sama
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/**
 * Tanggal Senin di awal minggu ISO dari sebuah Date (local time).
 */
function startOfWeek(date){
  const d = new Date(date);
  const dayNum = (d.getDay() + 6) % 7; // Senin=0
  d.setDate(d.getDate() - dayNum);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ---------------------------------------------------------------------
   1. State pemain (localStorage)
   --------------------------------------------------------------------- */
const Store = {
  defaults(){
    return {
      onboarded:false,
      xp:0,
      fed:0,
      missionCount:0,
      missionDone:false,
      missionDate:'',
      cotdId:null,
      cotdDate:'',
      // Fase 3
      streak:0,
      lastStreakDate:'',
      sessionStart:0,
      sessionCatCount:0,
      completedChallenges:[],
      soundEnabled:false,
      shelterCatIds:[],  // id kucing yang menghuni rumah
      cardSkin:'default', // tema kartu kosmetik aktif
      activeDecor:[],     // id decor yang aktif di rumah
      lastEventSeen:'',   // id event terakhir yang dilihat (untuk notifikasi sekali)
      questCompletedSeen:false, // flag quest tracker sudah selesai & dilihat
      favorites:[],       // id kucing favorit
      completedHonor:[],  // id tantangan foto kreatif honor-system yang sudah diselesaikan (Bagian 2.5)
      // C2 addendum: misi mingguan
      weeklyMissionId:'',     // id misi mingguan aktif (rotasi per ISO week)
      weeklyMissionWeek:-1,   // nomor minggu ISO saat misi ini dipilih (untuk reset otomatis)
      weeklyMissionDone:false,// flag sudah selesai minggu ini
      weeklyMissionYear:-1,   // tahun saat misu ini dipilih (anti confused di tahun baru)
      // F1 addendum: coach-mark kontekstual — flag per elemen yang sudah dilihat
      // sekali. Key: 'feed-throw', 'verify-ai', 'card-color', 'dex-strip', dll.
      // Kalau key ada di object = sudah dilihat, jangan tampilkan lagi.
      coachMarksSeen:{},
      // Auth & sync: provider = '' (none) | 'google' | 'facebook'
      // Kalau kosong = main tanpa akun (default, import/export manual).
      authProvider:'',
      authToken:'',            // OAuth access token (Google atau Facebook)
      authUserName:'',         // nama dari provider (untuk display)
      authUserEmail:'',        // email dari provider (untuk display)
      driveFileId:'',          // Google Drive file ID untuk backup (kalau google)
      lastSyncAt:'',           // ISO timestamp sync terakhir
      storageChoiceSeen:false, // flag: pemain sudah pernah lihat layar pilih storage
    };
  },
  load(){
    try{
      const raw = localStorage.getItem('meongdex_player');
      if(!raw) return this.defaults();
      return Object.assign(this.defaults(), JSON.parse(raw));
    }catch(e){ return this.defaults(); }
  },
  save(s){ localStorage.setItem('meongdex_player', JSON.stringify(s)); },
};
let player = Store.load();

function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }

function levelFromXp(xp){ return Math.floor(xp/CONFIG.XP_PER_LEVEL)+1; }
function xpInLevel(xp){ return xp % CONFIG.XP_PER_LEVEL; }

/* ---------------------------------------------------------------------
   2. IndexedDB untuk kucing (termasuk foto)
   --------------------------------------------------------------------- */
let dbPromise = null;
function getDB(){
  if(!dbPromise){
    dbPromise = idb.openDB('meongdex-db', 1, {
      upgrade(db){
        if(!db.objectStoreNames.contains('cats')){
          const store = db.createObjectStore('cats', { keyPath:'id' });
          store.createIndex('byDate','date');
          store.createIndex('byColor','color');
        }
      },
    });
  }
  return dbPromise;
}

async function addCat(cat){
  const db = await getDB();
  await db.put('cats', cat);
}
async function getCat(id){
  const db = await getDB();
  return db.get('cats', id);
}
async function allCats(){
  const db = await getDB();
  const cats = await db.getAll('cats');
  return cats.sort((a,b)=> a.id.localeCompare(b.id)); // urut nomor
}
async function deleteCat(id){
  const db = await getDB();
  await db.delete('cats', id);
}
async function clearCats(){
  const db = await getDB();
  await db.clear('cats');
}

// generate id berikutnya: MDX-001, MDX-002 ...
async function nextCatId(){
  const cats = await allCats();
  if(cats.length===0) return 'MDX-001';
  const nums = cats.map(c=>parseInt((c.id||'').replace(/\D/g,''),10)).filter(n=>!isNaN(n));
  const next = (nums.length?Math.max(...nums):0)+1;
  return 'MDX-' + String(next).padStart(3,'0');
}

/* ---------------------------------------------------------------------
   3. Util DOM
   --------------------------------------------------------------------- */
const $ = (sel,root=document)=> root.querySelector(sel);
const $$ = (sel,root=document)=> Array.from(root.querySelectorAll(sel));
function el(tag, props={}, children=[]){
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k,v])=>{
    if(k==='class') node.className=v;
    else if(k==='html') node.innerHTML=v;
    else if(k.startsWith('on') && typeof v==='function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if(k==='dataset') Object.entries(v).forEach(([dk,dv])=> node.dataset[dk]=dv);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children)?children:[children]).forEach(c=>{
    if(c==null) return;
    node.appendChild(typeof c==='string' ? document.createTextNode(c) : c);
  });
  return node;
}

/* ---------------------------------------------------------------------
   4. Navigasi screen
   --------------------------------------------------------------------- */
const screenOrder = ['storage-choice','onboarding','home','perm-loc','feed','perm-cam','verify','card','dex','journal','map','shelter','stats','settings'];
let currentScreen = 'onboarding';

// urutan screen untuk menentukan arah transisi (back vs forward)
const navOrder = ['home','dex','find','journal','map','shelter','stats','settings'];
function go(screen, opts={}){
  if(!screenOrder.includes(screen)) return;
  // tentukan arah transisi
  const curIdx = navOrder.indexOf(currentScreen);
  const newIdx = navOrder.indexOf(screen);
  const isBack = opts.back || (newIdx < curIdx && curIdx >= 0);
  $$('.screen').forEach(s=>{
    const match = s.dataset.screen===screen;
    s.classList.toggle('active', match);
    s.classList.toggle('back', match && isBack);
  });
  currentScreen = screen;
  $('#main').scrollTop = 0;
  // haptic feedback saat navigasi
  if(navigator.vibrate) navigator.vibrate(8);
  // bottom nav aktif
  const navMap = { home:'home', dex:'dex', settings:'settings', journal:'journal', map:'map', shelter:'shelter' };
  $$('.bottom-nav button').forEach(b=>{
    const active = b.dataset.nav === navMap[screen] || (screen==='find' && b.dataset.nav==='find');
    b.classList.toggle('active', active);
  });
  // render ulang konten yang dinamis per screen
  if(screen==='home') renderHome();
  if(screen==='dex') renderDex();
  if(screen==='journal') renderJournal();
  if(screen==='map') renderMap();
  if(screen==='shelter') renderShelter();
  if(screen==='stats') renderStats();
  if(screen==='settings') { updateStorageInfo(); }
}

document.addEventListener('click', (e)=>{
  const backBtn = e.target.closest('[data-back]');
  if(backBtn){
    go(backBtn.dataset.back);
    return;
  }
  const navBtn = e.target.closest('[data-nav]');
  if(navBtn){
    const t = navBtn.dataset.nav;
    if(t==='find'){ startFindFlow(); }
    else go(t);
  }
});

/* ---------------------------------------------------------------------
   5. Toast &amp; sheet
   --------------------------------------------------------------------- */
function toast(msg, type='', iconSvg=''){
  const wrap = $('#toast-wrap');
  const t = el('div',{class:`toast ${type}`});
  if(iconSvg) t.insertAdjacentHTML('afterbegin', iconSvg);
  t.appendChild(document.createTextNode(msg));
  wrap.appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),300); }, 2600);
}
const ICONS = {
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  paw:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/></svg>',
};

function openSheet(contentNode){
  const ov = $('#overlay'), sh = $('#sheet');
  sh.innerHTML='';
  sh.appendChild(el('div',{class:'grip'}));
  sh.appendChild(contentNode);
  ov.classList.add('active');
}
function closeSheet(){ $('#overlay').classList.remove('active'); $('#sheet').innerHTML=''; }
$('#overlay').addEventListener('click', (e)=>{ if(e.target===$('#overlay')) closeSheet(); });

/* ---------------------------------------------------------------------
   6. Onboarding
   --------------------------------------------------------------------- */
const ONBOARD_SLIDES = [
  { title:'Halo, aku Si Oren!', text:'Di luar sana banyak kucing yang belum kamu kenal. Yuk kita temukan, kasih makan, lalu abadikan mereka di Meongdex-mu.' },
  { title:'Temukan &amp; kasih makan', text:'Pakai lokasimu untuk mencari kucing di sekitar, dekati pelan-pelan, lalu lempar makanan supaya kucingnya tertarik mendekat.' },
  { title:'Foto &amp; verifikasi', text:'Abadikan kucingnya dengan kameramu. AI di ponselmu akan mengecek fotonya — kalau AI ragu, kamu tetap bisa konfirmasi manual.' },
  { title:'Koleksi di Meongdex', text:'Tiap kucing tersimpan sebagai kartu polaroid di Meongdex-mu selamanya. Kumpulkan, beri nama, dan tingkatkan level pemburu kucingmu.' },
];
let onboardIdx = 0;
function renderOnboard(){
  const s = ONBOARD_SLIDES[onboardIdx];
  $('#onboard-title').innerHTML = s.title;
  $('#onboard-text').innerHTML = s.text;
  $$('#onboard-dots span').forEach((d,i)=> d.classList.toggle('active', i===onboardIdx));
  $('#onboard-next').textContent = onboardIdx===ONBOARD_SLIDES.length-1 ? 'Mulai berburu' : 'Lanjut';
}
$('#onboard-next').addEventListener('click', ()=>{
  if(onboardIdx < ONBOARD_SLIDES.length-1){ onboardIdx++; renderOnboard(); }
  else finishOnboard();
});
$('#onboard-skip').addEventListener('click', finishOnboard);
function finishOnboard(){
  player.onboarded = true; Store.save(player);
  onboardIdx = 0; renderOnboard();
  go('home');
}

/* ---------------------------------------------------------------------
   7. Beranda
   --------------------------------------------------------------------- */
function renderHome(){
  const cats = currentCatsCache;
  $('#home-level').textContent = levelFromXp(player.xp);
  $('#stat-cats').textContent = cats.length;
  // I1 addendum: animasi "percikan" saat streak bertambah — cek prev value
  const streakEl = $('#stat-streak');
  const streakBox = $('#streak-box');
  const prevStreak = parseInt(streakEl.textContent, 10) || 0;
  const newStreak = player.streak || 0;
  streakEl.textContent = newStreak;
  if(newStreak > prevStreak && streakBox && !prefersReducedMotion){
    streakBox.classList.remove('streak-up');
    void streakBox.offsetWidth; // reflow
    streakBox.classList.add('streak-up');
  }
  $('#stat-xp').textContent = player.xp;
  const d = new Date();
  $('#home-date').textContent = d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'});
  // misi
  const resetMission = player.missionDate !== todayKey();
  if(resetMission){ player.missionCount=0; player.missionDone=false; player.missionDate=todayKey(); Store.save(player); }
  $('#mission-count').textContent = `${player.missionCount} / ${CONFIG.MISSION_GOAL}`;
  $('#mission-bar').style.width = Math.min(100, (player.missionCount/CONFIG.MISSION_GOAL)*100) + '%';
  // sesi berburu
  renderSession();
  // quest tracker (pemain baru)
  renderQuestTracker();
  // tip harian
  renderTipCard();
  // event musiman
  renderEventBanner();
  // tantangan
  renderChallengesCard();
  // misi mingguan (C2 addendum)
  renderWeeklyMission(cats);
  // ringkasan mingguan (Bagian 3.8 addendum)
  renderWeekSummary(cats);
  // kucing hari ini
  renderCotd(cats);
}

/**
 * C2 addendum: render kartu misi mingguan di Beranda.
 * Misi dipilih per nomor minggu ISO (Senin-Kamis-Jumat-Minggu cycle).
 * Reset otomatis di awal minggu baru. Bonus XP besar (WEEKLY_MISSION_BONUS).
 */
function renderWeeklyMission(cats){
  const wrap = $('#home-weekly-mission');
  if(!wrap) return;
  const now = new Date();
  const wk = isoWeekNumber(now);
  const yr = now.getFullYear();
  // reset kalau masuk minggu baru
  if(player.weeklyMissionWeek !== wk || player.weeklyMissionYear !== yr){
    player.weeklyMissionWeek = wk;
    player.weeklyMissionYear = yr;
    player.weeklyMissionDone = false;
    // pilih misi berdasarkan (year*53 + week) modulo panjang daftar
    // supaya tiap minggu dapet misi berbeda tapi deterministik
    const idx = ((yr * 53 + wk) % WEEKLY_MISSIONS.length + WEEKLY_MISSIONS.length) % WEEKLY_MISSIONS.length;
    const mission = WEEKLY_MISSIONS[idx];
    player.weeklyMissionId = mission.id;
    Store.save(player);
  }
  const mission = WEEKLY_MISSIONS.find(m=>m.id===player.weeklyMissionId) || WEEKLY_MISSIONS[0];
  // hitung progres dari data aktual minggu ini
  const state = computeWeeklyState(cats);
  const progress = computeWeeklyMissionProgress(mission, state);
  $('#weekly-mission-title').textContent = mission.label;
  $('#weekly-mission-desc').textContent = mission.desc;
  $('#weekly-mission-count').textContent = `${Math.min(progress, mission.goal)} / ${mission.goal}`;
  $('#weekly-mission-bar').style.width = Math.min(100, (progress / mission.goal) * 100) + '%';
  // tampilkan badge "selesai" kalau done
  wrap.classList.toggle('done', player.weeklyMissionDone);
}

/**
 * Hitung state aktivitas pemain minggu ini dari data aktual.
 * Dipakai untuk cek completion misi mingguan + render progres.
 */
function computeWeeklyState(cats){
  const weekStart = startOfWeek(new Date());
  const weekStartMs = weekStart.getTime();
  const nowMs = Date.now();
  // kucing yang ditemukan minggu ini (date dalam range [weekStart, now])
  const weekCats = (cats || []).filter(c=>{
    const t = new Date(c.date).getTime();
    return !isNaN(t) && t >= weekStartMs && t <= nowMs;
  });
  // warna berbeda yang ditemukan minggu ini
  const distinctColors = Array.from(new Set(weekCats.map(c=>c.color))).filter(Boolean);
  // hari berbeda aktif minggu ini (dari tanggal date kucing)
  const distinctDays = new Set(weekCats.map(c=>{
    const d = new Date(c.date);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  // fedThisWeek: tidak disimpan per-event, jadi estimasi dari jumlah kucing minggu ini
  // (asumsi: tiap kucing = 1x kasih makan). Kalau mau akurat, perlu log event terpisah.
  return {
    catsFoundThisWeek: weekCats.length,
    distinctColorsThisWeek: distinctColors,
    daysActiveThisWeek: distinctDays.size,
    fedThisWeek: weekCats.length, // estimasi
  };
}

/**
 * Hitung progres numerik misi mingguan dari state.
 * Return angka (bisa lebih dari goal kalau overshoot).
 */
function computeWeeklyMissionProgress(mission, state){
  if(!mission || !state) return 0;
  switch(mission.id){
    case 'white-cat': return state.distinctColorsThisWeek.includes('putih') ? 1 : 0;
    case 'three-days': return state.daysActiveThisWeek;
    case 'five-cats': return state.catsFoundThisWeek;
    case 'feed-ten': return state.fedThisWeek;
    case 'color-variety': return state.distinctColorsThisWeek.length;
    default: return 0;
  }
}

/**
 * Ringkasan aktivitas 7 hari terakhir di Beranda.
 * Hitung dari currentCatsCache (entri kucing dengan field date).
 * Tampilkan jumlah kucing baru + estimasi XP yang didapat minggu ini.
 * Kartu disembunyikan kalau belum ada aktivitas minggu ini.
 */
function renderWeekSummary(cats){
  const wrap = $('#home-week');
  if(!wrap) return;
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const weekCats = (cats || []).filter(c=>{
    const t = new Date(c.date).getTime();
    return !isNaN(t) && (now - t) >= 0 && (now - t) <= WEEK_MS;
  });
  if(weekCats.length === 0){
    wrap.classList.add('hide');
    return;
  }
  // estimasi XP minggu ini: jumlah XP_PER_CAT + bonus rarity + bonus tantangan yang selesai minggu ini
  // tidak disimpan per-XP per cat secara terpisah, jadi pakai estimasi sederhana dari data yang ada.
  let xpEstimate = 0;
  for(const c of weekCats){
    xpEstimate += CONFIG.XP_PER_CAT;
    const rar = c.rarity && CONFIG.RARITY_XP ? CONFIG.RARITY_XP[c.rarity] : 0;
    if(typeof rar === 'number') xpEstimate += rar;
  }
  // tambahkan bonus sesi berburu minggu ini (estimasi: setiap 2+ kucing dalam sesi = +15, cap +60 per cat)
  // sederhana: kalau ada 3+ kucing minggu ini, asumsikan 1 sesi bonus
  if(weekCats.length >= 3){
    xpEstimate += Math.min(
      CONFIG.SESSION_BONUS_CAP * Math.min(weekCats.length, 2),
      weekCats.length * CONFIG.SESSION_BONUS_PER_CAT
    );
  }
  wrap.classList.remove('hide');
  $('#week-text').textContent = `Minggu ini kamu menemukan ${weekCats.length} kucing baru dan dapat sekitar ${xpEstimate} XP. Lanjutkan!`;
}

function renderEventBanner(){
  const wrap = $('#home-event');
  if(!wrap) return;
  const ev = getCurrentEvent();
  if(!ev){ wrap.classList.add('hide'); return; }
  wrap.classList.remove('hide');
  $('#event-label').textContent = ev.label;
  $('#event-desc').textContent = ev.desc;
  wrap.style.borderColor = ev.color+'55';
  wrap.style.background = `linear-gradient(135deg,${ev.color}1a,${ev.color}08)`;
  $('#event-icon').style.color = ev.color;
  // notifikasi sekali per event
  if(player.lastEventSeen !== ev.id){
    player.lastEventSeen = ev.id; Store.save(player);
    setTimeout(()=> toast(`Event aktif: ${ev.label}`,'gold',ICONS.star), 1200);
  }
}

function renderTipCard(){
  const wrap = $('#home-tip');
  if(!wrap) return;
  // tip deterministik per hari (seed dari tanggal)
  const d = new Date();
  const seed = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  // H1 addendum: bergantian CAT_TIPS (fakta lucu) vs ETHICS_TIPS (etika
  // street-feeding) — hari ganjil = fakta, hari genap = etika. Total 20 tip
  // berputar per hari, supaya pemain menyerap kebiasaan baik sebagai bagian
  // dari ritual bermain, bukan info tersembunyi.
  const isEthicsDay = (seed % 2) === 0;
  const bank = isEthicsDay ? ETHICS_TIPS : CAT_TIPS;
  const tip = bank[seed % bank.length];
  $('#tip-text').textContent = tip;
  // ganti label "TIP HARI INI" jadi "ETIKA HARI INI" kalau tip etika
  const labelEl = wrap.querySelector('.tip-label');
  if(labelEl) labelEl.textContent = isEthicsDay ? 'ETIKA HARI INI' : 'TIP HARI INI';
  wrap.classList.remove('hide');
}

function renderQuestTracker(){
  const wrap = $('#quest-tracker');
  if(!wrap) return;
  const cats = currentCatsCache;
  const lvl = levelFromXp(player.xp);
  // quest onboarding: 4 langkah
  const quests = [
    { label:'Temukan kucing pertamamu', done: cats.length>=1 },
    { label:'Beri makan kucing', done: player.fed>=1 },
    { label:'Koleksi 3 kucing', done: cats.length>=3 },
    { label:'Capai level 2', done: lvl>=2 },
  ];
  const doneCount = quests.filter(q=>q.done).length;
  // tampilkan hanya jika belum semua selesai ATAU baru saja selesai (fade out)
  if(doneCount >= quests.length){
    // semua selesai — tampilkan sekali sebagai done, lalu hide setelah 1 kunjungan
    if(player.questCompletedSeen){
      wrap.classList.add('hide');
      return;
    }
    player.questCompletedSeen = true; Store.save(player);
  }
  wrap.classList.remove('hide');
  wrap.classList.toggle('done', doneCount>=quests.length);
  $('#qt-count').textContent = `${doneCount}/${quests.length}`;
  const list = $('#quest-list'); list.innerHTML='';
  quests.forEach(q=>{
    const item = el('div',{class:'quest-item'+(q.done?' done':'')});
    item.innerHTML = `${q.done
      ? '<span class="q-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>'
      : '<span class="q-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg></span>'}<span>${q.label}</span>`;
    list.appendChild(item);
  });
}

function renderSession(){
  const wrap = $('#home-session');
  if(!wrap) return;
  const now = Date.now();
  const active = player.sessionStart && (now - player.sessionStart) < CONFIG.SESSION_WINDOW_MS && player.sessionCatCount >= 2;
  if(!active){ wrap.classList.add('hide'); return; }
  wrap.classList.remove('hide');
  $('#session-title').textContent = `${player.sessionCatCount} kucing dalam sesi ini`;
  const dots = $('#session-dots'); dots.innerHTML='';
  for(let i=0;i<Math.min(player.sessionCatCount,6);i++){
    dots.appendChild(el('span',{class:'dot'}));
  }
  if(player.sessionCatCount > 6){
    dots.appendChild(el('span',{class:'more'}, '+'+(player.sessionCatCount-6)));
  }
}

function renderChallengesCard(){
  const wrap = $('#home-challenges');
  if(!wrap) return;
  const done = player.completedChallenges || [];
  $('#ch-title').textContent = `${done.length} / ${CHALLENGES.length} selesai`;
  // cari tantangan berikutnya yang belum selesai
  const next = CHALLENGES.find(c=> !done.includes(c.id));
  if(next){
    $('#ch-next').textContent = next.desc;
  } else {
    $('#ch-next').textContent = 'Semua tantangan selesai. Kamu pemburu sejati!';
  }
  // preview badge chips (3 selesai + sisa kosong)
  const preview = $('#ch-preview'); preview.innerHTML='';
  CHALLENGES.slice(0,5).forEach(ch=>{
    const isDone = done.includes(ch.id);
    const chip = el('span',{class:'ch-mini'+(isDone?' done':'')}, isDone ? ch.badge : '—');
    preview.appendChild(chip);
  });
}
function renderCotd(cats){
  const wrap = $('#home-cotd');
  if(cats.length===0){ wrap.classList.add('hide'); return; }
  // pilih per hari
  if(player.cotdDate !== todayKey() || !player.cotdId || !cats.find(c=>c.id===player.cotdId)){
    const pick = cats[Math.floor(Math.random()*cats.length)];
    player.cotdId = pick.id; player.cotdDate = todayKey(); Store.save(player);
  }
  const c = cats.find(x=>x.id===player.cotdId) || cats[0];
  wrap.classList.remove('hide');
  $('#cotd-name').textContent = c.name;
  $('#cotd-quote').textContent = '"'+c.quote+'"';
  const thumb = $('#cotd-thumb');
  thumb.innerHTML='';
  if(c.photo){ thumb.innerHTML = `<img src="${c.photo}" alt="${c.name}">`; }
}

/* ---------------------------------------------------------------------
   8. Alur temukan kucing (lokasi)
   --------------------------------------------------------------------- */
let pendingLocation = null; // {lat,lon,ts}
let practiceMode = false; // F3 addendum: flag mode latihan

function startFindFlow(){
  go('perm-loc');
}
$('#btn-find').addEventListener('click', startFindFlow);
$('#btn-grant-loc').addEventListener('click', requestLocation);
$('#btn-skip-loc').addEventListener('click', ()=>{
  pendingLocation = null;
  $('#feed-loc-text').textContent = 'lokasi dilewati';
  go('feed');
  initFeed();
});

// F3 addendum: Mode latihan — kalau pemain baru belum ketemu kucing sungguhan,
// biarkan mereka coba alur lengkap (makan -> foto -> verifikasi -> kartu) tanpa
// tekanan. Implementasi simpel: skip lokasi + toast pengingat. Pemain tetap
// bisa simpan kartu kalau mau — tapi dengan label "(latihan)" di nama default
// supaya jelas itu bukan temuan nyata. Tidak ada foto contoh generik karena
// integrity koleksi Meongdex lebih penting daripada simulasi — pemain pakai
// foto apa saja yang mereka punya (bisa foto mainan kucing, gambar, dsb).
$('#btn-practice').addEventListener('click', ()=>{
  pendingLocation = null;
  $('#feed-loc-text').textContent = 'mode latihan (lokasi dilewati)';
  practiceMode = true; // flag global, dicek di buildNewCard untuk label "(latihan)"
  go('feed');
  initFeed();
  setTimeout(()=> toast('Mode latihan aktif. Coba mekaniknya, kalau simpan kartu akan dilabeli (latihan).', '', ICONS.paw), 600);
});
function requestLocation(){
  if(!('geolocation' in navigator)){
    toast('Browser tidak mendukung lokasi','warn',ICONS.warn);
    pendingLocation = null;
    go('feed'); initFeed(); return;
  }
  toast('Mencari lokasimu...','',ICONS.paw);
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      pendingLocation = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: Math.round(pos.coords.accuracy),
        ts: Date.now(),
      };
      $('#feed-loc-text').textContent = `lokasi tercatat · akurasi ${pendingLocation.acc}m`;
      go('feed'); initFeed();
    },
    (err)=>{
      pendingLocation = null;
      $('#feed-loc-text').textContent = 'lokasi ditolak';
      toast('Izin lokasi ditolak, lanjut tanpa lokasi','warn',ICONS.warn);
      go('feed'); initFeed();
    },
    { enableHighAccuracy:true, timeout:10000, maximumAge:60000 }
  );
}

/* ---------------------------------------------------------------------
   9. Kasih makan (charge &amp; throw)
   --------------------------------------------------------------------- */
let feedCharge = 0, chargeTimer=null, feeding=false;

function initFeed(){
  feedCharge = 0; feeding = false;
  $('#feed-meter').style.width = '0%';
  $('#feed-mood').textContent = MOODS[0];
  $('#feed-cat').classList.remove('happy','eating','mood-happy','mood-love','mood-excited');
  $('#feed-hint').textContent = 'Pilih makanan, lalu tahan tombol untuk mengisi daya lemparan.';
  // H2 addendum: pengingat etika lembut di layar Kasih Makan. Pilih tip
  // random sekali per sesi feed (bukan per lempar) supaya tidak mengganggu
  // feedback fungsional yang sudah ada di #feed-hint.
  const ethicsEl = $('#feed-ethics-hint');
  if(ethicsEl){
    ethicsEl.textContent = ETHICS_TIPS[Math.floor(Math.random() * ETHICS_TIPS.length)];
  }
  $('#btn-throw').textContent = '';
  $('#btn-throw').insertAdjacentHTML('afterbegin',
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-1.6 2-1.6 15 0 17M12 3.5c1.6 2 1.6 15 0 17M4.5 9h15M4.5 15h15"/></svg> Tahan untuk isi daya');
  renderFoodPicker();
  renderFeedSession();
}

function renderFeedSession(){
  const wrap = $('#feed-session');
  if(!wrap) return;
  const now = Date.now();
  const active = player.sessionStart && (now - player.sessionStart) < CONFIG.SESSION_WINDOW_MS && player.sessionCatCount >= 1;
  if(!active){ wrap.classList.add('hide'); return; }
  wrap.classList.remove('hide');
  const remaining = Math.max(0, CONFIG.SESSION_WINDOW_MS - (now - player.sessionStart));
  const mins = Math.floor(remaining/60000);
  const secs = Math.floor((remaining%60000)/1000);
  $('#feed-session-count').textContent = player.sessionCatCount;
  $('#feed-session-time').textContent = `${mins}:${String(secs).padStart(2,'0')}`;
  const next = Math.min(CONFIG.SESSION_BONUS_CAP, player.sessionCatCount * CONFIG.SESSION_BONUS_PER_CAT);
  $('#feed-session-bonus').textContent = `+${next} XP berikutnya`;
}

let selectedFood = 'snack';

function renderFoodPicker(){
  const wrap = $('#feed-foods');
  if(!wrap) return;
  wrap.innerHTML='';
  FOODS.forEach(f=>{
    const b = el('button',{class:'food-opt'+(f.id===selectedFood?' active':''), 'data-food':f.id, onclick:()=>{
      selectedFood = f.id;
      renderFoodPicker();
    }});
    // Pakai prop `html` (innerHTML) supaya markup SVG di-parse sebagai elemen,
    // bukan diperlakukan sebagai text node. Bug sebelumnya: foodIconSvg() return
    // string HTML, tapi el() memperlakukan string child sebagai createTextNode,
    // jadi markup SVG tampil sebagai teks literal (terlihat di Android Chrome).
    b.appendChild(el('span',{class:'fico',style:`background:${f.color}22;color:${f.color};`, html:foodIconSvg(f.icon)}));
    b.appendChild(el('span',{class:'fn'}, f.label));
    if(f.xpBonus>0) b.appendChild(el('span',{class:'fx'}, `+${f.xpBonus} XP`));
    wrap.appendChild(b);
  });
}

function foodIconSvg(kind){
  const s='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  if(kind==='fish') return `<svg ${s}><path d="M3 12c0-2 2-4 5-4 5 0 9 3 13 4-4 1-8 4-13 4-3 0-5-2-5-4z"/><path d="M3 12l-1-2M3 12l-1 2"/><circle cx="8" cy="11" r="1"/></svg>`;
  if(kind==='bowl') return `<svg ${s}><path d="M3 11h18l-2 7a2 2 0 0 1-2 1H7a2 2 0 0 1-2-1z"/><path d="M7 7c0-1 1-2 2-2M12 7c0-1 1-2 2-2M17 7c0-1 1-2 2-2"/></svg>`;
  if(kind==='kibble') return `<svg ${s}><circle cx="7" cy="10" r="2.5"/><circle cx="14" cy="8" r="2"/><circle cx="16" cy="14" r="2.5"/><circle cx="9" cy="15" r="2"/></svg>`;
  if(kind==='star') return `<svg ${s}><path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/></svg>`;
  return `<svg ${s}><circle cx="12" cy="12" r="8"/></svg>`;
}

// --- Efek suara dengkuran (Web Audio API, sintetis, tanpa file) ---
let audioCtx = null;
function getPurrAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; }
  }
  return audioCtx;
}
function playPurr(durationMs=1800){
  if(!player.soundEnabled) return;
  const ctx = getPurrAudio(); if(!ctx) return;
  if(ctx.state==='suspended') ctx.resume();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.18, now+0.15);
  master.gain.setValueAtTime(0.18, now + durationMs/1000 - 0.25);
  master.gain.linearRampToValueAtTime(0, now + durationMs/1000);
  master.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type='sine'; osc.frequency.setValueAtTime(28, now);
  const oscGain = ctx.createGain(); oscGain.gain.value=0.7;
  osc.connect(oscGain); oscGain.connect(master);
  const lfo = ctx.createOscillator(); lfo.type='sine'; lfo.frequency.value=6;
  const lfoGain = ctx.createGain(); lfoGain.gain.value=6;
  lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
  const osc2 = ctx.createOscillator(); osc2.type='triangle'; osc2.frequency.value=56;
  const osc2Gain = ctx.createGain(); osc2Gain.gain.value=0.25;
  osc2.connect(osc2Gain); osc2Gain.connect(master);
  osc.start(now); lfo.start(now); osc2.start(now);
  osc.stop(now + durationMs/1000); lfo.stop(now + durationMs/1000); osc2.stop(now + durationMs/1000);
}
function playChime(){
  if(!player.soundEnabled) return;
  const ctx = getPurrAudio(); if(!ctx) return;
  if(ctx.state==='suspended') ctx.resume();
  const now = ctx.currentTime;
  [880, 1320].forEach((freq,i)=>{
    const o = ctx.createOscillator(); o.type='sine'; o.frequency.value=freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0,now+i*0.08); g.gain.linearRampToValueAtTime(0.12,now+i*0.08+0.02); g.gain.exponentialRampToValueAtTime(0.001, now+i*0.08+0.3);
    o.connect(g); g.connect(ctx.destination);
    o.start(now+i*0.08); o.stop(now+i*0.08+0.35);
  });
}

// Confetti animation untuk catch legendaris & epik
function launchConfetti(count=50){
  const colors = ['#E8804C','#D4AF37','#4A9B8E','#F2C6C2','#C9652F','#9b6dd4'];
  const wrap = el('div',{class:'confetti-wrap'});
  document.body.appendChild(wrap);
  for(let i=0;i<count;i++){
    const p = el('div',{class:'confetti-piece'});
    p.style.left = Math.random()*100 + '%';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDuration = (1.5 + Math.random()*1.5) + 's';
    p.style.animationDelay = Math.random()*0.5 + 's';
    p.style.width = (6 + Math.random()*8) + 'px';
    p.style.height = (10 + Math.random()*8) + 'px';
    p.style.borderRadius = Math.random()>0.5 ? '2px' : '999px';
    wrap.appendChild(p);
  }
  setTimeout(()=> wrap.remove(), 4000);
}

const throwBtn = $('#btn-throw');
function startCharge(e){
  e.preventDefault();
  if(feeding) return;
  feeding = true;
  feedCharge = 0;
  chargeTimer = setInterval(()=>{
    feedCharge = Math.min(100, feedCharge + 4);
    $('#feed-meter').style.width = feedCharge + '%';
  }, 30);
}
function releaseCharge(e){
  if(!feeding) return;
  clearInterval(chargeTimer);
  doThrow(feedCharge);
}
throwBtn.addEventListener('pointerdown', startCharge);
throwBtn.addEventListener('pointerup', releaseCharge);
throwBtn.addEventListener('pointerleave', releaseCharge);
// aksesibilitas: spasi/enter = lempar sedang
throwBtn.addEventListener('keydown', (e)=>{
  if((e.key===' '||e.key==='Enter') && !feeding){ e.preventDefault(); feeding=true; feedCharge=60; doThrow(60); }
});

function doThrow(power){
  feeding = true;
  $('#feed-hint').textContent = power>70 ? 'Lemparan kuat!' : power>35 ? 'Lemparan pas.' : 'Lemparan lemah, tapi kucing tetap datang.';
  // animasi makanan terbang
  const scene = $('#feed-scene');
  const fly = el('div',{class:'food-fly'});
  const btnRect = throwBtn.getBoundingClientRect();
  const sceneRect = scene.getBoundingClientRect();
  fly.style.left = (btnRect.left - sceneRect.left + btnRect.width/2) + 'px';
  fly.style.top  = (btnRect.top  - sceneRect.top  + 6) + 'px';
  scene.appendChild(fly);
  const catEl = $('#feed-cat');
  const catRect = catEl.getBoundingClientRect();
  const dx = (catRect.left - sceneRect.left + catRect.width/2) - (btnRect.left - sceneRect.left + btnRect.width/2);
  const dy = (catRect.top  - sceneRect.top  + catRect.height/2) - (btnRect.top  - sceneRect.top  + 6);
  fly.animate([
    { transform:'translate(0,0) scale(1)', opacity:1 },
    { transform:`translate(${dx*0.5}px, ${dy-40}px) scale(1.2)`, opacity:1, offset:0.5 },
    { transform:`translate(${dx}px, ${dy}px) scale(0.4)`, opacity:0 },
  ], { duration:900, easing:'cubic-bezier(.3,.6,.5,1)' }).onfinish = ()=> fly.remove();
  // cat bereaksi — mood tergantung food + power
  const food = FOODS.find(f=>f.id===selectedFood) || FOODS[0];
  const moodClass = food.id==='treat' ? 'mood-love' : (food.id==='wet' ? 'mood-excited' : 'mood-happy');
  const moodLabel = food.id==='treat' ? 'Jatuh hati' : (food.id==='wet' ? 'Gembira' : 'Senang');
  setTimeout(()=>{
    catEl.classList.add('eating');
    $('#feed-mood').textContent = MOODS[3];
    playPurr(1600); // efek suara dengkuran
    if(navigator.vibrate) navigator.vibrate([10,30,10]); // haptic makan
  }, 850);
  setTimeout(()=>{
    catEl.classList.remove('eating');
    catEl.classList.add('happy', moodClass);
    $('#feed-mood').textContent = moodLabel;
    $('#feed-hint').textContent = `Kucingnya suka ${food.label.toLowerCase()}! Saatnya foto.`;
    // heart float untuk treat
    if(food.id==='treat'){
      const scene = $('#feed-scene');
      for(let i=0;i<3;i++){
        const h = el('div',{class:'heart-float',style:`left:${50+i*12}%;top:40%;animation-delay:${i*0.2}s;`});
        h.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/></svg>';
        scene.appendChild(h);
        setTimeout(()=> h.remove(), 1500);
      }
    }
  }, 1700);
  setTimeout(()=>{
    feeding = false;
    go('perm-cam');
  }, 2400);
}

/* ---------------------------------------------------------------------
   10. Foto kucing
   --------------------------------------------------------------------- */
let pendingPhoto = null; // {dataUrl, width, height}
$('#btn-open-cam').addEventListener('click', ()=> $('#photo-input').click());
$('#photo-input').addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  toast('Memproses foto...','',ICONS.paw);
  try{
    const processed = await processImage(file);
    pendingPhoto = processed;
    go('verify');
    runVerify();
  }catch(err){
    console.error(err);
    toast('Gagal memuat foto','warn',ICONS.warn);
  }
});

function processImage(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(reader.error);
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('bad image'));
      img.onload = ()=>{
        let { width, height } = img;
        const max = CONFIG.PHOTO_MAX_EDGE;
        if(width>max || height>max){
          const scale = max / Math.max(width,height);
          width = Math.round(width*scale); height = Math.round(height*scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', CONFIG.PHOTO_QUALITY);
        resolve({ dataUrl, width, height });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------
   11. Verifikasi AI (COCO-SSD) + fallback manual
   --------------------------------------------------------------------- */
let cocoModel = null;
async function loadModel(){
  if(cocoModel) return cocoModel;
  if(typeof cocoSsd==='undefined' || typeof tf==='undefined'){
    throw new Error('library AI belum termuat');
  }
  cocoModel = await cocoSsd.load({ base:'lite_mobilenet_v2' });
  return cocoModel;
}

async function runVerify(){
  // tampilkan foto
  const img = $('#verify-img');
  img.src = pendingPhoto.dataUrl;
  $('#verify-frame').querySelector('.placeholder')?.remove();
  $('#detect-overlay').innerHTML = '';
  $('#verify-loading').classList.remove('hide');
  $('#verify-content').classList.add('hide');

  try{
    const model = await loadModel();
    // tunggu img benar-benar tampil sebelum deteksi
    await new Promise(r=>{ if(img.complete) r(); else img.onload=r; });
    const preds = await model.detect(img);
    const cats = preds.filter(p=> p.class==='cat');
    renderVerifyResult(cats, preds);
  }catch(err){
    console.error('verify error', err);
    renderVerifyResult(null, [], true);
  }
}

function renderVerifyResult(cats, allPreds, errored=false){
  $('#verify-loading').classList.add('hide');
  $('#verify-content').classList.remove('hide');
  const tag = $('#verify-tag');
  const tagText = $('#verify-tag-text');
  const msg = $('#verify-msg');
  const btnText = $('#btn-confirm-text');
  const overlay = $('#detect-overlay');
  // reset state honor challenges setiap render ulang
  const honorWrap = $('#honor-challenges');
  const honorList = $('#honor-list');

  if(errored){
    tag.className = 'ai-tag err';
    tagText.textContent = 'Verifikasi AI gagal';
    msg.textContent = 'Tidak bisa memverifikasi foto otomatis. Kamu yakin ini kucing?';
    btnText.textContent = 'Ya, ini kucing';
    if(honorWrap) honorWrap.classList.add('hide');
    return;
  }
  if(cats && cats.length>0){
    const best = cats.reduce((a,b)=> a.score>b.score?a:b);
    const pct = Math.round(best.score*100);
    tag.className = 'ai-tag';
    tagText.textContent = `AI terdeteksi: kucing (${pct}%)`;
    msg.textContent = 'Terlihat seperti kucing. Simpan ke Meongdex sebagai temuan baru?';
    btnText.textContent = 'Ya, simpan';
    // overlay kotak deteksi
    overlay.innerHTML='';
    const img = $('#verify-img');
    const natW = img.naturalWidth || img.clientWidth || 1;
    const natH = img.naturalHeight || img.clientHeight || 1;
    cats.forEach(c=>{
      const [x,y,w,h] = c.bbox;
      const box = el('div',{class:'box'});
      box.style.left = (x/natW*100)+'%';
      box.style.top  = (y/natH*100)+'%';
      box.style.width= (w/natW*100)+'%';
      box.style.height=(h/natH*100)+'%';
      const lbl = el('div',{class:'lbl'}, `kucing ${Math.round(c.score*100)}%`);
      box.appendChild(lbl);
      overlay.appendChild(box);
    });
    // tampilkan honor challenges (Bagian 2.5 addendum)
    renderHonorChallenges(honorWrap, honorList);
  }else{
    tag.className = 'ai-tag warn';
    tagText.textContent = 'AI belum yakin ini kucing';
    msg.textContent = 'Sepertinya AI belum yakin ini kucing. Kamu yakin ini kucing?';
    btnText.textContent = 'Ya, ini kucing';
    // tetap tampilkan honor challenges walaupun AI belum yakin —
    // pemain bisa konfirmasi manual + centang tantangan
    renderHonorChallenges(honorWrap, honorList);
  }
}

/**
 * Render honor-system challenges di layar verifikasi.
 * Tantangan yang sudah pernah diselesaikan pemain ditandai "selesai"
 * dan tidak bisa dicentang lagi (supaya tidak farmable).
 */
function renderHonorChallenges(wrap, list){
  if(!wrap || !list) return;
  list.innerHTML = '';
  const completed = player.completedHonor || [];
  HONOR_CHALLENGES.forEach(h=>{
    const isDone = completed.includes(h.id);
    const item = el('label', { class:'honor-item' + (isDone?' done':'') });
    item.innerHTML = `
      <input type="checkbox" data-honor-id="${h.id}" ${isDone?'disabled checked':''} style="margin-right:8px;">
      <div class="honor-tx">
        <div class="honor-t">${h.label}</div>
        ${isDone ? '<div class="honor-badge mono">selesai · '+escapeHtml(h.badge)+'</div>' : '<div class="muted" style="font-size:11px;">badge: '+escapeHtml(h.badge)+' · +'+CONFIG.CHALLENGE_BONUS+' XP</div>'}
      </div>`;
    list.appendChild(item);
  });
  wrap.classList.remove('hide');
}

/**
 * Baca checkbox honor-system yang dicentang pemain saat ini.
 * Hanya kembalikan tantangan yang BENAR-BENAR baru diselesaikan
 * (tidak sudah ada di completedHonor).
 */
function readNewlyCheckedHonor(){
  const checked = [];
  const completed = player.completedHonor || [];
  document.querySelectorAll('#honor-list input[type=checkbox][data-honor-id]').forEach(cb=>{
    if(cb.checked && !cb.disabled){
      const id = cb.getAttribute('data-honor-id');
      if(id && !completed.includes(id)) checked.push(id);
    }
  });
  return checked;
}

$('#btn-retake').addEventListener('click', ()=>{
  pendingPhoto = null;
  go('perm-cam');
});
$('#btn-confirm').addEventListener('click', ()=>{
  // capture honor-system checkbox state sebelum pindah screen
  pendingHonorChecked = readNewlyCheckedHonor();
  // lanjut buat kartu
  buildNewCard();
});

/* ---------------------------------------------------------------------
   12. Kartu kucing baru
   --------------------------------------------------------------------- */
let pendingCat = null; // cat object yang akan disimpan
let selectedColor = 'lainnya';
let selectedTemperament = 'unknown'; // G1 addendum: temperamen self-report
let pendingHonorChecked = []; // honor-system challenge id yang dicentang saat verifikasi (Bagian 2.5)

async function buildNewCard(){
  const id = await nextCatId();
  // rarity lengkap (Fase 3): calico -> langka; roll acak untuk epik/legendaris
  let rarity = 'biasa';
  if(selectedColor==='calico'){ rarity = 'langka'; }
  const roll = Math.random();
  if(roll < 0.04) rarity = 'legendaris';      // 4% legendaris
  else if(roll < 0.12) rarity = 'epik';       // 8% epik
  else if(roll < 0.30 || selectedColor==='calico') rarity = (selectedColor==='calico' && roll<0.12) ? 'epik' : 'langka'; // ~18% langka
  // calico tetap minimal langka
  if(selectedColor==='calico' && rarity==='biasa') rarity='langka';
  // C3 addendum: ambil quote dari bank warna spesifik supaya lebih personal
  // G2 addendum: lewat temperamen juga, 50% chance pakai quote temperamen
  const quote = quoteForColor(selectedColor, selectedTemperament);
  // default nama
  const num = parseInt(id.replace(/\D/g,''),10);
  // F3 addendum: kalau practiceMode, label "(latihan)" di nama default
  const defaultName = practiceMode
    ? `Kucing (latihan) #${num}`
    : `Kucing Tanpa Nama #${num}`;
  pendingCat = {
    id,
    name: defaultName,
    photo: pendingPhoto.dataUrl,
    date: new Date().toISOString(),
    lat: pendingLocation ? pendingLocation.lat : null,
    lon: pendingLocation ? pendingLocation.lon : null,
    color: selectedColor,
    rarity,
    quote,
    foodUsed: selectedFood,
    verifiedByAI: $('#verify-tag').classList.contains('err') ? false : ($('#verify-tag').classList.contains('warn') ? false : true),
    temperament: selectedTemperament, // G1 addendum: temperamen self-report
    weatherAtCapture: lastWeatherSnapshot ? lastWeatherSnapshot.label : null, // I3 addendum
  };
  selectedColor = 'lainnya'; // reset pilihan untuk cat berikutnya
  selectedTemperament = 'unknown'; // G1 reset temperamen
  practiceMode = false; // F3 reset practice mode
  renderNewCard();
  go('card');
}

function renderNewCard(){
  const c = pendingCat;
  const card = $('#new-card');
  // reset rarity classes lalu set sesuai rarity
  card.classList.remove('rare','epic','legendary');
  if(c.rarity==='langka') card.classList.add('rare');
  else if(c.rarity==='epik') card.classList.add('epic');
  else if(c.rarity==='legendaris') card.classList.add('legendary','rare');
  // terapkan skin aktif
  card.classList.remove('skin-mint','skin-rose','skin-night');
  if(player.cardSkin && player.cardSkin!=='default') card.classList.add('skin-'+player.cardSkin);
  const rar = RARITIES[c.rarity] || RARITIES.biasa;
  $('#card-id').textContent = '#'+c.id.replace('MDX-','');
  $('#card-rarity').textContent = rar.label;
  $('#card-img').src = c.photo;
  $('#card-name').textContent = c.name;
  const d = new Date(c.date);
  const locText = c.lat!=null ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : 'lokasi tidak dicatat';
  $('#card-sub').textContent = `${d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · ${locText}`;
  // tags
  const tags = $('#card-tags'); tags.innerHTML='';
  const colorLabel = (COLORS.find(x=>x.id===c.color)||{}).label || c.color;
  tags.appendChild(el('span',{}, colorLabel));
  const rarLabel = c.rarity.charAt(0).toUpperCase()+c.rarity.slice(1);
  tags.appendChild(el('span',{}, rarLabel));
  tags.appendChild(el('span',{}, c.verifiedByAI ? 'Terverifikasi AI' : 'Konfirmasi manual'));
  $('#card-quote').textContent = '"'+c.quote+'"';
  // name input
  $('#card-name-input').value = c.name;
  // color picker di meta
  renderColorPicker();
  // E1 addendum: attach tilt 3D + holografik ke kartu baru
  attachTiltToNewCard();
}

function renderColorPicker(){
  const meta = $('#card-meta'); meta.innerHTML='';
  const label = el('div',{class:'mono',style:'font-size:10px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;width:100%;'}, 'Warna bulu');
  meta.appendChild(label);
  COLORS.forEach(col=>{
    const b = el('button',{
      class:'color-opt'+(col.id===selectedColor?' active':''),
      onclick:()=>{ selectedColor = col.id; if(pendingCat){ pendingCat.color = col.id; const isRare = col.id==='calico'?true:(pendingCat.rarity==='langka'); pendingCat.rarity = isRare?'langka':'biasa'; renderNewCard(); } renderColorPicker(); }
    });
    b.appendChild(el('span',{class:'sw',style:`background:${col.hex}`}));
    b.appendChild(el('span',{}, col.label));
    meta.appendChild(b);
  });
  // G1 addendum: temperamen picker (opsional, default "Belum diketahui")
  const tempLabel = el('div',{class:'mono',style:'font-size:10px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;width:100%;margin-top:12px;'}, 'Sifat (opsional)');
  meta.appendChild(tempLabel);
  TEMPERAMENTS.forEach(t=>{
    const b = el('button',{
      class:'temp-opt'+(t.id===selectedTemperament?' active':''),
      onclick:()=>{ selectedTemperament = t.id; if(pendingCat){ pendingCat.temperament = t.id; } renderColorPicker(); }
    });
    b.appendChild(el('span',{class:'tw'}, t.label));
    meta.appendChild(b);
  });
  // bungkus jadi grid
  meta.classList.add('color-grid');
}

$('#card-name-input').addEventListener('input', (e)=>{
  if(!pendingCat) return;
  const v = e.target.value.trim();
  pendingCat.name = v || `Kucing Tanpa Nama #${pendingCat.id.replace(/\D/g,'')}`;
  $('#card-name').textContent = pendingCat.name;
});
$('#btn-set-name').addEventListener('click', ()=>{
  if(!pendingCat) return;
  const v = $('#card-name-input').value.trim();
  pendingCat.name = v || `Kucing Tanpa Nama #${pendingCat.id.replace(/\D/g,'')}`;
  $('#card-name').textContent = pendingCat.name;
  toast('Nama tersimpan','',ICONS.check);
});
$('#btn-discard').addEventListener('click', ()=>{
  pendingCat = null;
  toast('Kartu dibuang','warn',ICONS.warn);
  go('home');
});
$('#btn-save-card').addEventListener('click', ()=>{
  // Bond/trust level (Bagian 2.2 addendum): sebelum simpan, tanyakan apakah
  // ini kucing yang sama dengan yang sudah ada di Meongdex. Kalau ya, naikkan
  // trust level & simpan foto sebagai galeri tambahan di kartu yang sama,
  // alih-alih membuat entri baru.
  promptBondBeforeSave();
});

/**
 * Cari kandidat "kucing yang sama" dari koleksi existing.
 * Strategi sederhana: kucing dengan warna sama, diurutkan by jarak lokasi
 * terdekat (kalau ada koordinat). Batasi 5 kandidat teratas.
 */
function findBondCandidates(allCats, newCat){
  const candidates = (allCats || []).filter(c=> c.color === newCat.color);
  // kalau ada koordinat, urutkan by jarak terdekat
  if(newCat.lat != null && newCat.lon != null){
    candidates.sort((a,b)=>{
      const da = (a.lat!=null && a.lon!=null)
        ? Math.hypot(a.lat-newCat.lat, a.lon-newCat.lon)
        : 9999;
      const db = (b.lat!=null && b.lon!=null)
        ? Math.hypot(b.lat-newCat.lat, b.lon-newCat.lon)
        : 9999;
      return da - db;
    });
  }
  return candidates.slice(0, 5);
}

/**
 * Hitung trust level 1-5 dari jumlah kunjungan.
 * Setiap 2 kunjungan naik 1 level, maks 5.
 */
function trustLevelFromVisits(visits){
  if(!visits || visits < 1) return 1;
  return Math.min(5, 1 + Math.floor((visits - 1) / 1));
}

function promptBondBeforeSave(){
  if(!pendingCat) return;
  const candidates = findBondCandidates(currentCatsCache, pendingCat);
  if(candidates.length === 0){
    // tidak ada kandidat — langsung simpan sebagai entri baru
    saveCat();
    return;
  }
  // tampilkan sheet konfirmasi
  const content = el('div');
  const candidateHtml = candidates.map(c=>{
    const d = new Date(c.date);
    const dateStr = d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
    const lvl = trustLevelFromVisits(c.visits || 1);
    return `
      <label class="bond-cand" data-id="${c.id}">
        <input type="radio" name="bond-id" value="${c.id}" style="margin-right:8px;">
        <div class="bond-thumb" style="background-image:url('${c.photo}');"></div>
        <div class="bond-info">
          <div class="bond-name">${escapeHtml(c.name)} <span class="bond-id mono">#${c.id.replace('MDX-','')}</span></div>
          <div class="bond-meta muted">${dateStr} · trust Lv ${lvl} · ${(c.visits||1)} kunjungan</div>
        </div>
      </label>`;
  }).join('');
  content.innerHTML = `
    <h3>Kucing yang sama?</h3>
    <p class="muted" style="font-size:13px;line-height:1.5;">Apakah ini kucing yang sama dengan yang sudah ada di Meongdex-mu? Kalau ya, foto ini akan masuk sebagai kunjungan tambahan ke kartu yang sudah ada (trust level naik), bukan kartu baru.</p>
    <div class="stack gap-8 mt-12">
      <label class="bond-cand" data-id="">
        <input type="radio" name="bond-id" value="" checked style="margin-right:8px;">
        <div class="bond-thumb bond-thumb-new">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div class="bond-info">
          <div class="bond-name">Bukan, simpan sebagai kartu baru</div>
          <div class="bond-meta muted">Kucing ini berbeda dengan yang sudah ada</div>
        </div>
      </label>
      ${candidateHtml}
    </div>
    <div class="row gap-8 mt-16">
      <button class="btn secondary block" id="bond-cancel">Batal</button>
      <button class="btn block" id="bond-ok">Lanjut</button>
    </div>`;
  openSheet(content);

  $('#bond-cancel').addEventListener('click', closeSheet);
  $('#bond-ok').addEventListener('click', ()=>{
    const chosenId = (content.querySelector('input[name="bond-id"]:checked') || {}).value || '';
    closeSheet();
    if(chosenId){
      // simpan sebagai kunjungan tambahan ke kartu existing
      bondToExistingCat(chosenId).catch(err=>{
        console.error('bond error', err);
        toast('Gagal menyimpan kunjungan, coba lagi','warn',ICONS.warn);
      });
    }else{
      // simpan sebagai entri baru (alur normal)
      saveCat();
    }
  });
}

/**
 * Tambah kunjungan + galeri foto ke kartu yang sudah ada.
 * Naikkan trust level. Beri XP lebih kecil dari kucing baru (karena bukan entri baru).
 */
async function bondToExistingCat(existingId){
  if(!pendingCat) return;
  const existing = await getCat(existingId);
  if(!existing){
    toast('Kucing tidak ditemukan, coba lagi','warn',ICONS.warn);
    return;
  }
  const btn = $('#btn-save-card'); if(btn) btn.disabled = true;
  try{
    // gabungkan foto baru ke galeri
    const gallery = Array.isArray(existing.gallery) ? existing.gallery.slice() : [];
    gallery.push({ photo: pendingCat.photo, date: pendingCat.date, foodUsed: pendingCat.foodUsed });
    // simpan maks 6 foto di galeri (rolling window) supaya IndexedDB tidak bengkak
    while(gallery.length > 6) gallery.shift();
    const visits = (existing.visits || 1) + 1;
    const oldTrust = trustLevelFromVisits(existing.visits || 1);
    const newTrust = trustLevelFromVisits(visits);
    const updated = Object.assign({}, existing, {
      visits,
      gallery,
      lastVisitDate: pendingCat.date,
    });
    await addCat(updated);

    // XP: kunjungan tambahan hanya XP_PER_CAT (tanpa rarity bonus, agar tidak farmable)
    const oldLevel = levelFromXp(player.xp);
    const gain = CONFIG.XP_PER_CAT;
    player.xp += gain;
    player.fed += 1;

    // sesi berburu juga berlaku untuk kunjungan ulang
    const now = Date.now();
    let sessionBonus = 0;
    let sessionCount = 1;
    if(player.sessionStart && (now - player.sessionStart) < CONFIG.SESSION_WINDOW_MS){
      player.sessionCatCount += 1;
      sessionCount = player.sessionCatCount;
      sessionBonus = Math.min(CONFIG.SESSION_BONUS_CAP, (sessionCount-1) * CONFIG.SESSION_BONUS_PER_CAT);
      player.xp += sessionBonus;
    } else {
      player.sessionStart = now;
      player.sessionCatCount = 1;
    }

    Store.save(player);
    currentCatsCache = await allCats();
    pendingCat = null;
    if(btn) btn.disabled = false;

    toast(`Kunjungan ke-${visits} untuk ${existing.name}! +${gain} XP`, 'success', ICONS.paw);
    if(navigator.vibrate) navigator.vibrate([10]);
    if(newTrust > oldTrust){
      setTimeout(()=> toast(`Trust level naik ke Lv ${newTrust}! ${newTrust>=5?'Sahabat Karib!':''}`, 'gold', ICONS.star), 600);
    }
    if(sessionBonus > 0){
      setTimeout(()=> toast(`Bonus sesi berburu: +${sessionBonus} XP (${sessionCount} kucing)`, 'success', ICONS.paw), 1000);
    }

    const newLevel = levelFromXp(player.xp);
    if(newLevel > oldLevel){
      setTimeout(()=> showLevelUp(newLevel), 800);
      setTimeout(()=>{ renderHome(); go('dex'); }, 1500);
    }else{
      setTimeout(()=>{ renderHome(); go('dex'); }, 700);
    }
  }catch(err){
    console.error(err);
    if(btn) btn.disabled = false;
    toast('Gagal menyimpan kunjungan','warn',ICONS.warn);
  }
}

async function saveCat(){
  if(!pendingCat) return;
  const btn = $('#btn-save-card'); btn.disabled = true;
  try{
    // terapkan warna final (pakai selectedColor terbaru dari color picker di card screen)
    pendingCat.color = selectedColor;
    // calico minimal langka
    if(selectedColor==='calico' && pendingCat.rarity==='biasa') pendingCat.rarity='langka';
    // simpan makanan yang dipakai (dari feed)
    pendingCat.foodUsed = pendingCat.foodUsed || 'snack';
    // jika nama kosong, default
    if(!pendingCat.name || pendingCat.name.startsWith('Kucing Tanpa Nama')){
      // biarkan default
    }
    // Bond/trust: cat baru selalu mulai dengan visits=1, trust Lv 1
    pendingCat.visits = 1;
    pendingCat.gallery = [];
    await addCat(pendingCat);
    // refresh cache SEBELUM cek challenge (butuh data terbaru)
    currentCatsCache = await allCats();
    // update stat
    const oldLevel = levelFromXp(player.xp);
    let gain = CONFIG.XP_PER_CAT + (CONFIG.RARITY_XP[pendingCat.rarity] || 0);
    // bonus makanan
    const food = FOODS.find(f=>f.id===pendingCat.foodUsed);
    if(food && food.xpBonus){ gain += food.xpBonus; }
    // event musiman multiplier
    const ev = getCurrentEvent();
    let eventBonus = 0;
    if(ev && ev.filter && ev.filter(pendingCat)){
      eventBonus = Math.round(gain * (ev.mult - 1));
      gain += eventBonus;
    }
    player.xp += gain;
    player.fed += 1;

    // --- Sesi Berburu (Fase 3) ---
    const now = Date.now();
    let sessionBonus = 0;
    let sessionCount = 1;
    if(player.sessionStart && (now - player.sessionStart) < CONFIG.SESSION_WINDOW_MS){
      player.sessionCatCount += 1;
      sessionCount = player.sessionCatCount;
      sessionBonus = Math.min(CONFIG.SESSION_BONUS_CAP, (sessionCount-1) * CONFIG.SESSION_BONUS_PER_CAT);
      player.xp += sessionBonus;
      gain += sessionBonus;
    } else {
      player.sessionStart = now;
      player.sessionCatCount = 1;
    }

    // --- Streak harian (Fase 3) ---
    const today = todayKey();
    if(player.lastStreakDate !== today){
      if(player.lastStreakDate){
        // cek apakah kemarin
        const yest = new Date(); yest.setDate(yest.getDate()-1);
        const yestKey = `${yest.getFullYear()}-${yest.getMonth()+1}-${yest.getDate()}`;
        if(player.lastStreakDate === yestKey){ player.streak += 1; }
        else { player.streak = 1; }
      } else {
        player.streak = 1;
      }
      player.lastStreakDate = today;
    }

    // --- Tantangan Foto Kreatif (Fase 3) ---
    const newlyCompleted = [];
    CHALLENGES.forEach(ch=>{
      if(player.completedChallenges.includes(ch.id)) return;
      try{
        if(ch.check(pendingCat, currentCatsCache)){
          player.completedChallenges.push(ch.id);
          newlyCompleted.push(ch);
          player.xp += CONFIG.CHALLENGE_BONUS;
          gain += CONFIG.CHALLENGE_BONUS;
        }
      }catch(e){}
    });

    // --- Tantangan honor-system (Bagian 2.5 addendum) ---
    // Tantangan yang dicentang pemain di layar verifikasi. Self-report jujur.
    // Tiap tantangan hanya bisa diselesaikan sekali sepanjang permainan.
    const newlyHonor = [];
    if(pendingHonorChecked && pendingHonorChecked.length > 0){
      player.completedHonor = player.completedHonor || [];
      pendingHonorChecked.forEach(id=>{
        if(player.completedHonor.includes(id)) return; // safety: skip duplikat
        const h = HONOR_CHALLENGES.find(x=>x.id===id);
        if(!h) return;
        player.completedHonor.push(id);
        newlyHonor.push(h);
        player.xp += CONFIG.CHALLENGE_BONUS;
        gain += CONFIG.CHALLENGE_BONUS;
      });
    }
    pendingHonorChecked = []; // reset setelah dipakai

    // --- Misi harian (existing) ---
    if(!player.missionDone && player.missionDate===today){
      player.missionCount += 1;
      if(player.missionCount >= CONFIG.MISSION_GOAL){
        player.missionDone = true;
        player.xp += CONFIG.MISSION_BONUS;
        gain += CONFIG.MISSION_BONUS;
      }
    } else if(player.missionDate!==today){
      player.missionDate = today; player.missionCount=1; player.missionDone=false;
    }

    // --- Misi mingguan (C2 addendum) ---
    // Cek completion: kalau belum done dan check(state) true, beri bonus XP.
    let weeklyMissionJustCompleted = false;
    if(!player.weeklyMissionDone && player.weeklyMissionId){
      const mission = WEEKLY_MISSIONS.find(m=>m.id===player.weeklyMissionId);
      if(mission){
        const state = computeWeeklyState(currentCatsCache);
        if(mission.check(state)){
          player.weeklyMissionDone = true;
          player.xp += CONFIG.WEEKLY_MISSION_BONUS;
          gain += CONFIG.WEEKLY_MISSION_BONUS;
          weeklyMissionJustCompleted = true;
        }
      }
    }

    Store.save(player);
    const newLevel = levelFromXp(player.xp);

    // --- Toast rangkaian (simpan ref sebelum null) ---
    const savedCat = pendingCat;
    pendingCat = null;
    btn.disabled = false;
    toast(`Nomor ${savedCat.id} terdaftar di Meongdex-mu!`, savedCat.rarity==='langka'?'gold':'success', ICONS.star);
    playChime();
    if(navigator.vibrate) navigator.vibrate(savedCat.rarity==='legendaris'?[20,40,20,40,20]:[15]);
    // confetti untuk legendaris & epik
    if(savedCat.rarity==='legendaris' || savedCat.rarity==='epik'){
      launchConfetti(savedCat.rarity==='legendaris' ? 60 : 30);
    }
    if(eventBonus > 0 && ev){
      setTimeout(()=> toast(`Bonus event ${ev.label}: +${eventBonus} XP`, 'gold', ICONS.star), 500);
    }
    if(sessionBonus > 0){
      setTimeout(()=> toast(`Bonus sesi berburu: +${sessionBonus} XP (${sessionCount} kucing)`, 'success', ICONS.paw), 900);
    }
    newlyCompleted.forEach((ch, i)=>{
      setTimeout(()=> toast(`Tantangan selesai: ${ch.label} (+${CONFIG.CHALLENGE_BONUS} XP)`, 'gold', ICONS.star), 1100 + i*900);
    });
    newlyHonor.forEach((h, i)=>{
      const offset = 1100 + newlyCompleted.length*900 + i*900;
      setTimeout(()=> toast(`Tantangan foto: ${h.label} (+${CONFIG.CHALLENGE_BONUS} XP)`, 'gold', ICONS.star), offset);
    });
    if(weeklyMissionJustCompleted){
      const offset = 1100 + (newlyCompleted.length + newlyHonor.length) * 900;
      setTimeout(()=> toast(`Misi minggu ini selesai: +${CONFIG.WEEKLY_MISSION_BONUS} XP`, 'gold', ICONS.star), offset);
    }
    // Auth & sync: trigger auto-sync debounced setelah save (kalau login)
    triggerSyncAfterSave();
    // level up?
    if(newLevel > oldLevel){
      setTimeout(()=> showLevelUp(newLevel), 800);
      setTimeout(()=>{ renderHome(); go('dex'); }, 1500);
    }else{
      setTimeout(()=>{ renderHome(); go('dex'); }, 700);
    }
  }catch(err){
    console.error(err);
    btn.disabled = false;
    toast('Gagal menyimpan','warn',ICONS.warn);
  }
}

function showLevelUp(lvl){
  const content = el('div',{class:'levelup'});
  content.insertAdjacentHTML('beforeend',
    `<div class="ring"><svg viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/></svg></div>
     <div class="mono" style="font-size:11px;color:var(--teal-deep);letter-spacing:.1em;">LEVEL BARU</div>
     <div class="lvl">Lv ${lvl}</div>
     <h3>Selamat, pemburu!</h3>
     <p>Kamu naik ke level ${lvl}. Terus berburu kucing untuk membuka lebih banyak kartu.</p>
     <button class="btn block" onclick="document.getElementById('overlay').classList.remove('active')">Lanjut</button>`);
  openSheet(content);
}

/* ---------------------------------------------------------------------
   13. Meongdex (koleksi corkboard)
   --------------------------------------------------------------------- */
let currentCatsCache = [];
let currentFilter = 'all';
let currentSearch = '';

async function renderDex(){
  // tampilkan skeleton saat loading
  const cork = $('#dex-cork');
  cork.innerHTML='';
  for(let i=0;i<4;i++){
    const sk = el('div',{class:'skel-mini-card'});
    sk.innerHTML = '<div class="skel-pin"></div><div class="skel-thumb skeleton"></div><div class="skel-name skeleton"></div>';
    cork.appendChild(sk);
  }
  // small delay untuk efek skeleton (lebih natural)
  await new Promise(r=>setTimeout(r,250));
  currentCatsCache = await allCats();
  $('#dex-count').textContent = `${currentCatsCache.length} kucing`;
  // C1 enhancement: mini distribusi warna di Meongdex cork-head.
  // Bar horizontal ringkas — setiap warna jadi segmen dengan lebar proporsional
  // ke jumlah kucing warna itu. Klik segmen = filter by warna itu.
  // Distribusi lengkap (dengan label angka per warna) tetap di layar Statistik.
  renderDexColorStrip(currentCatsCache);
  const q = currentSearch.toLowerCase().trim();
  const filtered = currentCatsCache.filter(c=>{
    if(currentFilter==='all') {/* ok */}
    else if(currentFilter==='fav'){ if(!(player.favorites||[]).includes(c.id)) return false; }
    else if(['biasa','langka','epik','legendaris'].includes(currentFilter)){ if(c.rarity!==currentFilter) return false; }
    else { if(c.color!==currentFilter) return false; }
    if(q && !(c.name||'').toLowerCase().includes(q)) return false;
    return true;
  });
  cork.innerHTML='';
  if(currentCatsCache.length===0){
    cork.appendChild(emptyCorkboard());
    return;
  }
  if(filtered.length===0){
    const empty = el('div',{class:'dex-empty-search'});
    empty.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C9652F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 8px;display:block;"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>Tidak ada kucing yang cocok dengan "'+escapeHtml(currentSearch)+'"';
    cork.appendChild(empty);
    return;
  }
  filtered.forEach(c=> cork.appendChild(miniCard(c)));
  if(filtered.length % 2 !== 0){
    cork.appendChild(emptySlot());
  }
}

/**
 * C1 enhancement: render mini distribusi warna di Meongdex cork-head.
 * Bar horizontal dengan segmen per warna, lebar proporsional ke jumlah kucing.
 * Klik segmen = filter by warna. Hover = tooltip label + count.
 * Kalau koleksi kosong, strip di-hide.
 */
function renderDexColorStrip(cats){
  const strip = $('#dex-color-strip');
  if(!strip) return;
  if(!cats || cats.length === 0){
    strip.classList.add('hide');
    strip.innerHTML = '';
    return;
  }
  strip.classList.remove('hide');
  strip.innerHTML = '';
  const total = cats.length;
  COLORS.forEach(col=>{
    const count = cats.filter(c=>c.color===col.id).length;
    if(count === 0) return; // skip warna yang belum ada
    const pct = (count / total) * 100;
    const seg = el('button', {
      class: 'dcs-seg' + (currentFilter === col.id ? ' active' : ''),
      'data-color': col.id,
      'aria-label': `${col.label}: ${count} kucing`,
      title: `${col.label} — ${count} kucing`,
      style: `background:${col.hex};flex:${count};`,
      onclick: ()=>{
        // toggle filter by color
        currentFilter = (currentFilter === col.id) ? 'all' : col.id;
        $$('#dex-filter button').forEach(b=>b.classList.toggle('active', b.dataset.filter === currentFilter));
        renderDex();
      },
    });
    strip.appendChild(seg);
  });
  // kalau semua segmen kosong (semua warna 0), hide strip
  if(strip.children.length === 0){
    strip.classList.add('hide');
  }
}

// search bar handlers
$('#dex-search-input').addEventListener('input', (e)=>{
  currentSearch = e.target.value;
  $('#dex-search').classList.toggle('has-text', !!currentSearch);
  renderDex();
});
$('#dex-search-clear').addEventListener('click', ()=>{
  currentSearch = '';
  $('#dex-search-input').value = '';
  $('#dex-search').classList.remove('has-text');
  renderDex();
});

function emptyCorkboard(){
  const wrap = el('div',{class:'empty-state',style:'grid-column:1/-1;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-lg);margin:8px 0;'});
  wrap.insertAdjacentHTML('beforeend',
    `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Maskot Si Oren" style="width:140px;">
      <ellipse cx="100" cy="158" rx="58" ry="14" fill="rgba(58,46,42,0.10)"/>
      <path d="M55 70 L38 28 L78 56 Z" fill="#E8804C"/>
      <path d="M145 70 L162 28 L122 56 Z" fill="#E8804C"/>
      <path d="M60 66 L48 42 L74 56 Z" fill="#C9652F" opacity="0.55"/>
      <path d="M140 66 L152 42 L126 56 Z" fill="#C9652F" opacity="0.55"/>
      <ellipse cx="100" cy="115" rx="62" ry="55" fill="#E8804C"/>
      <ellipse cx="100" cy="128" rx="30" ry="24" fill="#FFF8ED"/>
      <circle cx="82" cy="108" r="7.5" fill="#3A2E2A"/>
      <circle cx="118" cy="108" r="7.5" fill="#3A2E2A"/>
      <circle cx="84.5" cy="105" r="2.4" fill="#fff"/>
      <circle cx="120.5" cy="105" r="2.4" fill="#fff"/>
      <path d="M96 120 q4 4 4 4 q0 0 4 -4" stroke="#3A2E2A" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M94 124 q6 6 12 0" stroke="#3A2E2A" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M60 155 Q100 178 140 155" stroke="#C9652F" stroke-width="6" fill="none" stroke-linecap="round"/>
    </svg>
    <h3>Belum ada kucing di Meongdex-mu</h3>
    <p>Yuk keluar rumah, temukan kucing pertamamu, kasih makan, dan abadikan sebagai kartu.</p>`);
  return wrap;
}
function emptySlot(){
  return el('div',{class:'mini-card empty'}, el('div',{class:'q'},'?'));
}
function miniCard(c){
  let extraClass = '';
  if(c.rarity==='langka') extraClass=' rare';
  else if(c.rarity==='epik') extraClass=' epic';
  else if(c.rarity==='legendaris') extraClass=' legendary rare';
  if((player.favorites||[]).includes(c.id)) extraClass+=' fav';
  const card = el('div',{class:'mini-card'+extraClass, onclick:()=>openCatDetail(c.id)});
  card.appendChild(el('div',{class:'pin'}));
  const thumb = el('div',{class:'thumb'});
  if(c.photo) thumb.innerHTML = `<img src="${c.photo}" alt="${c.name}">`;
  card.appendChild(thumb);
  card.appendChild(el('div',{class:'name'}, c.name));
  card.appendChild(el('div',{class:'mini-id'}, '#'+c.id.replace('MDX-','')));
  // fav badge — pakai ICONS.star (SVG line-icon) bukan karakter Unicode,
  // konsisten dengan signature visual "semua ikon SVG" sejak Fase 1.
  const favBadge = el('div',{class:'fav-badge', html:ICONS.star});
  card.appendChild(favBadge);
  return card;
}

$$('#dex-filter button').forEach(b=>{
  b.addEventListener('click', ()=>{
    $$('#dex-filter button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    currentFilter = b.dataset.filter;
    renderDex();
  });
});

// C6 addendum: tombol ekspor lembar album di Meongdex cork-head
$('#btn-album-export').addEventListener('click', ()=> openAlbumSheet());

async function openCatDetail(id){
  const c = await getCat(id);
  if(!c) return;
  const allCatsList = await allCats();
  const badges = detectTwinBadges(allCatsList);
  const myBadges = badges[c.id] || [];
  const content = el('div');
  const colorLabel = (COLORS.find(x=>x.id===c.color)||{}).label || c.color;
  const d = new Date(c.date);
  const locText = c.lat!=null ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : 'lokasi tidak dicatat';
  const rar = RARITIES[c.rarity] || RARITIES.biasa;
  const rarLabel = c.rarity.charAt(0).toUpperCase()+c.rarity.slice(1);
  // rarity class untuk card
  let rarClass = '';
  if(c.rarity==='langka') rarClass='rare';
  else if(c.rarity==='epik') rarClass='epic';
  else if(c.rarity==='legendaris') rarClass='legendary rare';
  // skin class
  let skinClass = '';
  if(player.cardSkin && player.cardSkin!=='default') skinClass = ' skin-'+player.cardSkin;
  const badgeHtml = myBadges.length ? `<div class="badge-grid">${myBadges.map(b=>
    `<span class="badge-chip blush"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>${b.label}</span>`
  ).join('')}</div>` : '';

  // --- Bond/trust level (Bagian 2.2 addendum) ---
  const visits = c.visits || 1;
  const trustLvl = trustLevelFromVisits(visits);
  const isBestFriend = trustLvl >= 5;
  const trustDots = Array.from({length:5}, (_,i)=>
    `<span class="trust-dot ${i<trustLvl?'filled':''}"></span>`
  ).join('');
  const trustHtml = `
    <div class="trust-block ${isBestFriend?'best-friend':''}">
      <div class="trust-head">
        <span class="trust-label">IKATAN</span>
        ${isBestFriend ? '<span class="trust-badge">Sahabat Karib</span>' : ''}
      </div>
      <div class="trust-row">
        <div class="trust-dots">${trustDots}</div>
        <span class="trust-meta mono">Lv ${trustLvl} · ${visits} kunjungan</span>
      </div>
    </div>`;

  // --- Galeri foto kunjungan (Bagian 2.2 addendum) ---
  const gallery = Array.isArray(c.gallery) ? c.gallery : [];
  const galleryHtml = gallery.length > 0 ? `
    <div class="gallery-block">
      <div class="gallery-label">KUNJUNGAN LAIN</div>
      <div class="gallery-strip">
        ${gallery.map(g=>{
          const gd = new Date(g.date);
          const gs = gd.toLocaleDateString('id-ID',{day:'numeric',month:'short'});
          return `<div class="gallery-thumb" style="background-image:url('${g.photo}');" title="${gs}"></div>`;
        }).join('')}
      </div>
    </div>` : '';

  // --- G3 addendum: "Titipan kecil" memento naratif per kucing ---
  // Murni kosmetik, bukan currency. Generate dari data yang SUDAH ada
  // (galeri kunjungan + waktu-waktu kunjungan), bukan field baru.
  let mementoHtml = '';
  if(visits >= 3){
    // analisis pola waktu kunjungan dari gallery + date utama
    const allDates = [c.date, ...gallery.map(g=>g.date)].map(d=>new Date(d)).filter(d=>!isNaN(d));
    const hours = allDates.map(d=>d.getHours());
    const avgHour = hours.reduce((s,h)=>s+h,0) / hours.length;
    let timeHint = '';
    if(avgHour >= 5 && avgHour < 11) timeHint = 'pagi';
    else if(avgHour >= 11 && avgHour < 15) timeHint = 'siang';
    else if(avgHour >= 15 && avgHour < 18) timeHint = 'sore';
    else timeHint = 'malam';
    const temperLabel = (c.temperament && c.temperament!=='unknown')
      ? (TEMPERAMENTS.find(t=>t.id===c.temperament)||{}).label
      : null;
    let memento = `${escapeHtml(c.name)} biasa muncul pas ${timeHint}`;
    if(temperLabel) memento += ` — terlihat ${temperLabel.toLowerCase()} tiap ketemu`;
    memento += '.';
    mementoHtml = `
      <div class="memento-block">
        <div class="memento-label">TITIPAN KECIL</div>
        <div class="memento-text">${memento}</div>
      </div>`;
  }

  content.innerHTML = `
    <h3>${escapeHtml(c.name)}</h3>
    <p class="mono" style="font-size:12px;color:var(--text-soft);margin-bottom:12px;">#${c.id} · ${d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
    <div class="trading-card ${rarClass}${skinClass}" style="width:100%;transform:none;margin-bottom:14px;">
      <div class="id">#${c.id.replace('MDX-','')}</div>
      <div class="rarity-tag">${rar.label}</div>
      ${isBestFriend ? '<div class="best-friend-pin">Sahabat Karib</div>' : ''}
      <div class="photo" style="height:200px;"><img src="${c.photo}" alt="${escapeHtml(c.name)}"></div>
      <h4>${escapeHtml(c.name)}</h4>
      <div class="sub">${d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · ${locText}${c.weatherAtCapture ? ` · cuaca ${c.weatherAtCapture.toLowerCase()}` : ''}</div>
      <div class="tag-row"><span>${colorLabel}</span><span>${rarLabel}</span><span>${c.verifiedByAI?'Terverifikasi AI':'Konfirmasi manual'}</span>${c.temperament && c.temperament!=='unknown' ? `<span>${(TEMPERAMENTS.find(t=>t.id===c.temperament)||{}).label || c.temperament}</span>` : ''}</div>
      <div class="quote">"${escapeHtml(c.quote)}"</div>
    </div>
    ${trustHtml}
    ${galleryHtml}
    ${mementoHtml}
    ${badgeHtml}
    <div class="row gap-8" style="flex-wrap:wrap;">
      <span class="pill">${c.verifiedByAI?'AI':'Manual'}</span>
      <span class="pill">${colorLabel}</span>
      <span class="pill">${locText}</span>
    </div>
    <div id="skin-picker-host" class="card-meta color-grid" style="margin-top:12px;"></div>
    <div class="row gap-8 mt-16">
      <button class="btn teal block" id="detail-share">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
        Bagikan
      </button>
      <button class="btn secondary block" id="detail-fav">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/></svg>
        <span id="fav-label">Favorit</span>
      </button>
      <button class="btn secondary block" id="detail-rename">Ganti nama</button>
      <button class="btn block danger" id="detail-delete" style="background:#a8462e;color:#fff;">Hapus</button>
    </div>`;
  openSheet(content);
  // set fav state
  const isFav = (player.favorites||[]).includes(c.id);
  const favBtn = $('#detail-fav');
  favBtn.classList.toggle('active', isFav);
  $('#fav-label').textContent = isFav ? 'Hapus favorit' : 'Favorit';
  // E1 addendum: attach tilt 3D ke kartu di detail sheet
  setTimeout(attachTiltToDetailCard, 200);
  // skin picker
  const skinHost = $('#skin-picker-host');
  if(skinHost) renderSkinPicker(skinHost, player.cardSkin, (newSkin)=>{
    player.cardSkin = newSkin; Store.save(player);
    toast('Tema kartu diterapkan','',ICONS.check);
  });
  $('#detail-share').addEventListener('click', ()=> openShareSheet(c));
  $('#detail-fav').addEventListener('click', ()=>{
    player.favorites = player.favorites || [];
    const idx = player.favorites.indexOf(c.id);
    if(idx>=0){ player.favorites.splice(idx,1); toast('Dihapus dari favorit','warn',ICONS.warn); }
    else { player.favorites.push(c.id); toast('Ditambahkan ke favorit','success',ICONS.star); playChime(); }
    Store.save(player);
    const now = (player.favorites||[]).includes(c.id);
    favBtn.classList.toggle('active', now);
    $('#fav-label').textContent = now ? 'Hapus favorit' : 'Favorit';
    renderDex();
  });
  $('#detail-rename').addEventListener('click', ()=> renameCat(c));
  $('#detail-delete').addEventListener('click', ()=> deleteCatConfirm(c));
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

async function renameCat(c){
  const content = el('div');
  content.innerHTML = `
    <h3>Ganti nama kucing</h3>
    <p>Beri nama baru untuk ${escapeHtml(c.name)}.</p>
    <div class="name-edit" style="width:100%;"><input id="rn-input" type="text" maxlength="24" value="${escapeHtml(c.name)}" /></div>
    <div class="row gap-8 mt-12">
      <button class="btn secondary block" id="rn-cancel">Batal</button>
      <button class="btn block" id="rn-save">Simpan</button>
    </div>`;
  openSheet(content);
  $('#rn-cancel').addEventListener('click', ()=> openCatDetail(c.id));
  $('#rn-save').addEventListener('click', async ()=>{
    const v = $('#rn-input').value.trim();
    if(!v) return;
    c.name = v; await addCat(c);
    currentCatsCache = await allCats();
    toast('Nama diperbarui','',ICONS.check);
    closeSheet();
    renderDex(); renderHome();
  });
}
async function deleteCatConfirm(c){
  const content = el('div');
  content.innerHTML = `
    <h3>Hapus kartu ini?</h3>
    <p>${escapeHtml(c.name)} akan dihapus permanen dari Meongdex-mu. Tindakan ini tidak bisa dibatalkan.</p>
    <div class="row gap-8 mt-12">
      <button class="btn secondary block" id="dl-cancel">Batal</button>
      <button class="btn block" id="dl-ok" style="background:#a8462e;color:#fff;">Ya, hapus</button>
    </div>`;
  openSheet(content);
  $('#dl-cancel').addEventListener('click', ()=> openCatDetail(c.id));
  $('#dl-ok').addEventListener('click', async ()=>{
    await deleteCat(c.id);
    currentCatsCache = await allCats();
    toast('Kartu dihapus','warn',ICONS.warn);
    closeSheet();
    renderDex(); renderHome();
  });
}

/* ---------------------------------------------------------------------
   13b. Jurnal Berburu (linimasa harian otomatis)
   --------------------------------------------------------------------- */
async function renderJournal(){
  const list = $('#journal-list');
  list.innerHTML='';
  for(let i=0;i<3;i++){
    const sk = el('div',{class:'skel-journal-entry skeleton'});
    list.appendChild(sk);
  }
  await new Promise(r=>setTimeout(r,250));
  const cats = await allCats();
  $('#journal-count').textContent = `${cats.length} catatan`;
  if(cats.length===0){
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:140px;">
        <ellipse cx="100" cy="158" rx="58" ry="14" fill="rgba(58,46,42,0.10)"/>
        <path d="M55 70 L38 28 L78 56 Z" fill="#E8804C"/>
        <path d="M145 70 L162 28 L122 56 Z" fill="#E8804C"/>
        <ellipse cx="100" cy="115" rx="62" ry="55" fill="#E8804C"/>
        <ellipse cx="100" cy="128" rx="30" ry="24" fill="#FFF8ED"/>
        <circle cx="82" cy="108" r="7.5" fill="#3A2E2A"/>
        <circle cx="118" cy="108" r="7.5" fill="#3A2E2A"/>
        <path d="M94 124 q6 6 12 0" stroke="#3A2E2A" stroke-width="3" fill="none" stroke-linecap="round"/>
      </svg>
      <h3>Jurnalmu masih kosong</h3>
      <p>Setiap kucing yang kamu temukan akan otomatis tercatat di sini, dikelompokkan per hari.</p>
    </div>`;
    return;
  }
  // kelompokkan per hari (yyyy-mm-dd)
  const byDay = {};
  cats.forEach(c=>{
    const d = new Date(c.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    (byDay[key] = byDay[key] || []).push(c);
  });
  // urut hari terbaru di atas
  const days = Object.keys(byDay).sort().reverse();
  list.innerHTML='';
  days.forEach(key=>{
    const entries = byDay[key].sort((a,b)=> new Date(b.date)-new Date(a.date));
    const d = new Date(key+'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const yest = new Date(today); yest.setDate(yest.getDate()-1);
    let label;
    if(d.getTime()===today.getTime()) label='Hari ini';
    else if(d.getTime()===yest.getTime()) label='Kemarin';
    else label=d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const totalXp = entries.reduce((s,c)=> s + CONFIG.XP_PER_CAT + (CONFIG.RARITY_XP[c.rarity] || 0), 0);
    const dayWrap = el('div',{class:'journal-day'});
    dayWrap.appendChild(el('div',{class:'journal-day-head'}, [
      el('span',{class:'date-pill'}, label),
      el('span',{class:'total'}, `${entries.length} kucing · +${totalXp} XP`),
      el('span',{class:'line'}),
    ]));
    entries.forEach(c=>{
      const d2 = new Date(c.date);
      const hh = String(d2.getHours()).padStart(2,'0');
      const mm = String(d2.getMinutes()).padStart(2,'0');
      const colorLabel = (COLORS.find(x=>x.id===c.color)||{}).label || c.color;
      const xp = CONFIG.XP_PER_CAT + (CONFIG.RARITY_XP[c.rarity] || 0);
      const entry = el('div',{class:'journal-entry'+(c.rarity!=='biasa'?' rare':''), onclick:()=>openCatDetail(c.id)});
      entry.appendChild(el('div',{class:'time'}, [el('b',{},hh), mm]));
      const thumb = el('div',{class:'thumb'});
      if(c.photo) thumb.innerHTML = `<img src="${c.photo}" alt="${escapeHtml(c.name)}">`;
      entry.appendChild(thumb);
      const info = el('div',{class:'info'});
      info.appendChild(el('div',{class:'n'}, c.name));
      info.appendChild(el('div',{class:'m'}, `#${c.id.replace('MDX-','')} · ${colorLabel} · ${c.rarity}`));
      entry.appendChild(info);
      entry.appendChild(el('div',{class:'xp'}, `+${xp}`));
      dayWrap.appendChild(entry);
    });
    // E3 addendum: stagger fade-in delay supaya linimasa "mengalir turun"
    if(!prefersReducedMotion){
      dayWrap.style.animationDelay = (days.indexOf(key) * 0.08) + 's';
    }
    list.appendChild(dayWrap);
  });
}

/* ---------------------------------------------------------------------
   13b2. Peta hotspot sarang kucing (Leaflet)
   --------------------------------------------------------------------- */
let leafletMap = null;
let leafletReady = false;

async function renderMap(){
  const cats = await allCats();
  const withLoc = cats.filter(c=> c.lat!=null && c.lon!=null);
  $('#map-count').textContent = `${withLoc.length} titik`;
  const empty = $('#map-empty');
  if(withLoc.length === 0){
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  if(typeof L === 'undefined'){
    // Leaflet belum termuat (offline pertama kali). Tampilkan empty dengan catatan.
    empty.style.display = 'flex';
    empty.querySelector('h3').textContent = 'Peta belum siap';
    empty.querySelector('p').textContent = 'Peta butuh internet untuk dimuat. Buka layar ini lagi saat online.';
    return;
  }
  leafletReady = true;
  // init map sekali
  if(!leafletMap){
    leafletMap = L.map('leaflet-map', { zoomControl:true, attributionControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(leafletMap);
  }
  // hitung bounds
  const bounds = L.latLngBounds(withLoc.map(c=>[c.lat, c.lon]));
  // tambah/update marker
  leafletMap.eachLayer(l=>{ if(l instanceof L.Marker) leafletMap.removeLayer(l); });
  withLoc.forEach(c=>{
    const colorLabel = (COLORS.find(x=>x.id===c.color)||{}).label || c.color;
    // C4 addendum: marker khusus untuk kucing "Sahabat Karib" (trust level 5)
    // supaya peta juga berguna untuk mengingat "di mana sahabat kucingku biasa nongkrong."
    const isBestFriend = trustLevelFromVisits(c.visits || 1) >= 5;
    const markerClass = isBestFriend
      ? 'cat-marker best-friend'
      : `cat-marker${c.rarity==='langka'?' rare':''}`;
    const markerSvgInner = isBestFriend
      ? '<path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/><path d="M9 11l2 2 4-4" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/>';
    const iconSize = isBestFriend ? [42,42] : [34,34];
    const iconAnchor = isBestFriend ? [21,42] : [17,34];
    const icon = L.divIcon({
      className: '',
      html: `<div class="${markerClass}" title="${escapeHtml(c.name)}"><svg class="inner" viewBox="0 0 24 24" fill="#fff">${markerSvgInner}</svg></div>`,
      iconSize,
      iconAnchor,
      popupAnchor:[0,-32],
    });
    const m = L.marker([c.lat, c.lon], {icon}).addTo(leafletMap);
    const d = new Date(c.date);
    const trustInfo = isBestFriend
      ? ` · <span style="color:#C9652F;font-weight:700;">Sahabat Karib</span> · ${c.visits||1} kunjungan`
      : '';
    m.bindPopup(`<img class="pop-thumb" src="${c.photo}" alt="${escapeHtml(c.name)}"><b>${escapeHtml(c.name)}</b><br>#${c.id.replace('MDX-','')} · ${colorLabel} · ${c.rarity}${trustInfo}<div class="pop-meta">${d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</div>`);
    m.on('click', ()=> playChime());
  });
  // fit bounds dengan padding
  leafletMap.fitBounds(bounds, { padding:[40,40], maxZoom:16 });
  // invalidateSize supaya render benar setelah display flex
  setTimeout(()=>{ if(leafletMap) leafletMap.invalidateSize(); }, 200);
  // tampilkan cuaca di lokasi kucing terakhir
  refreshWeatherForLastLoc();
}

$('#map-grant').addEventListener('click', ()=>{
  go('perm-loc');
});

/* ---------------------------------------------------------------------
   13b3. Flavor cuaca (Open-Meteo, gratis tanpa API key)
   --------------------------------------------------------------------- */
async function renderWeather(lat, lon){
  const strip = $('#weather-strip');
  if(!strip) return;
  strip.classList.add('hide');
  if(lat==null || lon==null) return;
  try{
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`);
    if(!r.ok) return;
    const data = await r.json();
    const t = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const {label, flavor, svg} = weatherInfo(code, t);
    $('#w-icon').innerHTML = svg;
    $('#w-temp').textContent = `${t}°C`;
    $('#w-desc').textContent = label;
    $('#w-flavor').textContent = flavor;
    strip.classList.remove('hide');
    // I3 addendum: cache snapshot cuaca untuk dipakai saat simpan kartu baru
    // (c.weatherAtCapture) supaya detail kartu bisa tampilkan "ditemukan saat
    // langit cerah" dll. Tanpa API call tambahan — reuse data yang sudah ada.
    lastWeatherSnapshot = { label, temp: t, code };
  }catch(e){
    // offline / gagal: abaikan
  }
}
let lastWeatherSnapshot = null; // I3 addendum: {label, temp, code} atau null

function weatherInfo(code, t){
  // WMO weather code -> label + flavor + icon SVG
  let label='Cerah', flavor='', svg='';
  if(code===0){ label='Cerah'; flavor = t>28?'Hari panas — kucing cari tempat teduh.':'Cuaca enak untuk berburu kucing.'; svg=sunSvg(); }
  else if(code<=3){ label='Berawan'; flavor='Berawan tipis, kucing masih aktif keluar.'; svg=cloudSvg(); }
  else if(code<=48){ label='Berkabut'; flavor='Kabut tipis — cari kucing dekat rumah hangat.'; svg=fogSvg(); }
  else if(code<=67){ label='Hujan'; flavor='Hujan turun, kucing mungkin bersembunyi. Bawa payung.'; svg=rainSvg(); }
  else if(code<=77){ label='Salju'; flavor='Salju? Kucing lokal pasti di dalam rumah.'; svg=snowSvg(); }
  else if(code<=82){ label='Gerimis'; flavor='Gerimis ringan, mungkin masih ada kucing liar.'; svg=rainSvg(); }
  else if(code<=99){ label='Badai'; flavor='Badai — lebih baik di dalam. Main Meongdex besok saja.'; svg=stormSvg(); }
  else { label='Cerah'; svg=sunSvg(); }
  return {label, flavor, svg};
}
function sunSvg(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="#E8804C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>`; }
function cloudSvg(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="#8a7566" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11 2 4 4 0 0 0 1 8h10z"/></svg>`; }
function fogSvg(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="#8a7566" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h12M5 12h14M3 16h12M5 20h14"/></svg>`; }
function rainSvg(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="#4A9B8E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0 0-8 6 6 0 0 0-11 2 4 4 0 0 0 1 8"/><path d="M8 18v2M12 18v3M16 18v2"/></svg>`; }
function snowSvg(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="#4A9B8E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0 0-8 6 6 0 0 0-11 2 4 4 0 0 0 1 8"/><path d="M8 18l.01 0M12 19l.01 0M16 18l.01 0M10 21l.01 0M14 21l.01 0"/></svg>`; }
function stormSvg(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="#C9652F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a4 4 0 0 0 0-8 6 6 0 0 0-11 2 4 4 0 0 0 1 8"/><path d="M13 14l-3 4h3l-2 3"/></svg>`; }

// tampilkan cuaca di peta saat punya lokasi tersimpan terakhir
async function refreshWeatherForLastLoc(){
  const cats = await allCats();
  const withLoc = cats.find(c=> c.lat!=null && c.lon!=null);
  if(withLoc) renderWeather(withLoc.lat, withLoc.lon);
}

/* ---------------------------------------------------------------------
   13b4. Rumah / Shelter virtual (ruang dekorasi koleksi)
   --------------------------------------------------------------------- */
async function renderShelter(){
  const cats = await allCats();
  const shelterIds = player.shelterCatIds || [];
  const shelterCats = shelterIds.map(id=> cats.find(c=>c.id===id)).filter(Boolean);
  $('#shelter-count').textContent = `${shelterCats.length} / ${CONFIG.SHELTER_SLOTS}`;
  const room = $('#shelter-room');
  room.innerHTML='';
  // dekorasi aktif (render sebagai overlay di room)
  const activeDecor = player.activeDecor || [];
  const lvl = levelFromXp(player.xp);
  // decor layer
  if(activeDecor.length>0){
    const decorLayer = el('div',{class:'shelter-decor-layer'});
    activeDecor.forEach(did=>{
      const item = DECOR_ITEMS.find(x=>x.id===did);
      if(item){
        const node = el('div',{class:`decor-item decor-${did}`});
        node.innerHTML = `<svg viewBox="0 0 24 24">${item.svg}</svg>`;
        decorLayer.appendChild(node);
      }
    });
    room.appendChild(decorLayer);
  }
  for(let i=0;i<CONFIG.SHELTER_SLOTS;i++){
    const c = shelterCats[i];
    const slot = el('div',{class:'shelter-slot '+(c?`occupied ${c.rarity}`:'empty')});
    if(c){
      slot.onclick = ()=> openCatDetail(c.id);
      const bed = el('div',{class:'cat-bed'});
      if(c.photo) bed.innerHTML = `<img src="${c.photo}" alt="${escapeHtml(c.name)}">`;
      slot.appendChild(bed);
      slot.appendChild(el('div',{class:'name-tag'}, c.name));
    } else {
      slot.appendChild(el('div',{class:'cat-bed'}));
    }
    room.appendChild(slot);
  }
  // decor status di bawah room
  const decorStatus = $('#shelter-decor-status');
  if(decorStatus){
    const unlocked = DECOR_ITEMS.filter(d=> lvl >= d.unlockLevel);
    decorStatus.textContent = `${activeDecor.length} / ${unlocked.length} dekorasi dipasang · Lv ${lvl}`;
  }
}

$('#shelter-edit').addEventListener('click', openShelterEdit);

async function openShelterEdit(){
  const cats = await allCats();
  const shelterIds = player.shelterCatIds || [];
  if(cats.length===0){
    toast('Belum ada kucing untuk menghuni rumah','warn',ICONS.warn);
    return;
  }
  const content = el('div');
  let html = `<h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8804C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg> Atur penghuni rumah</h3>
  <p>Pilih maksimal ${CONFIG.SHELTER_SLOTS} kucing untuk menghuni rumah. Klik lagi untuk mengeluarkan.</p>
  <div class="shelter-pick-grid" id="shelter-pick-grid">`;
  cats.forEach(c=>{
    const active = shelterIds.includes(c.id);
    html += `<div class="shelter-pick${active?' active':''}" data-id="${c.id}">
      <div class="ph"><img src="${c.photo}" alt="${escapeHtml(c.name)}"></div>
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
    </div>`;
  });
  html += `</div>`;
  // dekorasi section
  const lvl = levelFromXp(player.xp);
  const activeDecor = player.activeDecor || [];
  html += `<h4 class="decor-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/></svg> Dekorasi rumah</h4>
  <p class="decor-note">Pasang item dekorasi. Beberapa terkunci sampai level tertentu.</p>
  <div class="decor-grid">`;
  DECOR_ITEMS.forEach(d=>{
    const unlocked = lvl >= d.unlockLevel;
    const isActive = activeDecor.includes(d.id);
    html += `<div class="decor-card${isActive?' active':''}${unlocked?'':' locked'}" data-decor="${d.id}">
      <div class="decor-ico"><svg viewBox="0 0 24 24">${d.svg}</svg></div>
      <div class="decor-nm">${d.label}</div>
      ${unlocked ? `<div class="decor-st">${isActive?'Terpasang':'Tap untuk pasang'}</div>` : `<div class="decor-lk">Lv ${d.unlockLevel}</div><div class="lock-ovl"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>`}
    </div>`;
  });
  html += `</div>
  <div class="row gap-8 mt-12">
    <button class="btn secondary block" id="shelter-clear">Kosongkan kucing</button>
    <button class="btn block" id="shelter-save">Simpan</button>
  </div>`;
  content.innerHTML = html;
  openSheet(content);
  // toggle pick
  let picked = [...shelterIds];
  $$('.shelter-pick').forEach(node=>{
    node.addEventListener('click', ()=>{
      const id = node.dataset.id;
      const idx = picked.indexOf(id);
      if(idx>=0){ picked.splice(idx,1); node.classList.remove('active'); }
      else {
        if(picked.length >= CONFIG.SHELTER_SLOTS){
          toast(`Maksimal ${CONFIG.SHELTER_SLOTS} penghuni`,'warn',ICONS.warn);
          return;
        }
        picked.push(id); node.classList.add('active');
      }
    });
  });
  $('#shelter-clear').addEventListener('click', ()=>{
    picked = [];
    $$('.shelter-pick').forEach(n=> n.classList.remove('active'));
  });
  // decor toggle
  let pickedDecor = [...(player.activeDecor || [])];
  $$('.decor-card').forEach(node=>{
    if(node.classList.contains('locked')) return;
    node.addEventListener('click', ()=>{
      const id = node.dataset.decor;
      const idx = pickedDecor.indexOf(id);
      if(idx>=0){ pickedDecor.splice(idx,1); node.classList.remove('active'); node.querySelector('.decor-st').textContent='Tap untuk pasang'; }
      else { pickedDecor.push(id); node.classList.add('active'); node.querySelector('.decor-st').textContent='Terpasang'; }
    });
  });
  $('#shelter-save').addEventListener('click', ()=>{
    player.shelterCatIds = picked;
    player.activeDecor = pickedDecor;
    Store.save(player);
    closeSheet();
    renderShelter();
    toast('Penghuni rumah disimpan','success',ICONS.check);
    playChime();
  });
}

/* ---------------------------------------------------------------------
   13b5. Tema kartu kosmetik (skin picker di detail kucing)
   --------------------------------------------------------------------- */
function renderSkinPicker(container, currentSkin, onSelect){
  container.innerHTML='';
  const label = el('div',{class:'mono',style:'font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.08em;width:100%;'}, 'Tema kartu');
  container.appendChild(label);
  const wrap = el('div',{class:'skin-picker'});
  CARD_SKINS.forEach(s=>{
    const opt = el('button',{class:'skin-opt'+(s.id===currentSkin?' active':''),'aria-label':s.label,title:s.label,style:`background:${s.color};`});
    opt.onclick = ()=>{ onSelect(s.id); renderSkinPicker(container, s.id, onSelect); };
    wrap.appendChild(opt);
  });
  container.appendChild(wrap);
}

/* ---------------------------------------------------------------------
   13b6. Statistik pemburu (dashboard komprehensif)
   --------------------------------------------------------------------- */
$('#stat-row').addEventListener('click', ()=> go('stats'));

async function renderStats(){
  // skeleton loading
  const grid = $('#stats-grid'); grid.innerHTML='';
  for(let i=0;i<6;i++){ grid.appendChild(el('div',{class:'skel-stat-card skeleton'})); }
  $('#color-bars').innerHTML='<div class="skel-line skeleton"></div><div class="skel-line skeleton"></div><div class="skel-line skeleton"></div>';
  $('#rarity-bars').innerHTML='<div class="skel-line skeleton"></div><div class="skel-line skeleton"></div>';
  $('#stats-achievements').innerHTML='<div class="skel-ach-item skeleton"></div><div class="skel-ach-item skeleton"></div>';
  await new Promise(r=>setTimeout(r,300));
  const cats = await allCats();
  const lvl = levelFromXp(player.xp);
  const xpInLvl = player.xp % CONFIG.XP_PER_LEVEL;
  const xpToNext = CONFIG.XP_PER_LEVEL - xpInLvl;

  // grid stats utama
  grid.innerHTML='';
  const stats = [
    { label:'Level', value:lvl, icon:'<path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/>', color:'var(--gold)' },
    { label:'Total XP', value:player.xp, icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', color:'var(--terracotta-deep)' },
    { label:'Kucing', value:cats.length, icon:'<path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/>', color:'var(--teal-deep)' },
    { label:'Streak', value:player.streak||0, icon:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', color:'var(--terracotta)' },
    { label:'Diberi makan', value:player.fed, icon:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-1.6 2-1.6 15 0 17M4.5 9h15M4.5 15h15"/>', color:'var(--teal)' },
    { label:'Tantangan', value:`${(player.completedChallenges||[]).length}/${CHALLENGES.length}`, icon:'<path d="M20 6L9 17l-5-5"/>', color:'#9b6dd4' },
  ];
  stats.forEach(s=>{
    const card = el('div',{class:'stat-card'});
    card.innerHTML = `<div class="sc-ico" style="color:${s.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></div><div class="sc-val">${s.value}</div><div class="sc-lbl">${s.label}</div>`;
    grid.appendChild(card);
  });

  // XP progress bar
  const xpBar = el('div',{class:'stats-xp-bar'});
  xpBar.innerHTML = `<div class="xp-bar-head"><span>Lv ${lvl}</span><span class="muted">${xpInLvl} / ${CONFIG.XP_PER_LEVEL} XP · ${xpToNext} lagi</span></div><div class="xp-bar-track"><i style="width:${(xpInLvl/CONFIG.XP_PER_LEVEL)*100}%"></i></div>`;
  grid.appendChild(xpBar);

  // color bars
  const cb = $('#color-bars'); cb.innerHTML='';
  const maxColor = Math.max(1, ...COLORS.map(c=>cats.filter(x=>x.color===c.id).length));
  COLORS.forEach(c=>{
    const count = cats.filter(x=>x.color===c.id).length;
    const pct = (count/maxColor)*100;
    const row = el('div',{class:'cb-row'});
    row.innerHTML = `<span class="cb-dot" style="background:${c.hex}"></span><span class="cb-lbl">${c.label}</span><div class="cb-track"><i style="width:${pct}%;background:${c.hex}"></i></div><span class="cb-num">${count}</span>`;
    cb.appendChild(row);
  });

  // rarity bars
  const rb = $('#rarity-bars'); rb.innerHTML='';
  const rarKeys = ['biasa','langka','epik','legendaris'];
  const maxRar = Math.max(1, ...rarKeys.map(r=>cats.filter(x=>x.rarity===r).length));
  rarKeys.forEach(r=>{
    const count = cats.filter(x=>x.rarity===r).length;
    const pct = (count/maxRar)*100;
    const rar = RARITIES[r];
    const row = el('div',{class:'cb-row'});
    row.innerHTML = `<span class="cb-dot" style="background:${rar.color}"></span><span class="cb-lbl">${rar.label.charAt(0)+rar.label.slice(1).toLowerCase()}</span><div class="cb-track"><i style="width:${pct}%;background:${rar.color}"></i></div><span class="cb-num">${count}</span>`;
    rb.appendChild(row);
  });

  // achievements
  const ach = $('#stats-achievements'); ach.innerHTML='';
  const done = player.completedChallenges || [];
  const achievements = [
    { label:'Pemburu pertama', desc:'Temukan kucing pertama', done:cats.length>=1, icon:'<path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/>' },
    { label:'Kolektor', desc:'Koleksi 5 kucing', done:cats.length>=5, icon:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/>' },
    { label:'Pemburu sejati', desc:'Koleksi 10 kucing', done:cats.length>=10, icon:'<path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/>' },
    { label:'Clowder', desc:'Koleksi 20 kucing', done:cats.length>=20, icon:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>' },
    { label:'Streak 3 hari', desc:'Berburu 3 hari berturut', done:(player.streak||0)>=3, icon:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' },
    { label:'Streak 7 hari', desc:'Berburu 7 hari berturut', done:(player.streak||0)>=7, icon:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' },
    { label:'Streak 30 hari', desc:'Berburu 30 hari berturut', done:(player.streak||0)>=30, icon:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' },
    { label:'Level 5', desc:'Capai level 5', done:lvl>=5, icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { label:'Level 10', desc:'Capai level 10', done:lvl>=10, icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { label:'Level 20', desc:'Capai level 20', done:lvl>=20, icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    { label:'Pemburu epik', desc:'Temukan kucing epik', done:cats.some(c=>c.rarity==='epik'), icon:'<path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/>' },
    { label:'Legenda', desc:'Temukan kucing legendaris', done:cats.some(c=>c.rarity==='legendaris'), icon:'<path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/>' },
    { label:'Sahabat oren', desc:'Koleksi 3 kucing oren', done:cats.filter(c=>c.color==='oren').length>=3, icon:'<circle cx="12" cy="12" r="9"/>' },
    { label:'Pecinta favorit', desc:'Tandai 3 kucing favorit', done:(player.favorites||[]).length>=3, icon:'<path d="M12 21s-7-4.9-9.5-9C.7 8.8 2 5 5.5 5c2 0 3.3 1.3 4 2.3.7-1 2-2.3 4-2.3 3.5 0 4.8 3.8 3 7-2.5 4.1-9.5 9-9.5 9z"/>' },
    { label:'Tantang selesai', desc:`${done.length}/${CHALLENGES.length} tantangan`, done:done.length>=CHALLENGES.length, icon:'<path d="M20 6L9 17l-5-5"/>' },
  ];
  achievements.forEach(a=>{
    // I2 addendum: vitrine style — badge belum terbuka = siluet abu-abu "???"
    // badge terbuka = ikon penuh warna + checkmark. Layout grid rak medali.
    const item = el('div',{class:'ach-item vitrine'+(a.done?' done':'')});
    item.innerHTML = `
      <div class="vitrine-medal ${a.done?'':'locked'}">
        ${a.done
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${a.icon}</svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".35"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5h.01M14.5 9.5h.01M9 14.5h6"/></svg>`}
      </div>
      <div class="ach-tx">
        <div class="ach-l">${a.done ? a.label : '???'}</div>
        <div class="ach-d">${a.desc}</div>
      </div>`;
    ach.appendChild(item);
  });
}

/* ---------------------------------------------------------------------
   13c. Ekspor kartu kucing sebagai gambar (canvas-based)
   Output 1080x1080 (kotak) atau 1080x1920 (story), polaroid + watermark.
   --------------------------------------------------------------------- */
async function openShareSheet(cat){
  const content = el('div');
  content.innerHTML = `
    <h3>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8804C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
      Bagikan kartu
    </h3>
    <p>Ubah kartu kucing ini jadi gambar siap dibagikan ke Instagram atau X. Pilih format, lalu unduh.</p>
    <div class="share-preview"><canvas id="share-canvas" width="1080" height="1080"></canvas></div>
    <p class="preview-note">Pratinjau di atas. Kartu asli beresolusi penuh saat diunduh.</p>
    <div class="share-format-row">
      <button class="share-format active" data-fmt="1080">Kotak<span class="dim">1080 x 1080</span></button>
      <button class="share-format" data-fmt="1080x1920">Story<span class="dim">1080 x 1920</span></button>
    </div>
    <div class="row gap-8 mt-12">
      <button class="btn secondary block" id="share-close">Tutup</button>
      <button class="btn block" id="share-download">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        Unduh gambar
      </button>
    </div>`;
  openSheet(content);
  let currentFmt = '1080';
  const canvas = $('#share-canvas');
  await drawShareCard(canvas, cat, 1080);

  $$('.share-format').forEach(b=>{
    b.addEventListener('click', async ()=>{
      $$('.share-format').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      currentFmt = b.dataset.fmt;
      if(currentFmt==='1080'){ canvas.width=1080; canvas.height=1080; }
      else { canvas.width=1080; canvas.height=1920; }
      await drawShareCard(canvas, cat, currentFmt==='1080x1920'?1920:1080);
    });
  });
  $('#share-close').addEventListener('click', closeSheet);
  $('#share-download').addEventListener('click', ()=>{
    const link = document.createElement('a');
    link.download = `meongdex-${cat.id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Gambar kartu diunduh','success',ICONS.check);
  });
}

/**
 * C6 addendum: Ekspor "lembar album" — montase grid 6 atau 9 kartu kucing
 * sekaligus. Bergaya lembar album/binder koleksi fisik. Reuse helper
 * loadImage + roundRect yang sudah dipakai drawShareCard.
 * Pemain pilih jumlah kartu (6/9), lalu render canvas 1080x1080.
 * Foto diambil dari currentCatsCache (urut by date terbaru atau by favorit).
 */
async function openAlbumSheet(){
  const cats = currentCatsCache.slice();
  if(cats.length === 0){
    toast('Koleksi masih kosong, belum bisa bikin lembar album', 'warn', ICONS.warn);
    return;
  }
  const content = el('div');
  content.innerHTML = `
    <h3>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E8804C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 3v18"/></svg>
      Lembar album
    </h3>
    <p>Susun beberapa kartu jadi satu gambar siap dibagikan. Pilih jumlah kartu, lalu unduh.</p>
    <div class="share-preview"><canvas id="album-canvas" width="1080" height="1080"></canvas></div>
    <p class="preview-note">Pratinjau di atas. Lembar asli beresolusi penuh 1080x1080 saat diunduh.</p>
    <div class="share-format-row">
      <button class="share-format active" data-album="6">6 kartu<span class="dim">grid 2 x 3</span></button>
      <button class="share-format" data-album="9">9 kartu<span class="dim">grid 3 x 3</span></button>
    </div>
    <div class="row gap-8 mt-12">
      <button class="btn secondary block" id="album-close">Tutup</button>
      <button class="btn block" id="album-download">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        Unduh lembar
      </button>
    </div>`;
  openSheet(content);
  let currentCount = 6;
  const canvas = $('#album-canvas');
  // urut: favorit dulu, lalu terbaru
  const sortedCats = cats.slice().sort((a,b)=>{
    const fa = (player.favorites||[]).includes(a.id) ? 1 : 0;
    const fb = (player.favorites||[]).includes(b.id) ? 1 : 0;
    if(fa !== fb) return fb - fa;
    return new Date(b.date) - new Date(a.date);
  });
  await drawAlbumSheet(canvas, sortedCats, currentCount);

  $$('.share-format').forEach(b=>{
    b.addEventListener('click', async ()=>{
      $$('.share-format').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      currentCount = parseInt(b.dataset.album, 10) || 6;
      await drawAlbumSheet(canvas, sortedCats, currentCount);
    });
  });
  $('#album-close').addEventListener('click', closeSheet);
  $('#album-download').addEventListener('click', ()=>{
    const link = document.createElement('a');
    link.download = `meongdex-album-${todayKey()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Lembar album diunduh','success',ICONS.check);
  });
}

/**
 * Render montase grid kartu di canvas 1080x1080.
 * count=6 -> grid 2x3, count=9 -> grid 3x3.
 * Tiap cell: mini polaroid (foto + nama + id) dengan border kelangkaan.
 */
async function drawAlbumSheet(canvas, cats, count){
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  // background cream + dot pattern (sama dengan share card)
  ctx.fillStyle = '#FFF8ED';
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(58,46,42,0.05)';
  for(let y=0; y<H; y+=34){ for(let x=0; x<W; x+=34){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); } }

  const cols = count === 9 ? 3 : 2;
  const rows = count === 9 ? 3 : 3;
  const padOuter = 60;
  const gap = 30;
  const headerH = 80;
  const footerH = 70;
  const gridW = W - padOuter*2;
  const gridH = H - padOuter*2 - headerH - footerH;
  const cellW = (gridW - gap*(cols-1)) / cols;
  const cellH = (gridH - gap*(rows-1)) / rows;

  // header: judul "MEONGDEX" + tagline
  ctx.fillStyle = '#3A2E2A';
  ctx.font = '700 44px "Fredoka",sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('Meongdex', padOuter, padOuter + 36);
  ctx.fillStyle = '#8a7566';
  ctx.font = '500 22px "Plus Jakarta Sans",sans-serif';
  ctx.fillText('Lembar album koleksi', padOuter, padOuter + 64);
  // count badge di kanan header
  ctx.fillStyle = '#E8804C';
  ctx.font = '700 22px "JetBrains Mono",monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.min(count, cats.length)} dari ${cats.length} kucing`, W - padOuter, padOuter + 64);
  ctx.textAlign = 'left';

  // grid cells
  const selected = cats.slice(0, count);
  for(let i=0; i<count; i++){
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = padOuter + col * (cellW + gap);
    const y = padOuter + headerH + row * (cellH + gap);
    if(i >= selected.length){
      // empty slot: dotted border
      ctx.strokeStyle = 'rgba(58,46,42,0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      roundRect(ctx, x, y, cellW, cellH, 18); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(58,46,42,0.3)';
      ctx.font = '500 18px "Plus Jakarta Sans",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('kosong', x + cellW/2, y + cellH/2);
      ctx.textAlign = 'left';
      continue;
    }
    const c = selected[i];
    // bayangan
    ctx.fillStyle = 'rgba(58,46,42,0.22)';
    roundRect(ctx, x+5, y+8, cellW, cellH, 18); ctx.fill();
    // kartu putih
    ctx.fillStyle = '#FFFDF8';
    roundRect(ctx, x, y, cellW, cellH, 18); ctx.fill();
    // border kelangkaan — D2 addendum: legendaris pakai rose/magenta signature
    const border = c.rarity==='langka' ? '#D4AF37' : (c.rarity==='epik' ? '#9b6dd4' : (c.rarity==='legendaris' ? '#C2185B' : '#4A9B8E'));
    ctx.strokeStyle = border; ctx.lineWidth = 4;
    roundRect(ctx, x, y, cellW, cellH, 18); ctx.stroke();
    // foto
    const photoPad = 12;
    const photoX = x + photoPad, photoY = y + photoPad;
    const photoW = cellW - photoPad*2, photoH = photoW; // square photo
    ctx.fillStyle = '#F3D9AE';
    roundRect(ctx, photoX, photoY, photoW, photoH, 12); ctx.fill();
    if(c.photo){
      try{
        const img = await loadImage(c.photo);
        const scale = Math.max(photoW/img.width, photoH/img.height);
        const dw = img.width*scale, dh = img.height*scale;
        ctx.save();
        roundRect(ctx, photoX, photoY, photoW, photoH, 12); ctx.clip();
        ctx.drawImage(img, photoX+(photoW-dw)/2, photoY+(photoH-dh)/2, dw, dh);
        ctx.restore();
      }catch(e){}
    }
    // id badge
    ctx.fillStyle = 'rgba(58,46,42,0.82)';
    roundRect(ctx, photoX+8, photoY+8, 70, 26, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "JetBrains Mono",monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('#'+c.id.replace('MDX-',''), photoX+14, photoY+22);
    // nama di bawah foto
    const nameY = photoY + photoH + 22;
    ctx.fillStyle = '#3A2E2A';
    ctx.font = '600 22px "Fredoka",sans-serif';
    ctx.textBaseline = 'alphabetic';
    let displayName = c.name || '';
    // truncate if too long
    const maxNameW = cellW - 20;
    while(ctx.measureText(displayName).width > maxNameW && displayName.length > 3){
      displayName = displayName.slice(0, -2);
    }
    if(displayName !== (c.name||'')) displayName += '…';
    ctx.fillText(displayName, x + 10, nameY);
  }
  // footer: watermark
  ctx.fillStyle = 'rgba(58,46,42,0.5)';
  ctx.font = '500 14px "JetBrains Mono",monospace';
  ctx.textAlign = 'center';
  ctx.fillText('meongdex.github.io · ' + new Date().toLocaleDateString('id-ID'), W/2, H - padOuter/2);
  ctx.textAlign = 'left';
}

async function drawShareCard(canvas, cat, h){
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  // latar krem dengan dot pattern
  ctx.fillStyle = '#FFF8ED';
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(58,46,42,0.05)';
  for(let y=0; y<H; y+=34){ for(let x=0; x<W; x+=34){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); } }

  const isStory = H > W;
  const cardW = isStory ? 880 : Math.min(900, W-100);
  const cardH = isStory ? 1240 : cardW;
  const cardX = (W - cardW)/2;
  const cardY = isStory ? 200 : (H - cardH)/2;

  // bayangan kartu
  ctx.fillStyle = 'rgba(58,46,42,0.28)';
  roundRect(ctx, cardX+8, cardY+14, cardW, cardH, 36); ctx.fill();
  // kartu putih
  ctx.fillStyle = '#FFFDF8';
  roundRect(ctx, cardX, cardY, cardW, cardH, 36); ctx.fill();
  // border kelangkaan — D2 addendum: dukung 4 rarity dengan warna signature masing-masing
  const border = cat.rarity==='langka' ? '#D4AF37'
               : cat.rarity==='epik' ? '#9b6dd4'
               : cat.rarity==='legendaris' ? '#C2185B'
               : '#4A9B8E';
  ctx.strokeStyle = border; ctx.lineWidth = 10;
  roundRect(ctx, cardX, cardY, cardW, cardH, 36); ctx.stroke();

  // foto
  const pad = 28;
  const photoX = cardX+pad, photoY = cardY+pad;
  const photoW = cardW - pad*2, photoH = photoW;
  ctx.fillStyle = '#F3D9AE';
  roundRect(ctx, photoX, photoY, photoW, photoH, 22); ctx.fill();
  if(cat.photo){
    try{
      const img = await loadImage(cat.photo);
      // cover fit
      const scale = Math.max(photoW/img.width, photoH/img.height);
      const dw = img.width*scale, dh = img.height*scale;
      ctx.save();
      roundRect(ctx, photoX, photoY, photoW, photoH, 22); ctx.clip();
      ctx.drawImage(img, photoX+(photoW-dw)/2, photoY+(photoH-dh)/2, dw, dh);
      ctx.restore();
    }catch(e){}
  }
  // id badge top-left foto
  ctx.fillStyle = 'rgba(58,46,42,0.82)';
  roundRect(ctx, photoX+18, photoY+18, 150, 50, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px "JetBrains Mono",monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('#'+cat.id.replace('MDX-',''), photoX+34, photoY+43);
  // rarity tag top-right foto — D2 addendum: dukung 4 rarity dengan label + warna teks yang sesuai
  const rarInfo = RARITIES[cat.rarity] || RARITIES.biasa;
  const rarityLabel = rarInfo.label;
  ctx.font = 'bold 22px "JetBrains Mono",monospace';
  const rw = ctx.measureText(rarityLabel).width + 40;
  ctx.fillStyle = border;
  roundRect(ctx, photoX+photoW-rw-18, photoY+18, rw, 50, 999); ctx.fill();
  ctx.fillStyle = rarInfo.ink;
  ctx.textAlign = 'center';
  ctx.fillText(rarityLabel, photoX+photoW-rw/2-18, photoY+43);
  ctx.textAlign = 'left';

  // nama
  const nameY = photoY + photoH + 50;
  ctx.fillStyle = '#3A2E2A';
  ctx.font = '600 52px "Fredoka",sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(cat.name, cardX+pad, nameY);

  // sub: tanggal · lokasi
  const d = new Date(cat.date);
  const dateStr = d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
  const locStr = cat.lat!=null ? `${cat.lat.toFixed(3)}, ${cat.lon.toFixed(3)}` : 'lokasi tidak dicatat';
  ctx.fillStyle = '#8a7566';
  ctx.font = '500 24px "JetBrains Mono",monospace';
  ctx.fillText(`${dateStr} · ${locStr}`, cardX+pad, nameY+34);

  // tag pills
  const colorLabel = (COLORS.find(x=>x.id===cat.color)||{}).label || cat.color;
  const tags = [colorLabel, cat.rarity==='langka'?'Langka':'Biasa', cat.verifiedByAI?'Terverifikasi AI':'Konfirmasi manual'];
  let tx = cardX+pad; const ty = nameY+80;
  ctx.font = 'bold 20px "JetBrains Mono",monospace';
  tags.forEach(t=>{
    const tw = ctx.measureText(t).width + 36;
    ctx.fillStyle = 'rgba(74,155,142,.14)';
    roundRect(ctx, tx, ty, tw, 44, 999); ctx.fill();
    ctx.fillStyle = '#357569';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, tx+18, ty+22);
    ctx.textBaseline = 'alphabetic';
    tx += tw + 12;
  });

  // quote
  const quoteY = ty + 90;
  ctx.strokeStyle = '#E4D5BE'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cardX+pad, quoteY); ctx.lineTo(cardX+cardW-pad, quoteY); ctx.stroke();
  ctx.fillStyle = '#5C4B44';
  ctx.font = 'italic 26px "Plus Jakarta Sans",sans-serif';
  wrapText(ctx, '"'+cat.quote+'"', cardX+pad, quoteY+40, cardW-pad*2, 36);

  // watermark Meongdex di luar kartu (bawah)
  if(isStory){
    ctx.fillStyle = 'rgba(58,46,42,0.5)';
    ctx.font = '500 26px "JetBrains Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MEONGDEX · temukan. kasih makan. koleksi.', W/2, H-80);
    ctx.textAlign = 'left';
  }

  // logo Si Oren mini di pojok kartu
  drawMiniMascot(ctx, cardX+cardW-70, cardY+cardH-70, 40);
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function wrapText(ctx,text,x,y,maxW,lineH){
  const words = text.split(' '); let line='', yy=y;
  for(const w of words){
    const test = line? line+' '+w : w;
    if(ctx.measureText(test).width > maxW && line){ ctx.fillText(line,x,yy); line=w; yy+=lineH; }
    else line=test;
  }
  if(line) ctx.fillText(line,x,yy);
}
function loadImage(src){
  return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; });
}
function drawMiniMascot(ctx,x,y,s){
  // kepala oranye sederhana
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle='#E8804C';
  ctx.beginPath(); ctx.ellipse(0,0,s*0.7,s*0.6,0,0,Math.PI*2); ctx.fill();
  // telinga
  ctx.beginPath(); ctx.moveTo(-s*0.5,-s*0.3); ctx.lineTo(-s*0.65,-s*0.8); ctx.lineTo(-s*0.2,-s*0.45); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s*0.5,-s*0.3); ctx.lineTo(s*0.65,-s*0.8); ctx.lineTo(s*0.2,-s*0.45); ctx.closePath(); ctx.fill();
  // mata
  ctx.fillStyle='#3A2E2A';
  ctx.beginPath(); ctx.arc(-s*0.22,-s*0.05,s*0.1,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(s*0.22,-s*0.05,s*0.1,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------------
   13d. Badge kembaran kucing (deteksi kombinasi warna/pola sama)
   --------------------------------------------------------------------- */
function detectTwinBadges(cats){
  const badges = {}; // catId -> badge info
  const byColor = {};
  cats.forEach(c=>{
    (byColor[c.color] = byColor[c.color] || []).push(c);
  });
  Object.entries(byColor).forEach(([color, group])=>{
    if(group.length >= 2){
      // tandai semua kucing warna ini sebagai punya twin
      group.forEach(c=>{
        badges[c.id] = badges[c.id] || [];
        badges[c.id].push({type:'twin', label:'Kembaran ditemukan', color});
      });
    }
  });
  return badges;
}

/* ---------------------------------------------------------------------
   14. Pengaturan
   --------------------------------------------------------------------- */
$('#set-onboard').addEventListener('click', ()=>{
  onboardIdx = 0; renderOnboard(); go('onboarding');
});

// F2 addendum: Panduan Lengkap — sheet referensi permanen di Pengaturan
// dengan FAQ accordion per topik. Mekanik lanjutan yang tidak dijelaskan
// di onboarding singkat: bond/trust, rarity, misi mingguan, tantangan
// foto honor-system, leaderboard, dsb.
const GUIDE_TOPICS = [
  {
    title: 'Cara main dasar',
    body: 'Temukan kucing di sekitarmu, kasih makan lewat tombol Lempar Makanan (tahan untuk isi daya, lepas untuk lempar), foto kucingnya, verifikasi AI akan cek apakah itu kucing, lalu kartu polaroid kucing itu masuk ke Meongdex-mu. Tiap kucing memberi XP, kumpulkan XP untuk naik level dan membuka dekorasi rumah.'
  },
  {
    title: 'Kelangkaan kartu (rarity)',
    body: 'Ada 4 tingkat: Biasa (teal, paling sering), Langka (emas, ~18%), Epik (ungu, ~8%), dan Legendaris (rose/magenta, ~4%, paling jarang). Kelangkaan dihitung dari kombinasi warna + roll acak — calico otomatis minimal Langka. Kartu Legendaris punya cincin shimmer prismatik yang berputar.'
  },
  {
    title: 'Bond dan trust level',
    body: 'Saat simpan kartu baru, kamu bisa tandai "kucing yang sama" dengan yang sudah ada di Meongdex-mu. Kalau ya, foto masuk sebagai kunjungan tambahan ke kartu itu (bukan kartu baru), dan trust level naik. Trust 1-5, level 5 = badge "Sahabat Karib" di pojok kartu + marker khusus di peta.'
  },
  {
    title: 'Misi harian dan mingguan',
    body: 'Misi harian: beri makan 3 kucing, bonus 100 XP, reset tiap hari. Misi mingguan: 5 misi berputar per minggu (Pemburu putih, Konsisten 3 hari, Lima kucing seminggu, Tukang kasih makan, Variasi warna), bonus 250 XP, reset tiap Senin. Misi mingguan dipilih deterministik per (tahun*53 + minggu ISO) — tiap minggu dapet misi berbeda tapi pemain yang sama di minggu yang sama selalu lihat misi yang sama.'
  },
  {
    title: 'Tantangan foto honor-system',
    body: 'Setelah verifikasi foto, ada 5 tantangan self-report: kucing menguap, latar langit sore, kucing meregangkan badan, dua kucing dalam satu foto, kucing tidur. Centang yang sesuai dengan fotomu — jujur ya. Tiap tantangan cuma bisa diselesaikan sekali, bonus 80 XP per tantangan.'
  },
  {
    title: 'Papan peringkat (leaderboard)',
    body: 'Fitur opsional — kalau belum dikonfigurasi pengembang, tetap tampil pesan ramah. Kalau aktif, kirim nama panggilan (anonim, tanpa akun) + total XP + jumlah kucing. TIDAK PERNAH foto atau lokasi dikirim. Leaderboard juga tampilkan agregat komunitas: total kucing yang sudah ditemukan seluruh pemain.'
  },
  {
    title: 'Cadangkan dan pindah perangkat',
    body: 'Pengaturan > Ekspor Meongdex untuk unduh file JSON cadangan (foto + metadata + progres). Impor Meongdex untuk pulihkan — dua mode: Gabung (tambah kucing baru, lewati yang sudah ada) atau Ganti total (hapus semua, tulis ulang dari cadangan). Lakukan ekspor rutin supaya koleksi aman kalau ganti HP atau cache dibersihkan.'
  },
  {
    title: 'Etika berburu kucing',
    body: 'Meongdex dibuat karena sayang sama kucing-kucing jalanan. Tip etika muncul bergantian dengan fakta kucing di Beranda (tip harian), dan satu tip etika muncul di layar Kasih Makan tiap sesi. Kalau kamu mau bantu lebih jauh dari sekadar main game, buka Pengaturan > Bantu kucing sungguhan untuk lihat komunitas pecinta kucing nyata di Yogyakarta.'
  },
  {
    title: 'Offline dan data',
    body: 'Meongdex adalah PWA — bisa dipasang sebagai aplikasi dari Chrome Android, dan tetap bisa dibuka offline setelah kunjungan pertama (service worker cache app shell). Model AI deteksi kucing (COCO-SSD via TensorFlow.js) diunduh sekali lalu tersimpan offline. Foto dan lokasi hanya tersimpan lokal di perangkatmu, tidak dikirim ke server mana pun.'
  },
];

$('#set-guide').addEventListener('click', ()=>{
  const content = el('div');
  const topicsHtml = GUIDE_TOPICS.map((t, i)=>`
    <details class="guide-topic" ${i===0?'open':''}>
      <summary>
        <span class="gt-title">${t.title}</span>
        <svg class="gt-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </summary>
      <div class="gt-body">${t.body}</div>
    </details>`).join('');
  content.innerHTML = `
    <h3>Panduan Lengkap</h3>
    <p class="muted" style="font-size:12px;">Mekanik lanjutan Meongdex. Tap tiap topik untuk buka detail.</p>
    <div class="guide-list mt-12">${topicsHtml}</div>
    <button class="btn block mt-16" onclick="document.getElementById('overlay').classList.remove('active')">Tutup</button>`;
  openSheet(content);
});

// Auth & sync: handler tombol Akun & Sync di Pengaturan
function updateAccountStatus(){
  const node = $('#account-status');
  if(!node) return;
  if(!Auth.isLoggedIn()){
    node.textContent = 'Main tanpa akun';
    return;
  }
  const provider = player.authProvider === 'google' ? 'Google' : 'Facebook';
  const name = player.authUserName || provider;
  const lastSync = player.lastSyncAt
    ? new Date(player.lastSyncAt).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
    : 'belum pernah';
  node.textContent = `${name} · sync ${lastSync}`;
}

$('#set-account').addEventListener('click', ()=>{
  const content = el('div');
  const isLoggedIn = Auth.isLoggedIn();
  let statusHtml = '';
  if(isLoggedIn){
    const provider = player.authProvider === 'google' ? 'Google' : 'Facebook';
    const lastSync = player.lastSyncAt
      ? new Date(player.lastSyncAt).toLocaleString('id-ID',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})
      : 'belum pernah';
    statusHtml = `
      <div class="account-info-box">
        <div class="ai-row"><span class="muted">Login via</span><b>${provider}</b></div>
        <div class="ai-row"><span class="muted">Nama</span><b>${escapeHtml(player.authUserName || '-')}</b></div>
        <div class="ai-row"><span class="muted">Sync terakhir</span><b>${lastSync}</b></div>
      </div>`;
  }else{
    statusHtml = `<p class="muted" style="font-size:13px;">Belum login. Data tersimpan lokal di HP. Pindah device pakai import/export manual.</p>`;
  }
  content.innerHTML = `
    <h3>Akun &amp; Sync</h3>
    ${statusHtml}
    <div class="stack gap-8 mt-12">
      ${isLoggedIn ? `
        <button class="btn block" id="acc-sync-now">Sync sekarang</button>
        <button class="btn secondary block" id="acc-switch">Ganti cara simpan</button>
        <button class="btn block danger" id="acc-logout" style="background:#a8462e;color:#fff;">Logout</button>
      ` : `
        <button class="btn block" id="acc-login-google">Login Google (sync Drive)</button>
        <button class="btn block" id="acc-login-facebook">Login Facebook (sync server)</button>
      `}
    </div>
    <p class="muted mt-12" style="font-size:11px;line-height:1.5;">
      <b>Google</b>: sync penuh (foto + progres) via Google Drive kamu. Data tetap milikmu di Drive.<br>
      <b>Facebook</b>: sync progres (XP, level, koleksi) via server. Foto tetap lokal per device.<br>
      Import/export manual tetap tersedia lewat tombol Ekspor/Impor di bawah.
    </p>
    <button class="btn block mt-16" onclick="document.getElementById('overlay').classList.remove('active')">Tutup</button>`;
  openSheet(content);

  if(isLoggedIn){
    $('#acc-sync-now').addEventListener('click', async ()=>{
      const btn = $('#acc-sync-now'); btn.disabled = true; btn.textContent = 'Mensync...';
      let r;
      if(player.authProvider === 'google') r = await DriveSync.syncNow();
      else r = await FbSync.syncNow();
      btn.disabled = false; btn.textContent = 'Sync sekarang';
      if(r.ok) toast('Sync berhasil','success',ICONS.check);
      else toast('Sync gagal: ' + (r.error || 'unknown'), 'warn', ICONS.warn);
      updateAccountStatus();
    });
    $('#acc-switch').addEventListener('click', ()=>{
      closeSheet();
      player.storageChoiceSeen = false;
      Store.save(player);
      go('storage-choice');
    });
    $('#acc-logout').addEventListener('click', ()=>{
      Auth.logout();
      closeSheet();
      updateAccountStatus();
    });
  }else{
    $('#acc-login-google').addEventListener('click', async ()=>{
      if(!Auth.isGoogleConfigured()){
        toast('Google login belum dikonfigurasi developer', 'warn', ICONS.warn);
        return;
      }
      const r = await Auth.loginGoogle();
      if(r.ok){ closeSheet(); updateAccountStatus(); }
      else toast(r.error || 'Gagal login', 'warn', ICONS.warn);
    });
    $('#acc-login-facebook').addEventListener('click', async ()=>{
      if(!Auth.isFacebookConfigured()){
        toast('Facebook login belum dikonfigurasi developer', 'warn', ICONS.warn);
        return;
      }
      if(!Auth.isSupabaseConfigured()){
        toast('Supabase belum dikonfigurasi', 'warn', ICONS.warn);
        return;
      }
      const r = await Auth.loginFacebook();
      if(r.ok){ closeSheet(); updateAccountStatus(); }
      else toast(r.error || 'Gagal login', 'warn', ICONS.warn);
    });
  }
});

// init: update account status saat app load
updateAccountStatus();
$('#set-about').addEventListener('click', ()=>{
  const content = el('div');
  content.innerHTML = `
    <h3>Tentang Meongdex</h3>
    <p>Meongdex adalah game berburu &amp; mengoleksi kucing sungguhan di dunia nyata. Temukan, kasih makan, foto, dan kumpulkan sebagai kartu polaroid di Meongdex-mu.</p>
    <div class="stack gap-6 mt-12">
      <div class="between"><span class="muted">Versi</span><span class="mono">1.0.0 (Fase 1)</span></div>
      <div class="between"><span class="muted">Penyimpanan</span><span class="mono">Lokal (IndexedDB)</span></div>
      <div class="between"><span class="muted">Deteksi AI</span><span class="mono">COCO-SSD (TF.js)</span></div>
      <div class="between"><span class="muted">Biaya</span><span class="mono">Gratis</span></div>
    </div>
    <p class="muted mt-12" style="font-size:11px;">Foto &amp; lokasi hanya tersimpan di perangkatmu, tidak dikirim ke server mana pun.</p>
    <p class="muted mt-12" style="font-size:12px;font-style:italic;">Meongdex dibuat dengan sayang oleh Nugraha Nastya, dari Yogyakarta.</p>
    <button class="btn block mt-16" onclick="document.getElementById('overlay').classList.remove('active')">Tutup</button>`;
  openSheet(content);
});

// --- Bantu kucing sungguhan (Bagian 3.1 addendum) ---
// Daftar komunitas nyata di Yogyakarta yang aktif merawat kucing jalanan.
// Tautan keluar sederhana, tanpa integrasi donasi/pembayaran apa pun.
const COMMUNITY_PARTNERS = [
  {
    name:'Animal Friends Jogja (AFJ)',
    desc:'Organisasi nirlaba kesejahteraan satwa di Yogyakarta, aktif dalam edukasi, sterilisasi, dan adopsi kucing serta anjing terlantar sejak 2010.',
    url:'https://www.instagram.com/animalfriendsjogja/',
    label:'Instagram @animalfriendsjogja',
  },
  {
    name:'Indonesian Street Cat Community (ISCC)',
    desc:'Komunitas berbasis Yogyakarta yang merawat puluhan kucing tak berpemilik dan aktif melakukan street feeding rutin.',
    url:'https://www.instagram.com/iscc.jogja/',
    label:'Instagram @iscc.jogja',
  },
  {
    name:'Peduli Kucing Pasar Jogja',
    desc:'Jaringan relawan yang rutin memberi makan dan memantau kesehatan kucing di puluhan titik pasar se-DI Yogyakarta.',
    url:'https://www.instagram.com/pedulikucingpasarjogja/',
    label:'Instagram @pedulikucingpasarjogja',
  },
];

$('#set-help-cats').addEventListener('click', ()=>{
  const content = el('div');
  const intro = 'Meongdex dibuat karena sayang sama kucing-kucing di sekitar kita. Kalau kamu mau bantu lebih jauh dari sekadar main game, ini beberapa komunitas nyata di Yogyakarta yang bisa kamu dukung.';
  const list = COMMUNITY_PARTNERS.map(p=>`
    <a class="help-cat-item" href="${p.url}" target="_blank" rel="noopener noreferrer">
      <div class="hc-name">${p.name}</div>
      <div class="hc-desc">${p.desc}</div>
      <div class="hc-link">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
        ${p.label}
      </div>
    </a>`).join('');
  content.innerHTML = `
    <h3>Kalau kamu mau bantu kucing sungguhan</h3>
    <p class="muted" style="font-size:13px;line-height:1.5;">${intro}</p>
    <div class="stack gap-8 mt-12">${list}</div>
    <p class="muted mt-12" style="font-size:11px;">Tautan akan terbuka di browser. Meongdex tidak menerima donasi atau pembayaran apa pun lewat fitur ini.</p>
    <button class="btn block mt-16" onclick="document.getElementById('overlay').classList.remove('active')">Tutup</button>`;
  openSheet(content);
});
$('#set-export').addEventListener('click', async ()=>{
  const cats = await allCats();
  const data = { exportedAt:new Date().toISOString(), player, cats };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = el('a',{href:url, download:`meongdex-backup-${todayKey()}.json`});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  // catat tanggal cadangan terakhir sebagai pengingat halus
  try{
    localStorage.setItem('meongdex_lastBackup', data.exportedAt);
    updateExportStatus();
  }catch(e){ /* localStorage mungkin penuh — bukan kritikal */ }
  toast('Cadangan diunduh','',ICONS.check);
});

// --- Impor cadangan JSON ---
// Impor memvalidasi struktur file sebelum menulis, lalu meminta konfirmasi
// pemain. Jika pemain menolak, tidak ada perubahan dilakukan.
const IMPORT_MAX_BYTES = 50 * 1024 * 1024; // 50MB batas aman
const importFileInput = el('input', { type:'file', accept:'application/json,.json', style:'display:none' });
document.body.appendChild(importFileInput);

function updateExportStatus(){
  const node = $('#export-status');
  if(!node) return;
  try{
    const last = localStorage.getItem('meongdex_lastBackup');
    if(!last){ node.textContent = 'Cadangkan data koleksimu'; return; }
    const d = new Date(last);
    const txt = d.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
    node.textContent = `Cadangan terakhir: ${txt}`;
  }catch(e){ /* abaikan */ }
}

/**
 * Validasi struktur data cadangan Meongdex sebelum diimpor.
 * Mengembalikan { ok:boolean, error?:string, data?:{player,cats,exportedAt} }.
 */
function validateBackup(obj){
  if(!obj || typeof obj !== 'object') return { ok:false, error:'Format file bukan objek JSON yang valid.' };
  if(!Array.isArray(obj.cats)) return { ok:false, error:'Field "cats" tidak ditemukan atau bukan array.' };
  if(!obj.player || typeof obj.player !== 'object') return { ok:false, error:'Field "player" tidak ditemukan atau bukan objek.' };
  // validasi minimal tiap entri kucing
  const requiredCatFields = ['id','date','color'];
  for(let i=0; i<obj.cats.length; i++){
    const c = obj.cats[i];
    if(!c || typeof c !== 'object'){
      return { ok:false, error:`Entri kucing ke-${i+1} bukan objek.` };
    }
    for(const f of requiredCatFields){
      if(c[f] === undefined || c[f] === null || c[f] === ''){
        return { ok:false, error:`Entri kucing ke-${i+1} kehilangan field "${f}".` };
      }
    }
    // sanitasi id: harus format MDX-XXX
    if(!/^MDX-\d{3,}$/.test(String(c.id))){
      return { ok:false, error:`ID kucing ke-${i+1} ("${c.id}") tidak sesuai format MDX-XXX.` };
    }
  }
  return { ok:true, data:obj };
}

importFileInput.addEventListener('change', async (ev)=>{
  const file = ev.target.files?.[0];
  ev.target.value = ''; // reset agar bisa pick file yang sama lagi
  if(!file) return;

  // ECC security review: file upload validation
  if(file.size > IMPORT_MAX_BYTES){
    toast(`File terlalu besar (maks ${Math.round(IMPORT_MAX_BYTES/1024/1024)}MB)`, 'warn', ICONS.warn);
    return;
  }
  const nameOk = /\.json$/i.test(file.name) || file.type === 'application/json';
  if(!nameOk){
    toast('Pilih file .json yang benar', 'warn', ICONS.warn);
    return;
  }

  let text;
  try{
    text = await file.text();
  }catch(e){
    toast('Tidak bisa membaca file', 'warn', ICONS.warn);
    return;
  }
  let parsed;
  try{
    parsed = JSON.parse(text);
  }catch(e){
    toast('File bukan JSON valid', 'warn', ICONS.warn);
    return;
  }
  const result = validateBackup(parsed);
  if(!result.ok){
    toast(`Format cadangan tidak dikenali: ${result.error}`, 'warn', ICONS.warn);
    return;
  }
  const backup = result.data;
  const totalCats = backup.cats.length;
  const backupDate = backup.exportedAt
    ? new Date(backup.exportedAt).toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })
    : '(tanggal tidak diketahui)';

  // Tampilkan konfirmasi sebelum menulis
  const content = el('div');
  content.innerHTML = `
    <h3>Impor Meongdex?</h3>
    <p>File cadangan berisi <strong>${totalCats} kucing</strong>, diekspor pada <strong>${backupDate}</strong>.</p>
    <p class="muted" style="font-size:13px;">Pilih mode impor:</p>
    <div class="row gap-8 mt-8" style="flex-direction:column;align-items:stretch;">
      <label class="set-item" style="cursor:pointer;padding:12px;border:1px solid var(--border,#e5d8c5);border-radius:12px;">
        <input type="radio" name="imp-mode" value="merge" checked style="margin-right:8px;">
        <div class="tx" style="flex:1;">
          <div class="t">Gabung</div>
          <div class="d">Tambahkan kucing baru, lewati ID yang sudah ada. Aman jika sudah ada koleksi.</div>
        </div>
      </label>
      <label class="set-item" style="cursor:pointer;padding:12px;border:1px solid var(--border,#e5d8c5);border-radius:12px;">
        <input type="radio" name="imp-mode" value="replace" style="margin-right:8px;">
        <div class="tx" style="flex:1;">
          <div class="t">Ganti total</div>
          <div class="d">Hapus semua koleksi & progres sekarang, lalu tulis ulang dari cadangan.</div>
        </div>
      </label>
    </div>
    <div class="row gap-8 mt-16">
      <button class="btn secondary block" id="imp-cancel">Batal</button>
      <button class="btn block" id="imp-ok">Impor</button>
    </div>`;
  openSheet(content);

  $('#imp-cancel').addEventListener('click', closeSheet);
  $('#imp-ok').addEventListener('click', async ()=>{
    const mode = (content.querySelector('input[name="imp-mode"]:checked') || {}).value || 'merge';
    try{
      const db = await getDB();
      if(mode === 'replace'){
        await db.clear('cats');
        // overwrite progres pemain dengan default lalu merge dengan cadangan
        const merged = Object.assign({}, Store.defaults(), backup.player);
        player = merged;
        Store.save(player);
      }else{
        // merge: hanya tulis kucing yang ID-nya belum ada; naikkan xp/level? tidak — player tidak diubah
        // supaya progres lokal pemain tidak ditimpa diam-diam.
      }
      let added = 0, skipped = 0;
      for(const c of backup.cats){
        if(mode === 'merge'){
          const existing = await db.get('cats', c.id);
          if(existing){ skipped++; continue; }
        }
        await db.put('cats', c);
        added++;
      }
      // refresh cache & UI
      currentCatsCache = await allCats();
      closeSheet();
      const msg = mode === 'replace'
        ? `Impor selesai: ${added} kucing dipulihkan`
        : `Impor selesai: ${added} baru, ${skipped} sudah ada`;
      toast(msg, '', ICONS.check);
      renderHome(); renderDex();
    }catch(e){
      console.error('import error', e);
      closeSheet();
      toast('Gagal mengimpor, coba lagi', 'warn', ICONS.warn);
    }
  });
});

$('#set-import').addEventListener('click', ()=> importFileInput.click());

// tampilkan status cadangan terakhir saat masuk settings
updateExportStatus();
$('#set-clear').addEventListener('click', ()=>{
  const content = el('div');
  content.innerHTML = `
    <h3>Hapus semua data?</h3>
    <p>Seluruh koleksi Meongdex, XP, level, dan misi akan dihapus permanen dari perangkat ini. Tindakan ini tidak bisa dibatalkan.</p>
    <div class="row gap-8 mt-12">
      <button class="btn secondary block" id="cl-cancel">Batal</button>
      <button class="btn block" id="cl-ok" style="background:#a8462e;color:#fff;">Hapus semua</button>
    </div>`;
  openSheet(content);
  $('#cl-cancel').addEventListener('click', closeSheet);
  $('#cl-ok').addEventListener('click', async ()=>{
    await clearCats();
    localStorage.removeItem('meongdex_player');
    player = Store.load();
    currentCatsCache = [];
    closeSheet();
    toast('Semua data dihapus','warn',ICONS.warn);
    renderHome(); renderDex();
  });
});

/* ---------------------------------------------------------------------
   14b. PWA install prompt
   --------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   14a. Leaderboard Supabase (Bagian 2.10 addendum) — opsional, graceful
   ---------------------------------------------------------------------
   Fitur ini sengaja dibuat opsional & gagal dengan sopan:
   - Kalau LEADERBOARD.SUPABASE_URL atau SUPABASE_ANON_KEY kosong, sheet
     menampilkan pesan ramah bahwa fitur belum dikonfigurasi.
   - Kalau fetch gagal (offline, proyek Supabase di-pause, dll), sheet
     menampilkan pesan "Papan peringkat sedang tidak bisa diakses, coba
     lagi nanti" tanpa melempar error ke pemain.
   - Tidak pernah blokir gameplay inti (temukan, kasih makan, foto,
     koleksi lokal) yang tetap berjalan penuh tanpa backend ini.
   - Hanya mengirim total XP + jumlah kucing + nama panggilan anonim,
     tidak pernah foto atau lokasi.
   --------------------------------------------------------------------- */
const Leaderboard = {
  isConfigured(){
    const c = CONFIG.LEADERBOARD;
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
  },
  _headers(){
    return {
      'apikey': CONFIG.LEADERBOARD.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + CONFIG.LEADERBOARD.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
  },
  _url(path){
    return CONFIG.LEADERBOARD.SUPABASE_URL.replace(/\/$/, '') + path;
  },
  /** fetch dengan timeout supaya UI tetap responsif */
  async _fetchWithTimeout(url, opts){
    const ctrl = new AbortController();
    const t = setTimeout(()=> ctrl.abort(), CONFIG.LEADERBOARD.TIMEOUT_MS);
    try{
      const res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
      return res;
    }finally{
      clearTimeout(t);
    }
  },
  /** Ambil top N pemain. Return array of {nick, xp, cat_count, updated_at} atau [] kalau gagal. */
  async fetchTop(){
    if(!this.isConfigured()) return [];
    const c = CONFIG.LEADERBOARD;
    const url = this._url(`/rest/v1/${c.TABLE_NAME}?order=xp.desc&limit=${c.FETCH_LIMIT}`);
    try{
      const res = await this._fetchWithTimeout(url, { headers: this._headers() });
      if(!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }catch(e){
      return [];
    }
  },
  /**
   * C7 addendum: Ambil agregat komunitas — total kucing yang sudah ditemukan
   * seluruh pemain Meongdex. Pakai PostgREST RPC endpoint atau select dengan
   * aggregate header. PostgREST standar tidak support SUM langsung lewat GET
   * tanpa function, jadi kita ambil semua baris dan jumlahkan di client
   * (cukup ringan karena tabel leaderboard tidak akan besar di proyek kecil).
   * Return { totalCats, totalPlayers, totalXp } atau null kalau gagal.
   */
  async fetchAggregate(){
    if(!this.isConfigured()) return null;
    const c = CONFIG.LEADERBOARD;
    // ambil semua baris (tanpa limit, tapi PostgREST default limit 1000 — cukup)
    const url = this._url(`/rest/v1/${c.TABLE_NAME}?select=cat_count,xp`);
    try{
      const res = await this._fetchWithTimeout(url, { headers: this._headers() });
      if(!res.ok) return null;
      const data = await res.json();
      if(!Array.isArray(data)) return null;
      let totalCats = 0, totalXp = 0;
      data.forEach(r=>{
        totalCats += (r.cat_count || 0);
        totalXp += (r.xp || 0);
      });
      return {
        totalCats,
        totalPlayers: data.length,
        totalXp,
      };
    }catch(e){
      return null;
    }
  },
  /** Submit skor pemain. Return true kalau sukses, false kalau gagal. */
  async submitScore(nick, xp, catCount){
    if(!this.isConfigured()) return false;
    if(!nick || nick.length < 1 || nick.length > 24) return false;
    const c = CONFIG.LEADERBOARD;
    // upsert: kalau nick sudah ada, update; kalau belum, insert.
    // Field di tabel: nick (text, PK atau unique), xp (int), cat_count (int), updated_at (timestamptz)
    const url = this._url(`/rest/v1/${c.TABLE_NAME}`);
    const body = JSON.stringify({
      nick: nick.slice(0, 24),
      xp: Math.max(0, Math.floor(xp)),
      cat_count: Math.max(0, Math.floor(catCount)),
      updated_at: new Date().toISOString(),
    });
    try{
      const res = await this._fetchWithTimeout(url, {
        method: 'POST',
        headers: Object.assign({}, this._headers(), { 'Prefer': 'resolution=merge-duplicates' }),
        body,
      });
      return res.ok;
    }catch(e){
      return false;
    }
  },
};

// tombol papan peringkat di Pengaturan
$('#set-leaderboard').addEventListener('click', async ()=>{
  // tampilkan sheet dengan skeleton, lalu load
  const content = el('div');
  content.innerHTML = `
    <h3>Papan peringkat</h3>
    <p class="muted" style="font-size:12px;">Pemburu kucing teratas di komunitas Meongdex. Hanya nama panggilan + total XP + jumlah kucing yang dikirim — tidak ada foto atau lokasi.</p>
    <div id="lb-body" class="mt-12">Memuat...</div>`;
  openSheet(content);
  const body = $('#lb-body');
  if(!body) return;

  if(!Leaderboard.isConfigured()){
    body.innerHTML = `
      <div class="lb-empty">
        <div class="lb-empty-ico">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3"/></svg>
        </div>
        <p style="font-size:13px;line-height:1.5;">Papan peringkat belum dikonfigurasi. Fitur ini opsional — kamu tetap bisa menikmati seluruh permainan tanpa papan peringkat.</p>
        <p class="muted" style="font-size:11px;margin-top:6px;">Pengembang bisa mengaktifkan dengan mengisi Supabase URL + anon key di <code>CONFIG.LEADERBOARD</code> di <code>game/app.js</code>.</p>
      </div>`;
    return;
  }

  // C7 addendum: ambil agregat komunitas paralel dengan top list
  const [top, agg] = await Promise.all([Leaderboard.fetchTop(), Leaderboard.fetchAggregate()]);
  if(top.length === 0){
    body.innerHTML = `
      <div class="lb-empty">
        <div class="lb-empty-ico">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>
        </div>
        <p style="font-size:13px;line-height:1.5;">Papan peringkat sedang tidak bisa diakses, coba lagi nanti.</p>
        <p class="muted" style="font-size:11px;margin-top:6px;">Fitur inti game (temukan, kasih makan, foto, koleksi) tetap berjalan penuh tanpa papan peringkat.</p>
      </div>`;
    return;
  }

  // C7 addendum: banner agregat komunitas — total kucing & total pemain
  // Menghubungkan kembali ke semangat "Bantu Kucing Sungguhan" (3.1 addendum).
  // Kalau agregat gagal fetch (network/pause), banner di-skip diam-diam.
  let aggBanner = '';
  if(agg && agg.totalCats > 0){
    const fmtNum = n => n.toLocaleString('id-ID');
    aggBanner = `
      <div class="lb-aggregate">
        <div class="lb-agg-row">
          <div class="lb-agg-num">${fmtNum(agg.totalCats)}</div>
          <div class="lb-agg-lbl">kucing telah ditemukan<br>seluruh pemain Meongdex</div>
        </div>
        <div class="lb-agg-divider"></div>
        <div class="lb-agg-row">
          <div class="lb-agg-num">${fmtNum(agg.totalPlayers)}</div>
          <div class="lb-agg-lbl">pemburu aktif<br>di komunitas</div>
        </div>
      </div>`;
  }

  const rows = top.map((r, i)=>{
    const rank = i + 1;
    const medal = rank === 1 ? '#D4AF37' : (rank === 2 ? '#A8A8A8' : (rank === 3 ? '#C97D4A' : null));
    const rankCell = medal
      ? `<div class="lb-rank" style="color:${medal};">${rank}</div>`
      : `<div class="lb-rank muted">${rank}</div>`;
    const updated = r.updated_at ? new Date(r.updated_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'}) : '';
    return `
      <div class="lb-row">
        ${rankCell}
        <div class="lb-nick">${escapeHtml(r.nick || 'anonim')}</div>
        <div class="lb-stat mono">${r.xp || 0} XP</div>
        <div class="lb-meta mono muted">${r.cat_count || 0} kucing · ${updated}</div>
      </div>`;
  }).join('');

  // nama panggilan tersimpan di localStorage (anonim, tanpa akun/login)
  const savedNick = (localStorage.getItem(CONFIG.LEADERBOARD.NICKNAME_KEY) || '').slice(0, 24);
  body.innerHTML = `
    ${aggBanner}
    <div class="lb-list">${rows}</div>
    <div class="lb-submit mt-16">
      <div class="lb-label">KIRIM SKOR KAMU</div>
      <p class="muted" style="font-size:11px;margin:4px 0 8px;">Nama panggilan disimpan lokal di perangkatmu. Kirim ulang kapan saja untuk update skor terbaru.</p>
      <div class="row gap-8">
        <input id="lb-nick" type="text" maxlength="24" placeholder="Nama panggilan (maks 24 karakter)" value="${escapeHtml(savedNick)}" style="flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line,#E4D5BE);border-radius:10px;font-family:inherit;font-size:13px;">
        <button class="btn" id="lb-submit">Kirim</button>
      </div>
      <div id="lb-msg" class="mt-8" style="font-size:11px;"></div>
    </div>`;

  $('#lb-submit').addEventListener('click', async ()=>{
    const nick = ($('#lb-nick').value || '').trim();
    const msg = $('#lb-msg');
    if(!nick){
      msg.innerHTML = '<span style="color:#a8462e;">Isi nama panggilan dulu ya.</span>';
      return;
    }
    if(nick.length > 24){
      msg.innerHTML = '<span style="color:#a8462e;">Nama panggilan maksimal 24 karakter.</span>';
      return;
    }
    const btn = $('#lb-submit'); btn.disabled = true; btn.textContent = 'Mengirim...';
    const cats = await allCats();
    const ok = await Leaderboard.submitScore(nick, player.xp, cats.length);
    btn.disabled = false; btn.textContent = 'Kirim';
    if(ok){
      localStorage.setItem(CONFIG.LEADERBOARD.NICKNAME_KEY, nick);
      msg.innerHTML = '<span style="color:var(--teal-deep,#357569);">Skor terkirim! Refresh papan peringkat dalam 1 detik...</span>';
      setTimeout(()=> $('#set-leaderboard').click(), 1200); // re-open sheet untuk refresh
    }else{
      msg.innerHTML = '<span style="color:#a8462e;">Gagal mengirim. Coba lagi nanti — fitur inti game tetap berjalan tanpa ini.</span>';
    }
  });
});

// ---------------------------------------------------------------------
// 14c. PWA install prompt (lanjutan)
// ---------------------------------------------------------------------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
});
window.addEventListener('appinstalled', ()=>{
  deferredPrompt = null;
  toast('Meongdex terpasang. Cek layar utamamu!','success',ICONS.check);
});
// Theme toggle (dark mode)
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  $('#theme-status').textContent = theme==='dark' ? 'Gelap' : 'Terang';
  // update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content = theme==='dark' ? '#1a1614' : '#FFF8ED';
}
// load saved theme
const savedTheme = localStorage.getItem('meongdex_theme') || 'light';
applyTheme(savedTheme);
$('#set-theme').addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current==='dark' ? 'light' : 'dark';
  localStorage.setItem('meongdex_theme', next);
  applyTheme(next);
  if(navigator.vibrate) navigator.vibrate(10);
  toast(next==='dark' ? 'Mode gelap aktif' : 'Mode terang aktif','',ICONS.check);
});

// Storage info
async function updateStorageInfo(){
  const el = $('#storage-status');
  if(!el) return;
  try{
    if(navigator.storage && navigator.storage.estimate){
      const est = await navigator.storage.estimate();
      const used = est.usage || 0;
      const quota = est.quota || 0;
      const usedKB = (used/1024).toFixed(0);
      const usedMB = (used/1024/1024).toFixed(1);
      const cats = await allCats();
      el.textContent = `${usedMB} MB · ${cats.length} kucing`;
    } else {
      const cats = await allCats();
      el.textContent = `${cats.length} kucing tersimpan`;
    }
  }catch(e){
    el.textContent = 'Tidak tersedia';
  }
}
$('#set-storage').addEventListener('click', async ()=>{
  await updateStorageInfo();
  const cats = await allCats();
  const content = el('div');
  let storageLine = 'Info penyimpanan tidak tersedia di browser ini.';
  if(navigator.storage && navigator.storage.estimate){
    try{
      const est = await navigator.storage.estimate();
      const usedMB = ((est.usage||0)/1024/1024).toFixed(2);
      const quotaMB = ((est.quota||0)/1024/1024).toFixed(0);
      storageLine = `Terpakai: ${usedMB} MB dari ${quotaMB} MB tersedia`;
    }catch(e){}
  }
  content.innerHTML = `
    <h3>Penyimpanan</h3>
    <p>${storageLine}</p>
    <div class="stack gap-6 mt-12">
      <div class="between"><span class="muted">Kucing tersimpan</span><span class="mono">${cats.length}</span></div>
      <div class="between"><span class="muted">Foto disimpan</span><span class="mono">${cats.filter(c=>c.photo).length}</span></div>
      <div class="between"><span class="muted">Tantangan selesai</span><span class="mono">${(player.completedChallenges||[]).length}/${CHALLENGES.length}</span></div>
      <div class="between"><span class="muted">Favorit</span><span class="mono">${(player.favorites||[]).length}</span></div>
    </div>
    <p class="muted mt-12" style="font-size:11px;">Semua data (foto, lokasi, progres) hanya tersimpan lokal di perangkat ini. Tidak dikirim ke server.</p>
    <button class="btn block mt-16" onclick="document.getElementById('overlay').classList.remove('active')">Tutup</button>`;
  openSheet(content);
});

$('#set-sound').addEventListener('click', ()=>{
  player.soundEnabled = !player.soundEnabled;
  Store.save(player);
  $('#sound-status').textContent = player.soundEnabled ? 'Aktif (dengkuran & chime)' : 'Dimatikan';
  if(player.soundEnabled){
    playChime();
    toast('Efek suara aktif','',ICONS.check);
  } else {
    toast('Efek suara dimatikan','warn',ICONS.warn);
  }
});
// sinkronkan tampilan status suara saat app load (default sekarang false,
// tapi pemain lama mungkin sudah menyalakan sebelumnya — sync dari state aktual).
const _soundStatusInit = $('#sound-status');
if(_soundStatusInit && player.soundEnabled){
  _soundStatusInit.textContent = 'Aktif (dengkuran & chime)';
}

// challenges card -> buka sheet daftar tantangan
$('#home-challenges').addEventListener('click', openChallengesSheet);

function openChallengesSheet(){
  const content = el('div');
  const done = player.completedChallenges || [];
  let html = `<h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.6 6.1L21 9l-5 4.4L17.4 20 12 16.6 6.6 20 8 13.4 3 9l6.4-.9L12 2z"/></svg> Tantangan Foto Kreatif</h3>
  <p>${done.length} dari ${CHALLENGES.length} tantangan selesai. Tiap tantangan memberi +${CONFIG.CHALLENGE_BONUS} XP &amp; badge khusus.</p>
  <div class="ch-list">`;
  CHALLENGES.forEach(ch=>{
    const isDone = done.includes(ch.id);
    html += `<div class="ch-item${isDone?' done':''}">
      <div class="ch-ico">${isDone
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>'}</div>
      <div class="ch-tx"><div class="ch-l">${ch.label}</div><div class="ch-d">${ch.desc}</div></div>
      ${isDone ? `<span class="badge-chip">${ch.badge}</span>` : `<span class="ch-xp">+${CONFIG.CHALLENGE_BONUS}</span>`}
    </div>`;
  });
  html += `</div>
  <button class="btn block mt-16" onclick="document.getElementById('overlay').classList.remove('active')">Tutup</button>`;
  content.innerHTML = html;
  openSheet(content);
}

$('#set-install').addEventListener('click', async ()=>{
  if(deferredPrompt){
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if(outcome==='accepted') toast('Memasang Meongdex...','',ICONS.paw);
  }else{
    // belum eligible atau sudah dipasang: arahkan pakai menu browser
    const content = el('div');
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    content.innerHTML = isIOS
      ? `<h3>Pasang di iPhone/iPad</h3><p>Untuk memasang Meongdex di layar utama iOS: tekan tombol Bagikan di Safari, lalu pilih "Tambah ke Layar Utama".</p>
         <div class="row gap-8 mt-12"><button class="btn block" onclick="document.getElementById('overlay').classList.remove('active')">Mengerti</button></div>`
      : `<h3>Pasang sebagai aplikasi</h3><p>Belum muncul prompt otomatis? Buka menu browser (titik tiga di Chrome), lalu pilih "Instal aplikasi" atau "Tambahkan ke Layar Utama".</p>
         <div class="row gap-8 mt-12"><button class="btn block" onclick="document.getElementById('overlay').classList.remove('active')">Mengerti</button></div>`;
    openSheet(content);
  }
});

/* ---------------------------------------------------------------------
   14e. Auth & Sync (akun login) — Google Drive + Facebook + manual fallback
   ---------------------------------------------------------------------
   Tiga mode penyimpanan:
   - 'none' (default): lokal di IndexedDB + localStorage. Import/export manual.
   - 'google': OAuth Google dengan scope drive.file. Backup JSON (foto +
     metadata) disimpan di Google Drive appDataFolder user. Sync otomatis
     debounced setelah saveCat. Data tetap milik user di Drive mereka.
   - 'facebook': FB login via Supabase Auth. Sync metadata only (XP, level,
     koleksi id, temperamen, achievements) ke tabel user_data Supabase.
     Foto tetap lokal per device (FB tidak punya cloud storage user-facing).

   Graceful fallback: kalau AUTH config kosong (client ID belum diisi),
   opsi login tetap tampil tapi menampilkan pesan "belum dikonfigurasi".
   Pemain tetap bisa main dengan import/export manual.
   --------------------------------------------------------------------- */
const Auth = {
  isGoogleConfigured(){
    return !!(CONFIG.AUTH && CONFIG.AUTH.GOOGLE_CLIENT_ID);
  },
  isFacebookConfigured(){
    return !!(CONFIG.AUTH && CONFIG.AUTH.FACEBOOK_APP_ID);
  },
  isSupabaseConfigured(){
    return !!(CONFIG.LEADERBOARD && CONFIG.LEADERBOARD.SUPABASE_URL && CONFIG.LEADERBOARD.SUPABASE_ANON_KEY);
  },
  isLoggedIn(){
    return !!(player.authProvider && player.authToken);
  },
  provider(){
    return player.authProvider || 'none';
  },

  /** Login Google via Google Identity Services (GIS). Scope drive.file. */
  async loginGoogle(){
    if(!this.isGoogleConfigured()){
      return { ok:false, error:'Google login belum dikonfigurasi developer. Isi CONFIG.AUTH.GOOGLE_CLIENT_ID.' };
    }
    try{
      // load GIS script kalau belum
      if(typeof google === 'undefined' || !google.accounts){
        await this._loadScript('https://accounts.google.com/gsi/client');
      }
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.AUTH.GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response) => {
          if(response.access_token){
            player.authProvider = 'google';
            player.authToken = response.access_token;
            player.storageChoiceSeen = true;
            // ambil info user (opsional, butuh scope tambahan)
            player.authUserName = 'Akun Google';
            player.authUserEmail = '';
            Store.save(player);
            // trigger initial sync (upload atau download)
            DriveSync.syncNow().then(()=>{
              toast('Login Google berhasil. Progres tersync ke Drive kamu.', 'success', ICONS.check);
            }).catch(err=>{
              console.warn('Drive sync gagal', err);
              toast('Login berhasil tapi sync awal gagal. Coba sync manual di Pengaturan.', 'warn', ICONS.warn);
            });
            this._proceedAfterChoice();
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
      return { ok:true };
    }catch(err){
      console.error('loginGoogle error', err);
      return { ok:false, error:'Gagal login Google: ' + (err.message || err) };
    }
  },

  /** Login Facebook via FB SDK. Token dikirim ke Supabase Auth untuk session. */
  async loginFacebook(){
    if(!this.isFacebookConfigured()){
      return { ok:false, error:'Facebook login belum dikonfigurasi developer. Isi CONFIG.AUTH.FACEBOOK_APP_ID.' };
    }
    if(!this.isSupabaseConfigured()){
      return { ok:false, error:'Supabase belum dikonfigurasi. Facebook login butuh Supabase Auth.' };
    }
    try{
      // load FB SDK kalau belum
      if(typeof FB === 'undefined'){
        await this._loadScript('https://connect.facebook.net/en_US/sdk.js');
        FB.init({ appId: CONFIG.AUTH.FACEBOOK_APP_ID, version: 'v18.0' });
      }
      // login dengan scope email + public_profile
      const loginResp = await new Promise((resolve)=>{
        FB.login(resolve, { scope: 'email,public_profile' });
      });
      if(!loginResp.authResponse){
        return { ok:false, error:'Login Facebook dibatalkan.' };
      }
      const fbToken = loginResp.authResponse.accessToken;
      // kirim token ke Supabase Auth (sign in with Facebook provider)
      // Supabase REST: POST /auth/v1/signup?provider=facebook tidak langsung via REST.
      // Pendekatan: pakai Supabase JS client ATAU redirect OAuth flow.
      // Untuk vanilla JS tanpa SDK, kita simpan token FB langsung + pakai
      // untuk identify user via FB Graph API. Metadata sync ke tabel user_data
      // dengan FB user ID sebagai key.
      const userInfo = await this._fetchFbUserInfo(fbToken);
      player.authProvider = 'facebook';
      player.authToken = fbToken;
      player.authUserName = userInfo.name || 'Pengguna Facebook';
      player.authUserEmail = userInfo.email || '';
      player.storageChoiceSeen = true;
      Store.save(player);
      // trigger metadata sync
      FbSync.syncNow().then(()=>{
        toast('Login Facebook berhasil. Progres tersync ke server.', 'success', ICONS.check);
      }).catch(err=>{
        console.warn('FB sync gagal', err);
        toast('Login berhasil tapi sync awal gagal. Coba sync manual.', 'warn', ICONS.warn);
      });
      this._proceedAfterChoice();
      return { ok:true };
    }catch(err){
      console.error('loginFacebook error', err);
      return { ok:false, error:'Gagal login Facebook: ' + (err.message || err) };
    }
  },

  /** Pilih main tanpa akun. */
  chooseNone(){
    player.authProvider = '';
    player.authToken = '';
    player.authUserName = '';
    player.authUserEmail = '';
    player.driveFileId = '';
    player.storageChoiceSeen = true;
    Store.save(player);
    toast('Main tanpa akun. Pakai import/export untuk pindah device.', '', ICONS.check);
    this._proceedAfterChoice();
  },

  /** Logout: hapus token, keep local data. */
  logout(){
    if(player.authProvider === 'google'){
      // revoke token via GIS kalau tersedia
      if(typeof google !== 'undefined' && google.accounts){
        try{ google.accounts.oauth2.revoke(player.authToken, ()=>{}); }catch(e){}
      }
    }else if(player.authProvider === 'facebook' && typeof FB !== 'undefined'){
      try{ FB.logout(()=>{}); }catch(e){}
    }
    player.authProvider = '';
    player.authToken = '';
    player.authUserName = '';
    player.authUserEmail = '';
    player.driveFileId = '';
    Store.save(player);
    toast('Logout berhasil. Data lokal tetap ada.', '', ICONS.check);
    renderHome();
  },

  /** Lanjut ke onboarding atau home setelah pilih storage. */
  _proceedAfterChoice(){
    if(!player.onboarded){
      onboardIdx = 0; renderOnboard();
      go('onboarding');
    }else{
      go('home');
      renderHome();
    }
  },

  /** Load external script, return Promise. */
  _loadScript(src){
    return new Promise((resolve, reject)=>{
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = ()=> reject(new Error('Gagal load ' + src));
      document.head.appendChild(s);
    });
  },

  /** Fetch user info dari FB Graph API. */
  async _fetchFbUserInfo(token){
    try{
      const r = await fetch(`https://graph.facebook.com/v18.0/me?fields=name,email&access_token=${token}`);
      if(!r.ok) return {};
      return await r.json();
    }catch(e){ return {}; }
  },
};

/* Google Drive sync — backup JSON (foto + metadata) ke appDataFolder user. */
const DriveSync = {
  _authHeader(){
    return { 'Authorization': 'Bearer ' + player.authToken, 'Content-Type': 'application/json' };
  },

  /** Cari file backup di appDataFolder. Return file ID atau null. */
  async findBackupFile(){
    if(!player.authToken) return null;
    try{
      const q = encodeURIComponent(`name='${CONFIG.AUTH.DRIVE_FILE_NAME}'`);
      const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`;
      const r = await fetch(url, { headers: this._authHeader() });
      if(!r.ok) return null;
      const data = await r.json();
      return (data.files && data.files.length > 0) ? data.files[0] : null;
    }catch(e){ return null; }
  },

  /** Buat file backup baru di appDataFolder. */
  async createBackupFile(jsonStr){
    const metadata = {
      name: CONFIG.AUTH.DRIVE_FILE_NAME,
      parents: ['appDataFolder'],
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonStr], { type: 'application/json' }));
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + player.authToken },
      body: form,
    });
    if(!r.ok) throw new Error('Gagal buat file backup');
    const data = await r.json();
    return data.id;
  },

  /** Update file backup existing. */
  async updateBackupFile(fileId, jsonStr){
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + player.authToken, 'Content-Type': 'application/json' },
      body: jsonStr,
    });
    if(!r.ok) throw new Error('Gagal update file backup');
  },

  /** Download file backup. Return JSON object atau null. */
  async downloadBackupFile(fileId){
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: this._authHeader(),
    });
    if(!r.ok) return null;
    return await r.json();
  },

  /** Kumpulkan data backup (sama dengan export: player + cats). */
  async _collectBackupData(){
    const cats = await allCats();
    return { exportedAt:new Date().toISOString(), player, cats };
  },

  /** Upload current state ke Drive. Buat file baru kalau belum ada. */
  async syncNow(){
    if(player.authProvider !== 'google' || !player.authToken){
      return { ok:false, error:'Belum login Google' };
    }
    try{
      const data = await this._collectBackupData();
      const jsonStr = JSON.stringify(data);
      let fileId = player.driveFileId;
      if(!fileId){
        // cari file existing dulu
        const existing = await this.findBackupFile();
        if(existing){
          fileId = existing.id;
          // cek apakah file server lebih baru — kalau ya, pull dulu
          const serverData = await this.downloadBackupFile(fileId);
          if(serverData){
            const shouldPull = this._shouldPullFromServer(data, serverData);
            if(shouldPull){
              await this._applyBackupData(serverData);
              player.driveFileId = fileId;
              player.lastSyncAt = new Date().toISOString();
              Store.save(player);
              return { ok:true, action:'pulled' };
            }
          }
        }else{
          // buat file baru
          fileId = await this.createBackupFile(jsonStr);
        }
      }
      // upload current state
      await this.updateBackupFile(fileId, jsonStr);
      player.driveFileId = fileId;
      player.lastSyncAt = new Date().toISOString();
      Store.save(player);
      return { ok:true, action:'pushed' };
    }catch(err){
      console.error('DriveSync.syncNow error', err);
      return { ok:false, error:err.message || String(err) };
    }
  },

  /**
   * Cek apakah data server lebih baru dari lokal.
   * Strategi simpel: bandingkan exportedAt + jumlah kucing + total XP.
   * Kalau server punya lebih banyak kucing ATAU XP lebih tinggi ATAU
   * exportedAt lebih baru > 60 detik, pull dari server.
   */
  _shouldPullFromServer(localData, serverData){
    if(!serverData || !serverData.player) return false;
    const localCats = (localData.cats || []).length;
    const serverCats = (serverData.cats || []).length;
    const localXp = (localData.player && localData.player.xp) || 0;
    const serverXp = (serverData.player && serverData.player.xp) || 0;
    // server lebih kaya = pull
    if(serverCats > localCats || serverXp > localXp) return true;
    // server lebih baru > 60s = pull (mungkin ada update dari device lain)
    try{
      const localT = new Date(localData.exportedAt).getTime();
      const serverT = new Date(serverData.exportedAt).getTime();
      if(serverT - localT > 60000) return true;
    }catch(e){}
    return false;
  },

  /** Apply backup data ke IndexedDB + localStorage. */
  async _applyBackupData(data){
    if(!data) return;
    // merge player state (preserve auth fields yang sudah ada)
    const authFields = {
      authProvider: player.authProvider,
      authToken: player.authToken,
      authUserName: player.authUserName,
      authUserEmail: player.authUserEmail,
      driveFileId: player.driveFileId,
      storageChoiceSeen: player.storageChoiceSeen,
    };
    player = Object.assign({}, Store.defaults(), data.player || {}, authFields);
    Store.save(player);
    // replace cats di IndexedDB (mode ganti total)
    if(Array.isArray(data.cats)){
      const db = await getDB();
      await db.clear('cats');
      for(const c of data.cats){
        await db.put('cats', c);
      }
      currentCatsCache = await allCats();
    }
  },
};

/* Facebook metadata sync — simpan metadata ke Supabase tabel user_data.
   Foto tetap lokal (FB tidak punya cloud storage user-facing). */
const FbSync = {
  /** Header untuk Supabase REST API dengan FB token sebagai Bearer. */
  _headers(){
    return {
      'apikey': CONFIG.LEADERBOARD.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + player.authToken,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    };
  },
  _url(path){
    return CONFIG.LEADERBOARD.SUPABASE_URL.replace(/\/$/, '') + path;
  },

  /** Sync metadata (player state tanpa foto) ke tabel user_data.
     Field: fb_user_id (PK), data (jsonb), updated_at (timestamptz). */
  async syncNow(){
    if(player.authProvider !== 'facebook' || !player.authToken) return { ok:false, error:'Belum login Facebook' };
    if(!Auth.isSupabaseConfigured()) return { ok:false, error:'Supabase belum dikonfigurasi' };
    try{
      // ambil FB user ID
      const userInfo = await Auth._fetchFbUserInfo(player.authToken);
      const fbUserId = userInfo.id;
      if(!fbUserId) return { ok:false, error:'Gagal ambil FB user ID' };
      // kumpulkan metadata (player state, tanpa authToken)
      const metadata = Object.assign({}, player);
      delete metadata.authToken; // jangan simpan token ke server
      const body = JSON.stringify({
        fb_user_id: fbUserId,
        data: metadata,
        updated_at: new Date().toISOString(),
      });
      const r = await fetch(this._url('/rest/v1/user_data'), {
        method: 'POST',
        headers: this._headers(),
        body,
      });
      if(!r.ok) return { ok:false, error:'Gagal sync ke server' };
      player.lastSyncAt = new Date().toISOString();
      Store.save(player);
      return { ok:true };
    }catch(err){
      console.error('FbSync.syncNow error', err);
      return { ok:false, error:err.message || String(err) };
    }
  },

  /** Pull metadata dari server (untuk restore di device baru). */
  async pullFromServer(){
    if(player.authProvider !== 'facebook' || !player.authToken) return { ok:false };
    if(!Auth.isSupabaseConfigured()) return { ok:false };
    try{
      const userInfo = await Auth._fetchFbUserInfo(player.authToken);
      const fbUserId = userInfo.id;
      if(!fbUserId) return { ok:false };
      const url = this._url(`/rest/v1/user_data?fb_user_id=eq.${fbUserId}&select=data`);
      const r = await fetch(url, { headers: this._headers() });
      if(!r.ok) return { ok:false };
      const data = await r.json();
      if(!Array.isArray(data) || data.length === 0) return { ok:false, error:'Belum ada data tersimpan' };
      const serverPlayer = data[0].data;
      // merge: preserve auth fields lokal, ambil sisanya dari server
      const authFields = {
        authProvider: player.authProvider,
        authToken: player.authToken,
        authUserName: player.authUserName,
        authUserEmail: player.authUserEmail,
        storageChoiceSeen: player.storageChoiceSeen,
      };
      player = Object.assign({}, Store.defaults(), serverPlayer || {}, authFields);
      Store.save(player);
      player.lastSyncAt = new Date().toISOString();
      Store.save(player);
      return { ok:true };
    }catch(err){
      console.error('FbSync.pullFromServer error', err);
      return { ok:false, error:err.message };
    }
  },
};

// Trigger sync setelah saveCat (debounced). Cek provider + jalankan sync yang sesuai.
let syncDebounceTimer = null;
function triggerSyncAfterSave(){
  if(!Auth.isLoggedIn()) return;
  if(syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async ()=>{
    if(player.authProvider === 'google'){
      const r = await DriveSync.syncNow();
      if(!r.ok) console.warn('Auto-sync Google gagal', r.error);
    }else if(player.authProvider === 'facebook'){
      const r = await FbSync.syncNow();
      if(!r.ok) console.warn('Auto-sync Facebook gagal', r.error);
    }
  }, CONFIG.AUTH.SYNC_DEBOUNCE_MS);
}

// Handler untuk layar pilih storage
document.querySelectorAll('.storage-opt').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const provider = btn.dataset.provider;
    const note = $('#storage-choice-note');
    if(provider === 'none'){
      Auth.chooseNone();
    }else if(provider === 'google'){
      if(!Auth.isGoogleConfigured()){
        if(note) note.innerHTML = 'Google login belum dikonfigurasi developer. Sementara pakai <b>main tanpa akun</b> dulu ya — import/export manual tetap tersedia.';
        return;
      }
      const r = await Auth.loginGoogle();
      if(!r.ok && note) note.textContent = r.error;
    }else if(provider === 'facebook'){
      if(!Auth.isFacebookConfigured()){
        if(note) note.innerHTML = 'Facebook login belum dikonfigurasi developer. Sementara pakai <b>main tanpa akun</b> dulu ya — import/export manual tetap tersedia.';
        return;
      }
      if(!Auth.isSupabaseConfigured()){
        if(note) note.innerHTML = 'Supabase belum dikonfigurasi (dibutuhkan untuk Facebook login). Sementara pakai <b>main tanpa akun</b> dulu ya.';
        return;
      }
      const r = await Auth.loginFacebook();
      if(!r.ok && note) note.textContent = r.error;
    }
  });
});


/**
 * E1 addendum: attach tilt 3D + holografik reaktif ke elemen .trading-card.
 * Pointer device: pointermove -> set --rx/--ry/--hx/--hy CSS custom properties.
 * Touch device: coba deviceorientation (perlu izin di iOS); fallback auto-sweep.
 * Hormati prefers-reduced-motion: skip total kalau aktif.
 */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function attachCardTilt(cardEl){
  if(!cardEl || prefersReducedMotion) return;
  // skip kalau sudah pernah attach
  if(cardEl.dataset.tiltAttached) return;
  cardEl.dataset.tiltAttached = '1';

  // pointer move handler (mouse + touch drag)
  const onMove = (e)=>{
    const rect = cardEl.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0]?.clientX) || 0) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0]?.clientY) || 0) - rect.top;
    if(x === 0 && y === 0) return;
    // normalisasi -1..1 relatif ke pusat kartu
    const nx = (x / rect.width) * 2 - 1;   // -1 (kiri) .. 1 (kanan)
    const ny = (y / rect.height) * 2 - 1;  // -1 (atas) .. 1 (bawah)
    // rotateY mengikuti X (kursor kanan = kartu miring kanan), rotateX kebalikan Y
    const maxTilt = 12; // derajat
    const rx = (nx * maxTilt).toFixed(2);
    const ry = (-ny * maxTilt).toFixed(2);
    cardEl.style.setProperty('--rx', rx + 'deg');
    cardEl.style.setProperty('--ry', ry + 'deg');
    cardEl.style.setProperty('--hx', (nx * 50 + 50).toFixed(1) + '%');
    cardEl.style.setProperty('--hy', (ny * 50 + 50).toFixed(1) + '%');
    cardEl.classList.add('tilt-active');
  };
  const onLeave = ()=>{
    cardEl.classList.remove('tilt-active');
    cardEl.style.setProperty('--rx', '0deg');
    cardEl.style.setProperty('--ry', '0deg');
    cardEl.style.setProperty('--hx', '50%');
    cardEl.style.setProperty('--hy', '50%');
  };
  cardEl.addEventListener('pointermove', onMove);
  cardEl.addEventListener('pointerleave', onLeave);
  cardEl.addEventListener('pointercancel', onLeave);

  // auto-sweep sekali saat kartu pertama muncul (untuk efek "hidup")
  // cuma jalan kalau deviceorientation tidak tersedia/ditolak
  let autoSwept = false;
  function autoSweepOnce(){
    if(autoSwept) return;
    autoSwept = true;
    let t = 0;
    const sweep = setInterval(()=>{
      t += 0.08;
      if(t >= Math.PI){
        clearInterval(sweep);
        onLeave();
        return;
      }
      const nx = Math.sin(t) * 0.6;
      const ny = Math.cos(t * 0.7) * 0.3;
      cardEl.style.setProperty('--rx', (nx * 12).toFixed(2) + 'deg');
      cardEl.style.setProperty('--ry', (-ny * 12).toFixed(2) + 'deg');
      cardEl.style.setProperty('--hx', (nx * 50 + 50).toFixed(1) + '%');
      cardEl.style.setProperty('--hy', (ny * 50 + 50).toFixed(1) + '%');
      cardEl.classList.add('tilt-active');
    }, 40);
  }

  // deviceorientation untuk mobile (perlu izin eksplisit di iOS 13+)
  if(window.DeviceOrientationEvent){
    // cek apakah perlu request permission (iOS)
    if(typeof DeviceOrientationEvent.requestPermission === 'function'){
      // iOS: butuh gesture user. Tunggu tap pertama di kartu.
      cardEl.addEventListener('click', function iosPermissionTap(){
        DeviceOrientationEvent.requestPermission().then(state=>{
          if(state === 'granted'){
            window.addEventListener('deviceorientation', onOrient);
            cardEl.removeEventListener('click', iosPermissionTap);
          } else {
            autoSweepOnce();
          }
        }).catch(()=> autoSweepOnce());
      }, { once: true });
    } else {
      // Android: langsung listen
      window.addEventListener('deviceorientation', onOrient);
    }
  } else {
    autoSweepOnce();
  }
  function onOrient(ev){
    // gamma: left-right tilt (-90..90), beta: front-back tilt (-180..180)
    const g = ev.gamma || 0;
    const b = ev.beta || 0;
    const maxTilt = 10;
    const rx = Math.max(-maxTilt, Math.min(maxTilt, g / 6)).toFixed(2);
    const ry = Math.max(-maxTilt, Math.min(maxTilt, (b - 45) / 8)).toFixed(2);
    cardEl.style.setProperty('--rx', rx + 'deg');
    cardEl.style.setProperty('--ry', ry + 'deg');
    cardEl.style.setProperty('--hx', (parseFloat(rx)/maxTilt * 50 + 50).toFixed(1) + '%');
    cardEl.style.setProperty('--hy', (parseFloat(ry)/maxTilt * 50 + 50).toFixed(1) + '%');
    cardEl.classList.add('tilt-active');
  }
}

/**
 * E2 addendum: reveal ceremony ("upacara buka kartu") sebelum kartu tampil penuh.
 * Kartu muncul dalam kondisi silhouette/back-side, berdenyut 2-3x, lalu flip
 * untuk mengungkap wajah + confetti + haptic. Durasi proporsional ke rarity.
 * Bisa di-skip dengan tap di mana saja.
 * Return Promise yang resolve ketika ceremony selesai (atau di-skip).
 */
function playRevealCeremony(cat, onRevealed){
  if(prefersReducedMotion){
    // skip ceremony total, langsung panggil callback
    if(onRevealed) onRevealed();
    return;
  }
  const stage = $('#reveal-stage');
  const card = $('#reveal-card');
  const silhouette = $('#reveal-silhouette');
  const inner = $('#reveal-card-inner');
  if(!stage || !card){ if(onRevealed) onRevealed(); return; }

  // durasi build-up per rarity
  const buildMs = cat.rarity==='legendaris' ? 1300
                : cat.rarity==='epik' ? 900
                : cat.rarity==='langka' ? 600
                : 400;

  // isi inner dengan wajah kartu (akan terlihat setelah flip)
  const rar = RARITIES[cat.rarity] || RARITIES.biasa;
  const d = new Date(cat.date);
  inner.innerHTML = `
    <div class="id">#${cat.id.replace('MDX-','')}</div>
    <div class="rarity-tag" style="background:${rar.color};color:${rar.ink};">${rar.label}</div>
    <div class="photo" style="height:220px;"><img src="${cat.photo}" alt="${escapeHtml(cat.name)}"></div>
    <h4>${escapeHtml(cat.name)}</h4>
    <div class="tag-row"><span>${escapeHtml((COLORS.find(x=>x.id===cat.color)||{}).label || cat.color)}</span></div>
    <div class="quote">"${escapeHtml(cat.quote)}"</div>
    <div class="holo-sheen" aria-hidden="true"></div>`;
  // terapkan rarity class ke reveal-card supaya styling holo-sheen sesuai
  card.classList.remove('rare','epic','legendary');
  if(cat.rarity==='langka') card.classList.add('rare');
  else if(cat.rarity==='epik') card.classList.add('epic');
  else if(cat.rarity==='legendaris') card.classList.add('legendary','rare');

  // tampilkan stage
  stage.classList.add('active');
  stage.setAttribute('aria-hidden','false');
  card.classList.remove('flipped');
  silhouette.style.display = 'grid';

  let skipped = false;
  let revealed = false;
  function skip(){
    if(skipped) return;
    skipped = true;
    if(!revealed){ doReveal(); }
  }
  function doReveal(){
    if(revealed) return;
    revealed = true;
    silhouette.style.display = 'none';
    card.classList.add('flipped');
    // attach tilt ke reveal-card supaya langsung interaktif setelah flip
    setTimeout(()=> attachCardTilt(card), 400);
    // trigger confetti + haptic + chime di momen flip
    if(cat.rarity==='legendaris' || cat.rarity==='epik'){
      launchConfetti(cat.rarity==='legendaris' ? 60 : 30);
    }
    if(navigator.vibrate) navigator.vibrate(cat.rarity==='legendaris'?[20,40,20,40,20]:[15]);
    playChime();
    if(onRevealed) onRevealed();
  }
  // tap di mana saja = skip
  stage.addEventListener('click', skip, { once: true });
  // setelah build-up, otomatis reveal
  setTimeout(doReveal, buildMs);
  // auto-close stage 3.5s setelah reveal
  setTimeout(()=>{
    if(revealed){
      stage.classList.remove('active');
      stage.setAttribute('aria-hidden','true');
    }
  }, buildMs + 3500);
}

/**
 * E3 addendum: maskot Si Oren blink di Beranda.
 * Cari elemen mata SVG di onboarding/beranda, jalankan blink acak tiap 4-6s.
 */
let mascotBlinkTimer = null;
function startMascotBlink(){
  if(prefersReducedMotion) return;
  if(mascotBlinkTimer) clearInterval(mascotBlinkTimer);
  function doBlink(){
    // cari semua elemen mata di SVG maskot (circle/ellipse dengan fill gelap)
    const eyes = document.querySelectorAll('.mascot-eye, [data-mascot-eye]');
    if(eyes.length === 0) return;
    eyes.forEach(eye=>{
      eye.classList.remove('mascot-blink');
      // reflow supaya animation restart
      void eye.offsetWidth;
      eye.classList.add('mascot-blink');
    });
  }
  function scheduleNext(){
    const delay = 4000 + Math.random() * 2000; // 4-6s
    mascotBlinkTimer = setTimeout(()=>{
      doBlink();
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}

/**
 * E3 addendum: attach tilt ke kartu baru saat renderNewCard dipanggil.
 * Dipanggil dari renderNewCard setelah DOM siap.
 */
function attachTiltToNewCard(){
  const card = $('#new-card');
  if(card) attachCardTilt(card);
}

/**
 * E3 addendum: attach tilt ke kartu di detail sheet (openCatDetail).
 * Dipanggil setelah sheet terbuka.
 */
function attachTiltToDetailCard(){
  // kartu di detail sheet pakai class .trading-card juga
  const card = document.querySelector('.sheet .trading-card');
  if(card) attachCardTilt(card);
}

// Panggil startMascotBlink setelah app load
window.addEventListener('load', ()=>{
  setTimeout(startMascotBlink, 1500);
});

/**
 * F1 addendum: Coach-mark kontekstual.
 * Tampilkan spotlight (lingkaran terang) di sekitar targetEl + satu baris
 * keterangan singkat. Hanya muncul SEKALI per key — setelah ditampilkan,
 * set player.coachMarksSeen[key] = true, tidak muncul lagi untuk pemain itu.
 * Spotlight hilang otomatis setelah aksi pertama berhasil ATAU setelah
 * timeout 8 detik.
 */
function showCoachMark(targetEl, text, key){
  if(!targetEl || !key) return;
  // skip kalau sudah pernah dilihat
  if(player.coachMarksSeen && player.coachMarksSeen[key]) return;
  // skip kalau reduced motion
  if(prefersReducedMotion) return;

  // init coachMarksSeen kalau belum ada
  if(!player.coachMarksSeen) player.coachMarksSeen = {};
  player.coachMarksSeen[key] = true;
  Store.save(player);

  // buat overlay + spotlight
  const overlay = el('div', { class:'coach-mark-overlay', 'data-coach-key':key });
  const rect = targetEl.getBoundingClientRect();
  const spotlight = el('div', {
    class:'coach-spotlight',
    style:`top:${rect.top - 8}px;left:${rect.left - 8}px;width:${rect.width + 16}px;height:${rect.height + 16}px;`
  });
  const tip = el('div', {
    class:'coach-tip',
    style:`top:${rect.bottom + 12}px;left:${Math.max(12, Math.min(rect.left, window.innerWidth - 280))}px;`
  });
  tip.innerHTML = `<div class="coach-tip-text">${text}</div><div class="coach-tip-arrow"></div>`;
  overlay.appendChild(spotlight);
  overlay.appendChild(tip);
  document.body.appendChild(overlay);

  // dismiss handlers
  let dismissed = false;
  function dismiss(){
    if(dismissed) return;
    dismissed = true;
    overlay.classList.add('out');
    setTimeout(()=> overlay.remove(), 300);
  }
  // tap di mana saja = dismiss
  overlay.addEventListener('click', dismiss, { once: true });
  // aksi pertama di target = dismiss
  targetEl.addEventListener('pointerdown', dismiss, { once: true });
  // auto-dismiss 8s
  setTimeout(dismiss, 8000);
}

// F1 addendum: trigger coach-mark saat pertama masuk screen feed
const _origInitFeed = initFeed;
initFeed = function(){
  _origInitFeed();
  // coach-mark untuk tombol Lempar Makanan — muncul 600ms setelah feed render
  setTimeout(()=>{
    const throwBtn = $('#btn-throw');
    if(throwBtn){
      showCoachMark(throwBtn, 'Tahan untuk isi daya, lepas untuk lempar makanan.', 'feed-throw');
    }
  }, 600);
};

/* ---------------------------------------------------------------------
   15. Service worker
   --------------------------------------------------------------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      // cek update berkala
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing;
        if(!nw) return;
        nw.addEventListener('statechange', ()=>{
          if(nw.state==='installed' && navigator.serviceWorker.controller){
            // ada update, tampilkan toast
            showUpdateToast();
          }
        });
      });
      // polling update tiap 60 menit
      setInterval(()=> reg.update().catch(()=>{}), 60*60*1000);
    }).catch(err=> console.warn('SW reg gagal', err));
    // jika controller berubah (update aktif), reload sekali
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    // Bagian D1 addendum: terima pesan dari SW saat stale-while-revalidate
    // mendeteksi konten berubah. Tampilkan toast update supaya pemain tahu
    // ada versi baru yang akan aktif setelah refresh.
    navigator.serviceWorker.addEventListener('message', (ev)=>{
      if(ev.data && ev.data.type === 'meongdex-content-updated'){
        showUpdateToast();
      }
    });
  });
}

function showUpdateToast(){
  // toast custom dengan tombol refresh
  const wrap = $('#toast-wrap');
  if(!wrap) return;
  const t = el('div',{class:'toast update-toast'});
  t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v4h-4"/></svg> Versi baru Meongdex tersedia';
  const btn = el('button',{class:'toast-btn', onclick:()=>{ window.location.reload(); }}, 'Refresh');
  t.appendChild(btn);
  wrap.appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),300); }, 8000);
}

/* ---------------------------------------------------------------------
   16. Jam status bar
   --------------------------------------------------------------------- */
function updateClock(){
  const d = new Date();
  $('#clock').textContent = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
updateClock(); setInterval(updateClock, 30000);

/* ---------------------------------------------------------------------
   16b. A11y: tandai SVG dekoratif sebagai aria-hidden
   --------------------------------------------------------------------- */
function fixSvgA11y(){
  document.querySelectorAll('svg:not([aria-label]):not([aria-hidden])').forEach(s=>{
    // SVG yang ada di dalam button/link dengan teks -> dekoratif
    const interactive = s.closest('button,a,[role=button]');
    if(interactive && interactive.textContent.trim()){ s.setAttribute('aria-hidden','true'); return; }
    // SVG yang sudah ada <title> -> biarkan
    if(s.querySelector('title')) return;
    // sisanya (pola dekoratif, ornament, mascot dengan label context) -> hidden
    s.setAttribute('aria-hidden','true');
  });
}

/* ---------------------------------------------------------------------
   17. Init
   --------------------------------------------------------------------- */
(async function init(){
  currentCatsCache = await allCats();
  renderOnboard();
  // Auth & sync: tampilkan layar pilih storage kalau belum pernah pilih.
  // Pemain yang sudah login (authProvider != '') skip langsung.
  // Pemain yang sudah pernah lihat tapi pilih "none" juga skip (storageChoiceSeen=true).
  if(!player.storageChoiceSeen && !Auth.isLoggedIn()){
    go('storage-choice');
  }else if(player.onboarded){ go('home'); }
  else { go('onboarding'); }
  fixSvgA11y();
  // re-run a11y fix setelah render dinamis (pemanggilan internal di go() sudah handle via DOM mutation)
  const obs = new MutationObserver(()=> fixSvgA11y());
  obs.observe(document.body, { childList:true, subtree:true });
  // preload model AI di latar belakang (non-blocking) setelah onboarding
  setTimeout(()=>{ loadModel().catch(()=>{}); }, 4000);
})();
