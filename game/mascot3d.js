/* =====================================================================
   Meongdex — game/mascot3d.js
   Si Oren versi 3D prosedural (Three.js, dibangun murni dari primitive
   geometry — tanpa file model eksternal, tanpa aset berbayar).

   Dipasang di layar onboarding, menggantikan SVG statis secara visual
   saat WebGL tersedia. SVG asli TIDAK dihapus dari DOM — dipakai sebagai
   fallback otomatis kalau WebGL/Three.js gagal dimuat, jadi onboarding
   tidak akan pernah rusak hanya karena render 3D gagal.

   Interaksi:
   - Seret (mouse/touch/pen via Pointer Events) untuk memutar Si Oren,
     dengan efek inersia halus setelah dilepas.
   - Ketuk singkat (tanpa menyeret) memicu reaksi: telinga tegak,
     ekor mengibas cepat, gelembung teks "Meong!", dan percikan kecil
     berwarna emas (menghubungkan ke identitas "kelangkaan" di Meongdex).
   - Idle: bernapas pelan, ekor bergoyang, telinga sesekali berkedut,
     mata berkedip acak, auto-putar pelan setelah beberapa detik tanpa
     sentuhan.
   - Menghormati prefers-reduced-motion: animasi idle otomatis dimatikan,
     interaksi manual (seret/ketuk) tetap berfungsi karena inisiatif
     pengguna sendiri.

   API publik:
     window.SiOrenMascot.enterOnboarding()  -> panggil saat layar
       onboarding menjadi aktif (lihat integrasi di app.js/go()).
     window.SiOrenMascot.leaveOnboarding()  -> panggil saat pindah dari
       layar onboarding, menjeda render loop agar hemat baterai.
   ===================================================================== */
