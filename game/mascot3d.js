/* =====================================================================
   Meongdex — game/mascot3d.js
   Si Oren versi 2D sprite animation (8 frame chibi, AI-generated).

   Dipasang di layar onboarding, menggantikan SVG statis secara visual
   saat gambar frame berhasil dimuat. SVG asli TIDAK dihapus dari DOM --
   dipakai sebagai fallback otomatis kalau gambar gagal dimuat.

   Interaksi:
   - Seret (mouse/touch/pen via Pointer Events) untuk memutar Si Oren
     dengan efek inersia halus setelah dilepas (pseudo-3D tilt).
   - Ketuk singkat (tanpa menyeret) memicu reaksi: frame excited,
     gelembung teks "Meong!", dan percikan kecil berwarna emas.
   - Idle: animasi loop frame (idle -> blink -> idle -> eartwitch ->
     idle -> tailwag -> idle -> curious -> idle -> sleepy -> idle).
   - Menghormati prefers-reduced-motion: idle loop otomatis dimatikan,
     interaksi manual (seret/ketuk) tetap berfungsi.

   API publik:
     window.SiOrenMascot.enterOnboarding()  -> panggil saat layar
       onboarding menjadi aktif.
     window.SiOrenMascot.leaveOnboarding()  -> panggil saat pindah dari
       layar onboarding, menjeda animasi agar hemat baterai.
   ===================================================================== */
