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
  PHOTO_MAX_EDGE: 1024,        // downscale foto sebelum disimpan
  PHOTO_QUALITY: 0.82,         // kualitas JPEG
  COTD_KEY: 'meongdex_cotd',
  SESSION_WINDOW_MS: 30*60*1000, // 30 menit antar temuan = sesi sama
  SESSION_BONUS_PER_CAT: 15,     // bonus XP per kucing tambahan dalam sesi
  SESSION_BONUS_CAP: 60,         // maks bonus sesi per kucing
  CHALLENGE_BONUS: 80,           // XP per tantangan selesai
};

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

const MOODS = ['Penasaran','Waspada','Terpana','Suka makan','Mendengkur'];

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
      soundEnabled:true,
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
const screenOrder = ['onboarding','home','perm-loc','feed','perm-cam','verify','card','dex','journal','settings'];
let currentScreen = 'onboarding';

function go(screen){
  if(!screenOrder.includes(screen)) return;
  $$('.screen').forEach(s=> s.classList.toggle('active', s.dataset.screen===screen));
  currentScreen = screen;
  $('#main').scrollTop = 0;
  // bottom nav aktif
  const navMap = { home:'home', dex:'dex', settings:'settings', journal:'journal' };
  $$('.bottom-nav button').forEach(b=>{
    const active = b.dataset.nav === navMap[screen] || (screen==='find' && b.dataset.nav==='find');
    b.classList.toggle('active', active);
  });
  // render ulang konten yang dinamis per screen
  if(screen==='home') renderHome();
  if(screen==='dex') renderDex();
  if(screen==='journal') renderJournal();
  if(screen==='settings') {/* statis */}
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
  $('#stat-streak').textContent = player.streak || 0;
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
  // tantangan
  renderChallengesCard();
  // kucing hari ini
  renderCotd(cats);
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
  $('#feed-cat').classList.remove('happy','eating');
  $('#feed-hint').textContent = 'Pilih makanan, lalu tahan tombol untuk mengisi daya lemparan.';
  $('#btn-throw').textContent = '';
  $('#btn-throw').insertAdjacentHTML('afterbegin',
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-1.6 2-1.6 15 0 17M12 3.5c1.6 2 1.6 15 0 17M4.5 9h15M4.5 15h15"/></svg> Tahan untuk isi daya');
  renderFoodPicker();
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
    b.appendChild(el('span',{class:'fico',style:`background:${f.color}22;color:${f.color};`}, [foodIconSvg(f.icon)]));
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
  // cat bereaksi
  setTimeout(()=>{
    catEl.classList.add('eating');
    $('#feed-mood').textContent = MOODS[3];
    playPurr(1600); // efek suara dengkuran
  }, 850);
  setTimeout(()=>{
    catEl.classList.remove('eating');
    catEl.classList.add('happy');
    $('#feed-mood').textContent = MOODS[4];
    $('#feed-hint').textContent = 'Kucingnya suka! Saatnya foto.';
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

  if(errored){
    tag.className = 'ai-tag err';
    tagText.textContent = 'Verifikasi AI gagal';
    msg.textContent = 'Tidak bisa memverifikasi foto otomatis. Kamu yakin ini kucing?';
    btnText.textContent = 'Ya, ini kucing';
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
  }else{
    tag.className = 'ai-tag warn';
    tagText.textContent = 'AI belum yakin ini kucing';
    msg.textContent = 'Sepertinya AI belum yakin ini kucing. Kamu yakin ini kucing?';
    btnText.textContent = 'Ya, ini kucing';
  }
}

$('#btn-retake').addEventListener('click', ()=>{
  pendingPhoto = null;
  go('perm-cam');
});
$('#btn-confirm').addEventListener('click', ()=>{
  // lanjut buat kartu
  buildNewCard();
});

/* ---------------------------------------------------------------------
   12. Kartu kucing baru
   --------------------------------------------------------------------- */
let pendingCat = null; // cat object yang akan disimpan
let selectedColor = 'lainnya';

async function buildNewCard(){
  const id = await nextCatId();
  // rarity: calico -> langka; atau ~18% acak langka
  const isRare = selectedColor==='calico' ? true : (Math.random() < 0.18);
  const rarity = isRare ? 'langka' : 'biasa';
  const quote = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  // default nama
  const num = parseInt(id.replace(/\D/g,''),10);
  pendingCat = {
    id,
    name: `Kucing Tanpa Nama #${num}`,
    photo: pendingPhoto.dataUrl,
    date: new Date().toISOString(),
    lat: pendingLocation ? pendingLocation.lat : null,
    lon: pendingLocation ? pendingLocation.lon : null,
    color: selectedColor,
    rarity,
    quote,
    foodUsed: selectedFood,
    verifiedByAI: $('#verify-tag').classList.contains('err') ? false : ($('#verify-tag').classList.contains('warn') ? false : true),
  };
  selectedColor = 'lainnya'; // reset pilihan untuk cat berikutnya
  renderNewCard();
  go('card');
}

function renderNewCard(){
  const c = pendingCat;
  const card = $('#new-card');
  card.classList.toggle('rare', c.rarity==='langka');
  $('#card-id').textContent = '#'+c.id.replace('MDX-','');
  $('#card-rarity').textContent = c.rarity==='langka' ? 'LANGKA' : 'BIASA';
  $('#card-img').src = c.photo;
  $('#card-name').textContent = c.name;
  const d = new Date(c.date);
  const locText = c.lat!=null ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : 'lokasi tidak dicatat';
  $('#card-sub').textContent = `${d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · ${locText}`;
  // tags
  const tags = $('#card-tags'); tags.innerHTML='';
  const colorLabel = (COLORS.find(x=>x.id===c.color)||{}).label || c.color;
  tags.appendChild(el('span',{}, colorLabel));
  tags.appendChild(el('span',{}, c.rarity==='langka'?'Langka':'Biasa'));
  tags.appendChild(el('span',{}, c.verifiedByAI ? 'Terverifikasi AI' : 'Konfirmasi manual'));
  $('#card-quote').textContent = '"'+c.quote+'"';
  // name input
  $('#card-name-input').value = c.name;
  // color picker di meta
  renderColorPicker();
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
$('#btn-save-card').addEventListener('click', saveCat);

async function saveCat(){
  if(!pendingCat) return;
  const btn = $('#btn-save-card'); btn.disabled = true;
  try{
    // terapkan warna &amp; rarity final
    pendingCat.color = selectedColor;
    const isRare = selectedColor==='calico' ? true : (pendingCat.rarity==='langka');
    pendingCat.rarity = isRare ? 'langka' : 'biasa';
    // simpan makanan yang dipakai (dari feed)
    pendingCat.foodUsed = pendingCat.foodUsed || 'snack';
    // jika nama kosong, default
    if(!pendingCat.name || pendingCat.name.startsWith('Kucing Tanpa Nama')){
      // biarkan default
    }
    await addCat(pendingCat);
    // refresh cache SEBELUM cek challenge (butuh data terbaru)
    currentCatsCache = await allCats();
    // update stat
    const oldLevel = levelFromXp(player.xp);
    let gain = CONFIG.XP_PER_CAT + (pendingCat.rarity==='langka'?CONFIG.XP_RARE_BONUS:0);
    // bonus makanan
    const food = FOODS.find(f=>f.id===pendingCat.foodUsed);
    if(food && food.xpBonus){ gain += food.xpBonus; }
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
    Store.save(player);
    const newLevel = levelFromXp(player.xp);

    // --- Toast rangkaian (simpan ref sebelum null) ---
    const savedCat = pendingCat;
    pendingCat = null;
    btn.disabled = false;
    toast(`Nomor ${savedCat.id} terdaftar di Meongdex-mu!`, savedCat.rarity==='langka'?'gold':'success', ICONS.star);
    playChime();
    if(sessionBonus > 0){
      setTimeout(()=> toast(`Bonus sesi berburu: +${sessionBonus} XP (${sessionCount} kucing)`, 'success', ICONS.paw), 700);
    }
    newlyCompleted.forEach((ch, i)=>{
      setTimeout(()=> toast(`Tantangan selesai: ${ch.label} (+${CONFIG.CHALLENGE_BONUS} XP)`, 'gold', ICONS.star), 1100 + i*900);
    });
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

async function renderDex(){
  currentCatsCache = await allCats();
  const cork = $('#dex-cork');
  $('#dex-count').textContent = `${currentCatsCache.length} kucing`;
  const filtered = currentCatsCache.filter(c=>{
    if(currentFilter==='all') return true;
    if(currentFilter==='biasa'||currentFilter==='langka') return c.rarity===currentFilter;
    return c.color===currentFilter;
  });
  cork.innerHTML='';
  if(currentCatsCache.length===0){
    cork.appendChild(emptyCorkboard());
    return;
  }
  filtered.forEach(c=> cork.appendChild(miniCard(c)));
  // tambah slot kosong untuk nuance "belum terisi" (sampai kelipatan genap)
  if(filtered.length % 2 !== 0){
    cork.appendChild(emptySlot());
  }
}

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
  const card = el('div',{class:'mini-card'+(c.rarity==='langka'?' rare':''), onclick:()=>openCatDetail(c.id)});
  card.appendChild(el('div',{class:'pin'}));
  const thumb = el('div',{class:'thumb'});
  if(c.photo) thumb.innerHTML = `<img src="${c.photo}" alt="${c.name}">`;
  card.appendChild(thumb);
  card.appendChild(el('div',{class:'name'}, c.name));
  card.appendChild(el('div',{class:'mini-id'}, '#'+c.id.replace('MDX-','')));
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
  const badgeHtml = myBadges.length ? `<div class="badge-grid">${myBadges.map(b=>
    `<span class="badge-chip blush"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>${b.label}</span>`
  ).join('')}</div>` : '';
  content.innerHTML = `
    <h3>${escapeHtml(c.name)}</h3>
    <p class="mono" style="font-size:12px;color:var(--text-soft);margin-bottom:12px;">#${c.id} · ${d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
    <div class="trading-card ${c.rarity==='langka'?'rare':''}" style="width:100%;transform:none;margin-bottom:14px;">
      <div class="id">#${c.id.replace('MDX-','')}</div>
      <div class="rarity-tag">${c.rarity==='langka'?'LANGKA':'BIASA'}</div>
      <div class="photo" style="height:200px;"><img src="${c.photo}" alt="${escapeHtml(c.name)}"></div>
      <h4>${escapeHtml(c.name)}</h4>
      <div class="sub">${d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · ${locText}</div>
      <div class="tag-row"><span>${colorLabel}</span><span>${c.rarity==='langka'?'Langka':'Biasa'}</span><span>${c.verifiedByAI?'Terverifikasi AI':'Konfirmasi manual'}</span></div>
      <div class="quote">"${escapeHtml(c.quote)}"</div>
    </div>
    ${badgeHtml}
    <div class="row gap-8" style="flex-wrap:wrap;">
      <span class="pill">${c.verifiedByAI?'AI':'Manual'}</span>
      <span class="pill">${colorLabel}</span>
      <span class="pill">${locText}</span>
    </div>
    <div class="row gap-8 mt-16">
      <button class="btn teal block" id="detail-share">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
        Bagikan
      </button>
      <button class="btn secondary block" id="detail-rename">Ganti nama</button>
      <button class="btn block danger" id="detail-delete" style="background:#a8462e;color:#fff;">Hapus</button>
    </div>`;
  openSheet(content);
  $('#detail-share').addEventListener('click', ()=> openShareSheet(c));
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
  const cats = await allCats();
  const list = $('#journal-list');
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
    const totalXp = entries.reduce((s,c)=> s + CONFIG.XP_PER_CAT + (c.rarity==='langka'?CONFIG.XP_RARE_BONUS:0), 0);
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
      const xp = CONFIG.XP_PER_CAT + (c.rarity==='langka'?CONFIG.XP_RARE_BONUS:0);
      const entry = el('div',{class:'journal-entry'+(c.rarity==='langka'?' rare':''), onclick:()=>openCatDetail(c.id)});
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
    list.appendChild(dayWrap);
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
  // border kelangkaan
  const border = cat.rarity==='langka' ? '#D4AF37' : '#4A9B8E';
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
  // rarity tag top-right foto
  const rarityLabel = cat.rarity==='langka' ? 'LANGKA' : 'BIASA';
  ctx.font = 'bold 22px "JetBrains Mono",monospace';
  const rw = ctx.measureText(rarityLabel).width + 40;
  ctx.fillStyle = border;
  roundRect(ctx, photoX+photoW-rw-18, photoY+18, rw, 50, 999); ctx.fill();
  ctx.fillStyle = cat.rarity==='langka' ? '#4A3A0E' : '#fff';
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
  toast('Cadangan diunduh','',ICONS.check);
});
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
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
});
window.addEventListener('appinstalled', ()=>{
  deferredPrompt = null;
  toast('Meongdex terpasang. Cek layar utamamu!','success',ICONS.check);
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
   15. Service worker
   --------------------------------------------------------------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(err=> console.warn('SW reg gagal', err));
  });
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
  if(player.onboarded){ go('home'); }
  else { go('onboarding'); }
  fixSvgA11y();
  // re-run a11y fix setelah render dinamis (pemanggilan internal di go() sudah handle via DOM mutation)
  const obs = new MutationObserver(()=> fixSvgA11y());
  obs.observe(document.body, { childList:true, subtree:true });
  // preload model AI di latar belakang (non-blocking) setelah onboarding
  setTimeout(()=>{ loadModel().catch(()=>{}); }, 4000);
})();