(function () {
  'use strict';

  var HOST_ID = 'onboard-mascot';

  // Palet resmi Meongdex — samakan persis dengan custom property di style.css
  var COLOR = {
    body: 0xe8804c,
    bodyDeep: 0xc9652f,
    cream: 0xfff8ed,
    charcoal: 0x3a2e2a,
    gold: 0xd4af37,
    white: 0xffffff
  };

  var state = {
    ready: false,      // Three.js + WebGL tersedia
    mounted: false,    // scene sudah dibangun sekali
    active: false,     // rAF loop sedang berjalan
    failed: false,     // gagal total -> selalu pakai SVG
    dragging: false,
    lastPointer: null,
    pointerId: null,
    dragMoved: 0,
    velocityYaw: 0,
    idleTimer: 0,
    reactionUntil: 0,
    tailKick: 0
  };

  var hostEl, svgEl, canvasEl, bubbleEl;
  var renderer, scene, camera, rig, headGroup;
  var earL, earR, eyeL, eyeR, tailSegments = [];
  var clock;
  var ro = null;
  var rafId = null;

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function webglAvailable() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) {
      return false;
    }
  }

  /* -----------------------------------------------------------------
     1. Toon shading — gradient map 4 tingkat, dibuat lewat canvas kecil
        (tidak perlu file tekstur eksternal).
     ----------------------------------------------------------------- */
  function buildToonGradient() {
    var c = document.createElement('canvas');
    c.width = 4;
    c.height = 1;
    var ctx = c.getContext('2d');
    var shades = [72, 148, 205, 255];
    for (var i = 0; i < shades.length; i++) {
      var v = shades[i];
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      ctx.fillRect(i, 0, 1, 1);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if ('colorSpace' in tex && THREE.NoColorSpace) {
      tex.colorSpace = THREE.NoColorSpace;
    } else if ('encoding' in tex && THREE.LinearEncoding !== undefined) {
      tex.encoding = THREE.LinearEncoding;
    }
    return tex;
  }

  function toonMat(hex, gradientMap) {
    return new THREE.MeshToonMaterial({ color: hex, gradientMap: gradientMap });
  }

  /* -----------------------------------------------------------------
     2. Bayangan kontak (canvas radial gradient -> tekstur -> lingkaran
        datar), meniru <ellipse> bayangan pada SVG asli.
     ----------------------------------------------------------------- */
  function buildContactShadow() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var ctx = c.getContext('2d');
    var grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(58,46,42,0.32)');
    grad.addColorStop(1, 'rgba(58,46,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    var mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.004;
    return mesh;
  }

  /* -----------------------------------------------------------------
     3. Bangun model Si Oren dari primitive.
        Catatan desain: telinga & hidung sengaja dibuat dari kerucut
        bersisi TIGA (radialSegments=3) supaya siluetnya tetap terasa
        seperti segitiga pipih pada logo/SVG asli -- badan & kepala tetap
        memakai bola supaya terasa empuk. Perpaduan segitiga tajam +
        bola lembut ini jadi "bahasa bentuk" konsisten dari versi 2D ke 3D.
     ----------------------------------------------------------------- */
  function buildCat(gradientMap) {
    var rigGroup = new THREE.Group();

    rigGroup.add(buildContactShadow());

    // -- badan: bola dipepatkan, gaya duduk --
    var body = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 24, 18),
      toonMat(COLOR.body, gradientMap)
    );
    body.scale.set(1, 0.8, 1.05);
    body.position.y = 0.62;
    rigGroup.add(body);

    // -- dada/perut krem, tempelan bawah depan --
    var chest = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 20, 16),
      toonMat(COLOR.cream, gradientMap)
    );
    chest.scale.set(1, 1.05, 0.5);
    chest.position.set(0, 0.48, 0.48);
    rigGroup.add(chest);

    // -- kaki depan kecil (sentuhan pose duduk) --
    [-0.23, 0.23].forEach(function (x) {
      var paw = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 12),
        toonMat(COLOR.body, gradientMap)
      );
      paw.scale.set(1, 0.65, 1.05);
      paw.position.set(x, 0.1, 0.46);
      rigGroup.add(paw);
    });

    // -- kepala (grup terpisah supaya bisa dianimasikan sendiri) --
    headGroup = new THREE.Group();
    headGroup.position.set(0, 1.22, 0.1);
    rigGroup.add(headGroup);

    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 24, 18),
      toonMat(COLOR.body, gradientMap)
    );
    head.scale.set(1, 0.9, 0.94);
    headGroup.add(head);

    var muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 14),
      toonMat(COLOR.cream, gradientMap)
    );
    muzzle.scale.set(1.05, 0.78, 0.72);
    muzzle.position.set(0, -0.1, 0.33);
    headGroup.add(muzzle);

    var nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.045, 3),
      toonMat(COLOR.charcoal, gradientMap)
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.02, 0.57);
    headGroup.add(nose);

    // -- mata: bola gelap + kilau putih kecil --
    function buildEye(x) {
      var g = new THREE.Group();
      var iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 14, 12),
        new THREE.MeshToonMaterial({ color: COLOR.charcoal, gradientMap: gradientMap })
      );
      g.add(iris);
      var shine = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 8, 8),
        new THREE.MeshBasicMaterial({ color: COLOR.white })
      );
      shine.position.set(x > 0 ? -0.028 : 0.028, 0.028, 0.055);
      g.add(shine);
      g.position.set(x, 0.05, 0.4);
      return g;
    }
    eyeL = buildEye(-0.16);
    eyeR = buildEye(0.16);
    headGroup.add(eyeL, eyeR);

    // -- telinga: kerucut dua-lapis (luar oren, dalam oren tua) --
    function buildEar(x) {
      var g = new THREE.Group();
      var outer = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.32, 3),
        toonMat(COLOR.body, gradientMap)
      );
      outer.rotation.y = Math.PI / 6;
      g.add(outer);
      var inner = new THREE.Mesh(
        new THREE.ConeGeometry(0.095, 0.19, 3),
        toonMat(COLOR.bodyDeep, gradientMap)
      );
      inner.rotation.y = Math.PI / 6;
      inner.position.set(0, -0.02, 0.045);
      g.add(inner);
      g.position.set(x, 0.38, -0.02);
      g.rotation.z = x > 0 ? -0.32 : 0.32;
      g.rotation.x = -0.12;
      return g;
    }
    earL = buildEar(-0.28);
    earR = buildEar(0.28);
    headGroup.add(earL, earR);

    // -- kumis: garis tipis transparan --
    function buildWhiskers(side) {
      var mat = new THREE.LineBasicMaterial({
        color: COLOR.charcoal, transparent: true, opacity: 0.45
      });
      [-0.045, 0, 0.045].forEach(function (yOff, i) {
        var pts = [
          new THREE.Vector3(side * 0.16, yOff, 0.46),
          new THREE.Vector3(side * (0.46 + i * 0.03), 0.02 + yOff, 0.36 - i * 0.04)
        ];
        var geo = new THREE.BufferGeometry().setFromPoints(pts);
        headGroup.add(new THREE.Line(geo, mat));
      });
    }
    buildWhiskers(-1);
    buildWhiskers(1);

    // -- ekor: rantai 5 segmen supaya bisa "digelombangkan" seperti asli --
    var tailRoot = new THREE.Group();
    tailRoot.position.set(-0.02, 0.5, -0.52);
    tailRoot.rotation.x = -0.55;
    rigGroup.add(tailRoot);

    var parent = tailRoot;
    var prevLen = 0;
    var segCount = 5;
    for (var i = 0; i < segCount; i++) {
      var len = 0.22 - i * 0.018;
      var rad = 0.085 - i * 0.011;
      var segGroup = new THREE.Group();
      segGroup.position.y = prevLen;
      var segMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(rad * 0.75, 0.01), rad, len, 10),
        toonMat(i === segCount - 1 ? COLOR.bodyDeep : COLOR.body, gradientMap)
      );
      segMesh.position.y = len / 2;
      segGroup.add(segMesh);
      parent.add(segGroup);
      tailSegments.push(segGroup);
      parent = segGroup;
      prevLen = len;
    }

    rigGroup.userData.body = body;
    return rigGroup;
  }

  /* -----------------------------------------------------------------
     4. Scene, kamera, lighting
     ----------------------------------------------------------------- */
  function buildScene() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 1.15, 3.2);
    camera.lookAt(0, 0.85, 0);

    var hemi = new THREE.HemisphereLight(0xfff3e0, 0x5c4b44, 0.95);
    scene.add(hemi);

    var key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(2.2, 3, 2.4);
    scene.add(key);

    var fill = new THREE.DirectionalLight(0xffd9b8, 0.35);
    fill.position.set(-2.4, 1.2, -1.6);
    scene.add(fill);

    var gradientMap = buildToonGradient();
    rig = buildCat(gradientMap);
    scene.add(rig);
  }

  function buildRenderer() {
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'mascot3d-canvas';
    canvasEl.setAttribute('aria-hidden', 'true');
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl, alpha: true, antialias: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
  }

  function resize() {
    if (!hostEl || !renderer || !camera) return;
    var w = hostEl.clientWidth || 200;
    var h = hostEl.clientHeight || 200;
    if (w < 10 || h < 10) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* -----------------------------------------------------------------
     5. Reaksi ketuk: gelembung teks + percikan emas kecil
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
      var mat = new THREE.MeshBasicMaterial({
        color: COLOR.gold, transparent: true, opacity: 1
      });
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat);
      var angle = (i / count) * Math.PI * 2;
      dot.position.set(0, 1.35, 0.15);
      dot.userData.vel = new THREE.Vector3(
        Math.cos(angle) * 0.9, 1.1 + Math.random() * 0.4, Math.sin(angle) * 0.9
      );
      dot.userData.born = clock.getElapsedTime();
      rig.add(dot);
      state.sparkles = state.sparkles || [];
      state.sparkles.push(dot);
    }
  }

  function triggerReaction() {
    var now = clock.getElapsedTime();
    state.reactionUntil = now + 1.15;
    state.tailKick = 1;
    var b = ensureBubble();
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    spawnSparkles();
    if (navigator.vibrate) navigator.vibrate(10);
  }

  /* -----------------------------------------------------------------
     6. Interaksi seret-untuk-memutar (Pointer Events, dengan inersia)
     ----------------------------------------------------------------- */
  function attachInteraction() {
    if (!window.PointerEvent) return; // tidak ada drag-orbit, kucing tetap tampil & idle saja
    canvasEl.style.touchAction = 'none';
    canvasEl.style.cursor = 'grab';

    canvasEl.addEventListener('pointerdown', function (e) {
      state.dragging = true;
      state.dragMoved = 0;
      state.pointerId = e.pointerId;
      state.lastPointer = { x: e.clientX, y: e.clientY };
      state.velocityYaw = 0;
      canvasEl.setPointerCapture(e.pointerId);
      canvasEl.style.cursor = 'grabbing';
    });

    canvasEl.addEventListener('pointermove', function (e) {
      if (!state.dragging || e.pointerId !== state.pointerId) return;
      var dx = e.clientX - state.lastPointer.x;
      var dy = e.clientY - state.lastPointer.y;
      state.dragMoved += Math.abs(dx) + Math.abs(dy);
      var yawDelta = dx * 0.008;
      rig.rotation.y += yawDelta;
      rig.rotation.x = Math.max(-0.32, Math.min(0.32, rig.rotation.x + dy * 0.004));
      state.velocityYaw = yawDelta;
      state.lastPointer = { x: e.clientX, y: e.clientY };
      state.idleTimer = 0;
    });

    function endDrag(e) {
      if (!state.dragging || e.pointerId !== state.pointerId) return;
      state.dragging = false;
      canvasEl.style.cursor = 'grab';
      if (state.dragMoved < 6) {
        triggerReaction();
      }
    }
    canvasEl.addEventListener('pointerup', endDrag);
    canvasEl.addEventListener('pointercancel', endDrag);
  }

  /* -----------------------------------------------------------------
     7. Loop animasi
     ----------------------------------------------------------------- */
  var blinkAt = 0, earTwitchAt = 0, earTwitchSide = 0;

  function scheduleNextBlink(t) { blinkAt = t + 3.5 + Math.random() * 2.5; }
  function scheduleNextEarTwitch(t) {
    earTwitchAt = t + 3 + Math.random() * 4;
    earTwitchSide = Math.random() < 0.5 ? -1 : 1;
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    var t = clock.getElapsedTime();
    var dt = clock.getDelta();
    var motionOn = !reduceMotion();

    if (motionOn) {
      // napas
      var body = rig.userData.body;
      var breathe = 1 + Math.sin(t * 1.6) * 0.018;
      body.scale.y = 0.8 * breathe;

      // goyang kepala idle
      headGroup.rotation.z = Math.sin(t * 0.6) * 0.035;
      headGroup.rotation.x = Math.sin(t * 0.5 + 1.2) * 0.02;

      // ekor bergoyang, amplitudo makin besar ke ujung
      for (var i = 0; i < tailSegments.length; i++) {
        var amp = 0.16 * (0.55 + i * 0.16) * (1 + state.tailKick * 1.8);
        tailSegments[i].rotation.y = Math.sin(t * (1.8 + state.tailKick * 2.5) - i * 0.55) * amp;
      }

      // kedip mata
      if (t > blinkAt) {
        var blinkPhase = (t - blinkAt) / 0.14;
        if (blinkPhase < 1) {
          var s = blinkPhase < 0.5 ? 1 - blinkPhase * 2 : (blinkPhase - 0.5) * 2;
          eyeL.scale.y = Math.max(0.08, s);
          eyeR.scale.y = Math.max(0.08, s);
        } else {
          eyeL.scale.y = 1; eyeR.scale.y = 1;
          scheduleNextBlink(t);
        }
      }

      // kedut telinga sesekali
      if (t > earTwitchAt) {
        var twitchPhase = (t - earTwitchAt) / 0.3;
        var ear = earTwitchSide < 0 ? earL : earR;
        if (twitchPhase < 1) {
          ear.rotation.z = (earTwitchSide < 0 ? 0.32 : -0.32) + Math.sin(twitchPhase * Math.PI) * 0.18 * earTwitchSide;
        } else {
          ear.rotation.z = earTwitchSide < 0 ? 0.32 : -0.32;
          scheduleNextEarTwitch(t);
        }
      }

      // reaksi ketuk: telinga tegak sementara
      if (t < state.reactionUntil) {
        earL.rotation.x = -0.32;
        earR.rotation.x = -0.32;
      } else {
        earL.rotation.x += (-0.12 - earL.rotation.x) * 0.1;
        earR.rotation.x += (-0.12 - earR.rotation.x) * 0.1;
        state.tailKick += (0 - state.tailKick) * 0.04;
      }

      // percikan emas: naik lalu memudar
      if (state.sparkles && state.sparkles.length) {
        for (var k = state.sparkles.length - 1; k >= 0; k--) {
          var sp = state.sparkles[k];
          var age = t - sp.userData.born;
          if (age > 0.9) {
            rig.remove(sp);
            sp.geometry.dispose();
            sp.material.dispose();
            state.sparkles.splice(k, 1);
            continue;
          }
          sp.position.addScaledVector(sp.userData.vel, dt);
          sp.userData.vel.y -= dt * 1.4;
          sp.material.opacity = 1 - age / 0.9;
          sp.scale.setScalar(1 - age / 0.9 * 0.4);
        }
      }
    }

    // seret + inersia + auto-putar idle
    if (!state.dragging) {
      if (Math.abs(state.velocityYaw) > 0.0002) {
        rig.rotation.y += state.velocityYaw;
        state.velocityYaw *= 0.92;
      } else {
        state.idleTimer += dt;
        if (motionOn && state.idleTimer > 4) {
          rig.rotation.y += dt * 0.12;
        }
      }
      rig.rotation.x += (0 - rig.rotation.x) * 0.02;
    }

    // kepala sedikit "menahan" arah saat badan berputar cepat (bobot lebih hidup)
    if (headGroup) {
      var counter = -rig.rotation.y * 0.1;
      headGroup.rotation.y += (counter - headGroup.rotation.y) * 0.08;
    }

    renderer.render(scene, camera);
  }

  /* -----------------------------------------------------------------
     8. Mount / lifecycle publik
     ----------------------------------------------------------------- */
  function tryInit() {
    if (state.failed || state.ready) return state.ready;
    if (typeof THREE === 'undefined' || !webglAvailable()) {
      state.failed = true;
      return false;
    }
    try {
      hostEl = document.getElementById(HOST_ID);
      if (!hostEl) { state.failed = true; return false; }
      svgEl = hostEl.querySelector('svg');
      clock = new THREE.Clock();
      buildRenderer();
      buildScene();
      hostEl.appendChild(canvasEl);
      attachInteraction();
      scheduleNextBlink(0);
      scheduleNextEarTwitch(0);
      if (window.ResizeObserver) {
        ro = new ResizeObserver(resize);
        ro.observe(hostEl);
      } else {
        window.addEventListener('resize', resize);
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pauseLoop();
        else if (state.mounted && hostEl.closest('.screen.active')) resumeLoop();
      });
      state.ready = true;
      state.mounted = true;
      return true;
    } catch (err) {
      state.failed = true;
      if (canvasEl && canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl);
      return false;
    }
  }

  function pauseLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    state.active = false;
  }

  function resumeLoop() {
    if (!state.ready || state.active) return;
    state.active = true;
    resize();
    animate();
  }

  function enterOnboarding() {
    var okay = tryInit();
    if (!okay) return; // tetap tampilkan SVG asli, tidak melakukan apa-apa
    if (svgEl) svgEl.style.display = 'none';
    canvasEl.style.display = 'block';
    resumeLoop();
  }

  function leaveOnboarding() {
    pauseLoop();
  }

  window.SiOrenMascot = {
    enterOnboarding: enterOnboarding,
    leaveOnboarding: leaveOnboarding
  };
})();