(function () {
  'use strict';

  var HOST_ID = 'onboard-mascot';
  var FRAMES_DIR = 'assets/mascot/frames/';
  var FRAMES = {
    idle:     FRAMES_DIR + 'si-oren-idle.png',
    blink:    FRAMES_DIR + 'si-oren-blink.png',
    happy:    FRAMES_DIR + 'si-oren-happy.png',
    eartwitch: FRAMES_DIR + 'si-oren-eartwitch.png',
    tailwag:  FRAMES_DIR + 'si-oren-tailwag.png',
    curious:  FRAMES_DIR + 'si-oren-curious.png',
    sleepy:   FRAMES_DIR + 'si-oren-sleepy.png',
    excited:  FRAMES_DIR + 'si-oren-excited.png'
  };

  // Idle sequence: frame, duration (ms)
  var IDLE_SEQUENCE = [
    ['idle', 2000],
    ['blink', 180],
    ['idle', 1500],
    ['eartwitch', 600],
    ['idle', 1200],
    ['tailwag', 800],
    ['idle', 1500],
    ['curious', 1000],
    ['idle', 2000],
    ['sleepy', 1500],
    ['idle', 1000]
  ];

  var state = {
    ready: false,
    active: false,
    failed: false,
    dragging: false,
    dragMoved: 0,
    pointerId: null,
    lastPointer: null,
    velocityYaw: 0,
    idleTimer: 0,
    seqIndex: 0,
    seqTimer: 0,
    reactionUntil: 0,
    currentFrame: 'idle',
    autoRotateY: 0
  };

  var hostEl, svgEl, imgEl, bubbleEl;
  var rafId = null;
  var lastTime = 0;

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* -----------------------------------------------------------------
     1. Preload semua frame, lalu tampilkan.
     ----------------------------------------------------------------- */
  function preloadFrames(callback) {
    var keys = Object.keys(FRAMES);
    var loaded = 0;
    var failed = 0;
    keys.forEach(function (key) {
      var img = new Image();
      img.onload = function () {
        loaded++;
        if (loaded + failed === keys.length) {
          callback(failed < keys.length);
        }
      };
      img.onerror = function () {
        failed++;
        if (loaded + failed === keys.length) {
          callback(loaded > 0);
        }
      };
      img.src = FRAMES[key];
    });
  }

  /* -----------------------------------------------------------------
     2. Setup DOM: buat <img> untuk sprite, sembunyikan SVG.
     ----------------------------------------------------------------- */
  function setupDOM() {
    hostEl = document.getElementById(HOST_ID);
    if (!hostEl) { state.failed = true; return false; }
    svgEl = hostEl.querySelector('svg');
    imgEl = document.createElement('img');
    imgEl.id = 'mascot-sprite';
    imgEl.alt = 'Maskot Si Oren';
    imgEl.draggable = false;
    imgEl.src = FRAMES.idle;
    imgEl.style.cssText = 'display:none;width:240px;height:240px;object-fit:contain;' +
      'touch-action:none;cursor:grab;user-select:none;-webkit-user-drag:none;' +
      'filter:drop-shadow(0 8px 16px rgba(58,46,42,0.18));';
    hostEl.appendChild(imgEl);
    return true;
  }

  function showSprite() {
    if (svgEl) svgEl.style.display = 'none';
    imgEl.style.display = 'block';
  }

  function setFrame(name) {
    if (state.currentFrame === name) return;
    state.currentFrame = name;
    if (imgEl && FRAMES[name]) {
      imgEl.src = FRAMES[name];
    }
  }

  /* -----------------------------------------------------------------
     3. Reaksi ketuk: gelembung teks + percikan emas (DOM particle).
     ----------------------------------------------------------------- */
  function ensureBubble() {
    if (bubbleEl) return bubbleEl;
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'mascot-bubble';
    bubbleEl.textContent = 'Meong!';
    hostEl.appendChild(bubbleEl);
    return bubbleEl;
  }

  function spawnSparkles() {
    var count = 7;
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('div');
      dot.className = 'mascot-sparkle';
      var angle = (i / count) * Math.PI * 2;
      var dx = Math.cos(angle) * 40 + (Math.random() - 0.5) * 20;
      var dy = -Math.sin(angle) * 30 - 20 - Math.random() * 20;
      dot.style.cssText = 'position:absolute;top:30%;left:50%;' +
        'width:8px;height:8px;border-radius:999px;background:#D4AF37;' +
        'pointer-events:none;z-index:10;opacity:1;' +
        'transition:transform 0.9s ease-out,opacity 0.9s ease-out;';
      hostEl.appendChild(dot);
      // trigger animation via RAF
      (function (d, x, y) {
        requestAnimationFrame(function () {
          d.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(0.3)';
          d.style.opacity = '0';
        });
        setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 950);
      })(dot, dx, dy);
    }
  }

  function triggerReaction() {
    var now = performance.now();
    state.reactionUntil = now + 1200;
    setFrame('excited');
    var b = ensureBubble();
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    spawnSparkles();
    if (navigator.vibrate) navigator.vibrate(10);
  }

  /* -----------------------------------------------------------------
     4. Interaksi seret-untuk-memutar (pseudo-3D tilt via CSS transform).
     ----------------------------------------------------------------- */
  function attachInteraction() {
    if (!window.PointerEvent) return;
    imgEl.style.touchAction = 'none';

    imgEl.addEventListener('pointerdown', function (e) {
      state.dragging = true;
      state.dragMoved = 0;
      state.pointerId = e.pointerId;
      state.lastPointer = { x: e.clientX, y: e.clientY };
      state.velocityYaw = 0;
      imgEl.style.cursor = 'grabbing';
      imgEl.setPointerCapture(e.pointerId);
    });

    imgEl.addEventListener('pointermove', function (e) {
      if (!state.dragging || e.pointerId !== state.pointerId) return;
      var dx = e.clientX - state.lastPointer.x;
      var dy = e.clientY - state.lastPointer.y;
      state.dragMoved += Math.abs(dx) + Math.abs(dy);
      state.velocityYaw = dx * 0.3;
      state.autoRotateY += dx * 0.3;
      state.autoRotateY = Math.max(-25, Math.min(25, state.autoRotateY));
      state.idleTimer = 0;
      state.lastPointer = { x: e.clientX, y: e.clientY };
    });

    function endDrag(e) {
      if (!state.dragging || e.pointerId !== state.pointerId) return;
      state.dragging = false;
      imgEl.style.cursor = 'grab';
      if (state.dragMoved < 6) {
        triggerReaction();
      }
    }
    imgEl.addEventListener('pointerup', endDrag);
    imgEl.addEventListener('pointercancel', endDrag);
  }

  /* -----------------------------------------------------------------
     5. Loop animasi (RAF).
     ----------------------------------------------------------------- */
  function animate(time) {
    rafId = requestAnimationFrame(animate);
    var dt = lastTime ? (time - lastTime) : 16;
    lastTime = time;
    var motionOn = !reduceMotion();

    // Reaction state (tap): tahan frame excited sampai reactionUntil
    if (state.reactionUntil > 0) {
      if (time < state.reactionUntil) {
        // tetap di frame excited
      } else {
        state.reactionUntil = 0;
        setFrame('idle');
        state.seqIndex = 0;
        state.seqTimer = 0;
      }
    } else if (motionOn && !state.dragging) {
      // Idle sequence playback
      state.seqTimer += dt;
      var seq = IDLE_SEQUENCE[state.seqIndex];
      if (seq && state.seqTimer >= seq[1]) {
        state.seqIndex = (state.seqIndex + 1) % IDLE_SEQUENCE.length;
        state.seqTimer = 0;
        var next = IDLE_SEQUENCE[state.seqIndex];
        if (next) setFrame(next[0]);
      }

      // Auto-rotate kembali ke center setelah idle
      state.idleTimer += dt;
      if (state.idleTimer > 3000 && Math.abs(state.autoRotateY) > 0.1) {
        state.autoRotateY += (0 - state.autoRotateY) * 0.02;
      }
    }

    // Inersia setelah drag
    if (!state.dragging) {
      if (Math.abs(state.velocityYaw) > 0.1) {
        state.autoRotateY += state.velocityYaw * 0.1;
        state.autoRotateY = Math.max(-25, Math.min(25, state.autoRotateY));
        state.velocityYaw *= 0.9;
      }
    }

    // Apply pseudo-3D tilt via CSS transform
    if (imgEl) {
      var rotY = state.autoRotateY;
      var scaleX = rotY > 0 ? 1 - Math.abs(rotY) * 0.005 : 1;
      var skewX = rotY * 0.1;
      imgEl.style.transform = 'perspective(400px) rotateY(' + rotY + 'deg)';
    }
  }

  /* -----------------------------------------------------------------
     6. Lifecycle publik.
     ----------------------------------------------------------------- */
  function tryInit() {
    if (state.failed || state.ready) return state.ready;
    if (!setupDOM()) return false;
    attachInteraction();
    state.ready = true;
    return true;
  }

  function pauseLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    state.active = false;
  }

  function resumeLoop() {
    if (!state.ready || state.active) return;
    state.active = true;
    lastTime = 0;
    animate(performance.now());
  }

  function enterOnboarding() {
    if (state.failed) return;
    if (!state.ready) {
      // Preload frames dulu, baru init
      preloadFrames(function (ok) {
        if (!ok) { state.failed = true; return; }
        if (tryInit()) {
          showSprite();
          resumeLoop();
        }
      });
      return;
    }
    showSprite();
    resumeLoop();
  }

  function leaveOnboarding() {
    pauseLoop();
    if (imgEl) imgEl.style.display = 'none';
    if (svgEl) svgEl.style.display = '';
  }

  window.SiOrenMascot = {
    enterOnboarding: enterOnboarding,
    leaveOnboarding: leaveOnboarding
  };
})();
