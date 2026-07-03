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
};

const COLORS = [
  { id:'oren',  label:'Oren',  hex:'#E8804C' },
  { id:'hitam', label:'Hitam', hex:'#3A2E2A' },
  { id:'putih', label:'Putih', hex:'#F2EADB' },
  { id:'belang',label:'Belang',hex:'#C9A87C' },
  { id:'calico',label:'Calico',hex:'#E8804C' },
  { id:'lainnya',label:'Lainnya',hex:'#9b8b7e' },
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
const screenOrder = ['onboarding','home','perm-loc','feed','perm-cam','verify','card','dex','settings'];
let currentScreen = 'onboarding';

function go(screen){
  if(!screenOrder.includes(screen)) return;
  $$('.screen').forEach(s=> s.classList.toggle('active', s.dataset.screen===screen));
  currentScreen = screen;
  $('#main').scrollTop = 0;
  // bottom nav aktif
  const navMap = { home:'home', dex:'dex', settings:'settings' };
  $$('.bottom-nav button').forEach(b=>{
    const active = b.dataset.nav === navMap[screen] || (screen==='find' && b.dataset.nav==='find');
    b.classList.toggle('active', active);
  });
  // render ulang konten yang dinamis per screen
  if(screen==='home') renderHome();
  if(screen==='dex') renderDex();
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
  $('#stat-fed').textContent = player.fed;
  $('#stat-xp').textContent = player.xp;
  const d = new Date();
  $('#home-date').textContent = d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'});
  // misi
  const resetMission = player.missionDate !== todayKey();
  if(resetMission){ player.missionCount=0; player.missionDone=false; player.missionDate=todayKey(); Store.save(player); }
  $('#mission-count').textContent = `${player.missionCount} / ${CONFIG.MISSION_GOAL}`;
  $('#mission-bar').style.width = Math.min(100, (player.missionCount/CONFIG.MISSION_GOAL)*100) + '%';
  // kucing hari ini
  renderCotd(cats);
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
  $('#feed-hint').textContent = 'Tahan tombol untuk mengisi kekuatan lemparan, lepas untuk melempar.';
  $('#btn-throw').textContent = '';
  $('#btn-throw').insertAdjacentHTML('afterbegin',
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c-1.6 2-1.6 15 0 17M12 3.5c1.6 2 1.6 15 0 17M4.5 9h15M4.5 15h15"/></svg> Tahan untuk isi daya');
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
    // jika nama kosong, default
    if(!pendingCat.name || pendingCat.name.startsWith('Kucing Tanpa Nama')){
      // biarkan default
    }
    await addCat(pendingCat);
    // update stat
    const oldLevel = levelFromXp(player.xp);
    let gain = CONFIG.XP_PER_CAT + (pendingCat.rarity==='langka'?CONFIG.XP_RARE_BONUS:0);
    player.xp += gain;
    player.fed += 1;
    // misi
    if(!player.missionDone && player.missionDate===todayKey()){
      player.missionCount += 1;
      if(player.missionCount >= CONFIG.MISSION_GOAL){
        player.missionDone = true;
        player.xp += CONFIG.MISSION_BONUS;
        gain += CONFIG.MISSION_BONUS;
      }
    } else if(player.missionDate!==todayKey()){
      player.missionDate = todayKey(); player.missionCount=1; player.missionDone=false;
    }
    Store.save(player);
    // refresh cache
    currentCatsCache = await allCats();
    const newLevel = levelFromXp(player.xp);
    // toast
    toast(`Nomor ${pendingCat.id} terdaftar di Meongdex-mu!`, pendingCat.rarity==='langka'?'gold':'success', ICONS.star);
    pendingCat = null;
    btn.disabled = false;
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
  const content = el('div');
  const colorLabel = (COLORS.find(x=>x.id===c.color)||{}).label || c.color;
  const d = new Date(c.date);
  const locText = c.lat!=null ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}` : 'lokasi tidak dicatat';
  content.innerHTML = `
    <h3>${escapeHtml(c.name)}</h3>
    <p class="mono" style="font-size:11px;color:var(--text-mute);margin-bottom:12px;">#${c.id} · ${d.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</p>
    <div class="trading-card ${c.rarity==='langka'?'rare':''}" style="width:100%;transform:none;margin-bottom:14px;">
      <div class="id">#${c.id.replace('MDX-','')}</div>
      <div class="rarity-tag">${c.rarity==='langka'?'LANGKA':'BIASA'}</div>
      <div class="photo" style="height:200px;"><img src="${c.photo}" alt="${escapeHtml(c.name)}"></div>
      <h4>${escapeHtml(c.name)}</h4>
      <div class="sub">${d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})} · ${locText}</div>
      <div class="tag-row"><span>${colorLabel}</span><span>${c.rarity==='langka'?'Langka':'Biasa'}</span><span>${c.verifiedByAI?'Terverifikasi AI':'Konfirmasi manual'}</span></div>
      <div class="quote">"${escapeHtml(c.quote)}"</div>
    </div>
    <div class="row gap-8" style="flex-wrap:wrap;">
      <span class="pill">${c.verifiedByAI?'AI':'Manual'}</span>
      <span class="pill">${colorLabel}</span>
      <span class="pill">${locText}</span>
    </div>
    <div class="row gap-8 mt-16">
      <button class="btn secondary block" id="detail-rename">Ganti nama</button>
      <button class="btn block danger" id="detail-delete" style="background:#a8462e;color:#fff;">Hapus</button>
    </div>`;
  openSheet(content);
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
   17. Init
   --------------------------------------------------------------------- */
(async function init(){
  currentCatsCache = await allCats();
  renderOnboard();
  if(player.onboarded){ go('home'); }
  else { go('onboarding'); }
  // preload model AI di latar belakang (non-blocking) setelah onboarding
  setTimeout(()=>{ loadModel().catch(()=>{}); }, 4000);
})();
