/* =====================================================================
   Meongdex — game/mascot3d.js
   Si Oren versi 2D sprite animation (chibi, AI-generated).

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
     window.SiOrenMascot.showPoseAt(hostElementId, poseKey, options)
       -> tampilkan pose tertentu di elemen host manapun.
     window.SiOrenMascot.playStandTransition(hostElementId, options)
       -> putar flipbook transisi duduk->berdiri.
   ===================================================================== */
(function () {
  'use strict';

  var HOST_ID = 'onboard-mascot';
  var FRAMES_DIR = 'assets/mascot/frames/';

  // Peta semua frame yang diketahui (8 lama + 13 baru).
  // Frame baru MUNGKIN belum ada di repo -- kode HARUS defensif:
  // kalau file gagal dimuat, pose dilewati tanpa error.
  var FRAMES = {
    // 8 pose dasar (sudah ada)
    idle:      FRAMES_DIR + 'si-oren-idle.png',
    blink:     FRAMES_DIR + 'si-oren-blink.png',
    happy:     FRAMES_DIR + 'si-oren-happy.png',
    eartwitch: FRAMES_DIR + 'si-oren-eartwitch.png',
    tailwag:   FRAMES_DIR + 'si-oren-tailwag.png',
    curious:   FRAMES_DIR + 'si-oren-curious.png',
    sleepy:    FRAMES_DIR + 'si-oren-sleepy.png',
    excited:   FRAMES_DIR + 'si-oren-excited.png',
    // 13 pose baru (mungkin belum ada -- defensif)
    wave:      FRAMES_DIR + 'si-oren-wave.png',
    point:     FRAMES_DIR + 'si-oren-point.png',
    celebrate: FRAMES_DIR + 'si-oren-celebrate.png',
    sad:       FRAMES_DIR + 'si-oren-sad.png',
    think:     FRAMES_DIR + 'si-oren-think.png',
    gift:      FRAMES_DIR + 'si-oren-gift.png',
    cheer:     FRAMES_DIR + 'si-oren-cheer.png',
    stand:     FRAMES_DIR + 'si-oren-stand.png',
    'stand-transition-1': FRAMES_DIR + 'si-oren-stand-transition-1.png',
    'stand-transition-2': FRAMES_DIR + 'si-oren-stand-transition-2.png',
    'stand-transition-3': FRAMES_DIR + 'si-oren-stand-transition-3.png',
    'stand-transition-4': FRAMES_DIR + 'si-oren-stand-transition-4.png',
    'stand-transition-5': FRAMES_DIR + 'si-oren-stand-transition-5.png'
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

  // Transisi duduk->berdiri (5 frame + stand = 6 total)
  var STAND_TRANSITION = [
    'stand-transition-1',
    'stand-transition-2',
    'stand-transition-3',
    'stand-transition-4',
    'stand-transition-5',
    'stand'
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
    autoRotateY: 0,
    firstVisit: true,
    waveDone: false
  };

  var hostEl, svgEl, imgEl, bubbleEl;
  var rafId = null;
  var lastTime = 0;

  // Cache untuk frame yang sudah berhasil dimuat (key -> true/false)
  var frameCache = {};

  // Registry untuk elemen host showPoseAt (hostId -> { img, timer, hostEl })
  var poseHosts = {};

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* -----------------------------------------------------------------
     1. Preload frame (defensif: skip yang gagal).
     ----------------------------------------------------------------- */
  function preloadFrames(callback) {
    var keys = Object.keys(FRAMES);
    var loaded = 0;
    var failed = 0;
    keys.forEach(function (key) {
      var img = new Image();
      img.onload = function () {
        frameCache[key] = true;
        loaded++;
        if (loaded + failed === keys.length) {
          callback(loaded > 0);
        }
      };
      img.onerror = function () {
        frameCache[key] = false;
        failed++;
        if (loaded + failed === keys.length) {
          callback(loaded > 0);
        }
      };
      img.src = FRAMES[key];
    });
  }

  // Preload satu frame tertentu, return Promise<boolean>
  function preloadOne(key) {
    if (frameCache[key] === true) return Promise.resolve(true);
    if (frameCache[key] === false) return Promise.resolve(false);
    if (!FRAMES[key]) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { frameCache[key] = true; resolve(true); };
      img.onerror = function () { frameCache[key] = false; resolve(false); };
      img.src = FRAMES[key];
    });
  }

  /* -----------------------------------------------------------------
     2. Setup DOM untuk onboarding mascot.
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
    if (!FRAMES[name] || frameCache[name] === false) return; // defensif: skip yang tidak ada
    state.currentFrame = name;
    if (imgEl) {
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
     5. Loop animasi (RAF) untuk onboarding.
     ----------------------------------------------------------------- */
  function animate(time) {
    rafId = requestAnimationFrame(animate);
    var dt = lastTime ? (time - lastTime) : 16;
    lastTime = time;
    var motionOn = !reduceMotion();

    if (state.reactionUntil > 0) {
      if (time >= state.reactionUntil) {
        state.reactionUntil = 0;
        setFrame('idle');
        state.seqIndex = 0;
        state.seqTimer = 0;
      }
    } else if (state.waveActive) {
      // Wave pose sedang berlangsung, jangan ganggu idle loop
    } else if (motionOn && !state.dragging) {
      state.seqTimer += dt;
      var seq = IDLE_SEQUENCE[state.seqIndex];
      if (seq && state.seqTimer >= seq[1]) {
        state.seqIndex = (state.seqIndex + 1) % IDLE_SEQUENCE.length;
        state.seqTimer = 0;
        var next = IDLE_SEQUENCE[state.seqIndex];
        if (next) setFrame(next[0]);
      }
      state.idleTimer += dt;
      if (state.idleTimer > 3000 && Math.abs(state.autoRotateY) > 0.1) {
        state.autoRotateY += (0 - state.autoRotateY) * 0.02;
      }
    }

    if (!state.dragging) {
      if (Math.abs(state.velocityYaw) > 0.1) {
        state.autoRotateY += state.velocityYaw * 0.1;
        state.autoRotateY = Math.max(-25, Math.min(25, state.autoRotateY));
        state.velocityYaw *= 0.9;
      }
    }

    if (imgEl) {
      imgEl.style.transform = 'perspective(400px) rotateY(' + state.autoRotateY + 'deg)';
    }
  }

  /* -----------------------------------------------------------------
     6. Lifecycle onboarding.
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
      preloadFrames(function (ok) {
        if (!ok) { state.failed = true; return; }
        if (tryInit()) {
          showSprite();
          startOnboardingSequence();
        }
      });
      return;
    }
    showSprite();
    startOnboardingSequence();
  }

  // Urutan pembuka onboarding: wave (khusus kunjungan pertama) lalu idle loop
  function startOnboardingSequence() {
    if (state.firstVisit && !state.waveDone && !reduceMotion()) {
      // Coba tampilkan pose wave dulu
      state.waveActive = true;
      preloadOne('wave').then(function (ok) {
        if (ok && imgEl) {
          setFrame('wave');
          resumeLoop();
          setTimeout(function () {
            state.waveActive = false;
            state.waveDone = true;
            setFrame('idle');
            state.seqIndex = 0;
            state.seqTimer = 0;
          }, 1500);
        } else {
          // wave tidak ada, langsung idle
          state.waveActive = false;
          state.waveDone = true;
          setFrame('idle');
          resumeLoop();
        }
      });
    } else {
      // Bukan kunjungan pertama atau reduced-motion: langsung idle
      state.waveDone = true;
      setFrame('idle');
      resumeLoop();
    }
  }

  function leaveOnboarding() {
    pauseLoop();
    state.waveActive = false;
    if (imgEl) imgEl.style.display = 'none';
    if (svgEl) svgEl.style.display = '';
  }

  /* -----------------------------------------------------------------
     7. showPoseAt — tampilkan pose di elemen host manapun.
     ----------------------------------------------------------------- */
  function showPoseAt(hostElementId, poseKey, options) {
    options = options || {};
    var holdMs = options.holdMs || 1500;
    var thenReturnTo = options.hasOwnProperty('thenReturnTo') ? options.thenReturnTo : null;
    var onDone = options.onDone || null;

    if (!hostElementId || !poseKey) return;
    if (!FRAMES[poseKey]) return; // key tidak dikenal

    var host = document.getElementById(hostElementId);
    if (!host) return; // host element tidak ada

    // Ambil atau buat registry entry untuk host ini
    var entry = poseHosts[hostElementId];
    if (!entry) {
      entry = { img: null, timer: null, hostEl: host };
      poseHosts[hostElementId] = entry;
    }

    // Clear timer sebelumnya kalau ada
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }

    // Preload pose yang diminta
    preloadOne(poseKey).then(function (ok) {
      if (!ok) {
        // File tidak ada -- skip tanpa error
        if (onDone) onDone();
        return;
      }

      // Buat atau reuse <img> di host element
      if (!entry.img) {
        entry.img = document.createElement('img');
        entry.img.draggable = false;
        entry.img.style.cssText = 'width:100%;height:100%;object-fit:contain;' +
          'user-select:none;-webkit-user-drag:none;' +
          'filter:drop-shadow(0 4px 8px rgba(58,46,42,0.12));';
        host.appendChild(entry.img);
      }

      entry.img.src = FRAMES[poseKey];
      entry.img.style.display = 'block';

      // Set timer untuk holdMs
      entry.timer = setTimeout(function () {
        entry.timer = null;
        if (thenReturnTo) {
          // Kembali ke pose lain
          preloadOne(thenReturnTo).then(function (ok2) {
            if (ok2 && entry.img) {
              entry.img.src = FRAMES[thenReturnTo];
              // Tahan pose return sampai timer berikutnya (opsional)
            } else {
              // Pose return tidak ada, sembunyikan
              if (entry.img) entry.img.style.display = 'none';
            }
          });
        } else {
          // Sembunyikan
          if (entry.img) entry.img.style.display = 'none';
        }
        if (onDone) onDone();
      }, holdMs);
    });
  }

  /* -----------------------------------------------------------------
     8. playStandTransition — flipbook duduk->berdiri.
     ----------------------------------------------------------------- */
  function playStandTransition(hostElementId, options) {
    options = options || {};
    var onDone = options.onDone || null;

    if (!hostElementId) return;
    var host = document.getElementById(hostElementId);
    if (!host) return;

    var motionOn = !reduceMotion();

    // Kalau reduced-motion, langsung tampilkan stand saja
    if (!motionOn) {
      preloadOne('stand').then(function (ok) {
        if (ok) {
          showPoseAt(hostElementId, 'stand', { holdMs: options.holdMs || 2000, thenReturnTo: null, onDone: onDone });
        } else {
          if (onDone) onDone();
        }
      });
      return;
    }

    // Preload semua frame transisi dulu
    var promises = STAND_TRANSITION.map(function (key) { return preloadOne(key); });
    Promise.all(promises).then(function (results) {
      // Ambil hanya frame yang berhasil dimuat
      var validFrames = [];
      for (var i = 0; i < STAND_TRANSITION.length; i++) {
        if (results[i]) validFrames.push(STAND_TRANSITION[i]);
      }
      if (validFrames.length === 0) {
        if (onDone) onDone();
        return;
      }

      // Ambil atau buat <img> di host
      var entry = poseHosts[hostElementId];
      if (!entry) {
        entry = { img: null, timer: null, hostEl: host };
        poseHosts[hostElementId] = entry;
      }
      if (!entry.img) {
        entry.img = document.createElement('img');
        entry.img.draggable = false;
        entry.img.style.cssText = 'width:100%;height:100%;object-fit:contain;' +
          'user-select:none;-webkit-user-drag:none;' +
          'filter:drop-shadow(0 4px 8px rgba(58,46,42,0.12));';
        host.appendChild(entry.img);
      }
      entry.img.style.display = 'block';

      // Putar flipbook: 100ms per frame, langsung ganti src
      var frameIdx = 0;
      function playNext() {
        if (frameIdx >= validFrames.length) {
          // Selesai, tahan pose terakhir (stand) selama holdMs
          if (options.holdMs) {
            entry.timer = setTimeout(function () {
              entry.timer = null;
              if (entry.img) entry.img.style.display = 'none';
              if (onDone) onDone();
            }, options.holdMs);
          } else {
            if (onDone) onDone();
          }
          return;
        }
        entry.img.src = FRAMES[validFrames[frameIdx]];
        frameIdx++;
        setTimeout(playNext, 100);
      }
      playNext();
    });
  }

  /* -----------------------------------------------------------------
     9. API publik.
     ----------------------------------------------------------------- */
  window.SiOrenMascot = {
    enterOnboarding: enterOnboarding,
    leaveOnboarding: leaveOnboarding,
    showPoseAt: showPoseAt,
    playStandTransition: playStandTransition
  };
})();
