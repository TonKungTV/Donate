// scene.js - พื้นหลัง three.js แบบมินิมอลสำหรับหน้าบริจาค
//  * ฟิลด์อนุภาคนีออนลอย/หมุนช้าๆ + parallax ตามเมาส์/นิ้ว
//  * คลิก/แตะ -> ระเบิดอนุภาค + วงริปเปิลตรงจุดนั้น
//  * เคารพ prefers-reduced-motion / ไม่มี WebGL -> ข้าม 3D (ใช้พื้น CSS เดิม)
//  three โหลดผ่าน import map ใน index.html
import * as THREE from 'three';

(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  // เคารพ prefers-reduced-motion: ปิด 3D ทั้งหมด
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { canvas.style.display = 'none'; return; }

  // พาเลตต์นีออน (ตรงกับ site.css)
  const PALETTE = [0xb14dff, 0x2ce8f5, 0xff3ca6, 0xffc24b];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    if (!renderer.getContext()) throw new Error('no webgl context');
  } catch (e) {
    canvas.style.display = 'none';
    return; // ไม่มี WebGL -> ปล่อยพื้นหลัง CSS
  }
  renderer.setClearColor(0x000000, 0); // โปร่งใส ให้พื้น body โชว์
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 32);
  camera.lookAt(0, 0, 0);

  const dotTexture = makeDotTexture();
  const c = new THREE.Color();

  // ---------- สนามอนุภาคหลัก ----------
  const FIELD_COUNT = 320;
  const fieldGeo = new THREE.BufferGeometry();
  const fPos = new Float32Array(FIELD_COUNT * 3);
  const fCol = new Float32Array(FIELD_COUNT * 3);
  for (let i = 0; i < FIELD_COUNT; i++) {
    fPos[i * 3 + 0] = (Math.random() - 0.5) * 90;
    fPos[i * 3 + 1] = (Math.random() - 0.5) * 55;
    fPos[i * 3 + 2] = (Math.random() - 0.5) * 50 - 10;
    c.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]);
    fCol[i * 3 + 0] = c.r; fCol[i * 3 + 1] = c.g; fCol[i * 3 + 2] = c.b;
  }
  fieldGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fieldGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const fieldMat = new THREE.PointsMaterial({
    size: 0.9, sizeAttenuation: true, vertexColors: true, map: dotTexture,
    transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const field = new THREE.Points(fieldGeo, fieldMat);
  scene.add(field);

  // ---------- พูลอนุภาคระเบิด (burst) ----------
  const BURST_MAX = 360;
  const PER_BURST = 28;
  const burstGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(BURST_MAX * 3);
  const bCol = new Float32Array(BURST_MAX * 3);
  burstGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  burstGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const burstMat = new THREE.PointsMaterial({
    size: 1.4, sizeAttenuation: true, vertexColors: true, map: dotTexture,
    transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(burstGeo, burstMat));
  const slots = new Array(BURST_MAX);
  for (let i = 0; i < BURST_MAX; i++) slots[i] = { active: false, vx: 0, vy: 0, vz: 0, life: 0, r: 0, g: 0, b: 0 };
  let nextSlot = 0;

  // ---------- พูลวงริปเปิล ----------
  const RING_POOL = 6;
  const rings = [];
  {
    const seg = 48;
    const rp = new Float32Array((seg + 1) * 3);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      rp[i * 3 + 0] = Math.cos(a); rp[i * 3 + 1] = Math.sin(a); rp[i * 3 + 2] = 0;
    }
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    for (let i = 0; i < RING_POOL; i++) {
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const loop = new THREE.LineLoop(ringGeo, mat);
      loop.visible = false;
      scene.add(loop);
      rings.push({ loop, mat, life: 0 });
    }
  }
  let nextRing = 0;

  // ---------- pointer ----------
  const pointer = new THREE.Vector2(0, 0); // NDC -1..1
  const parallax = { x: 0, y: 0 };
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0
  const hit = new THREE.Vector3();

  function setPointer(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    parallax.x = pointer.x;
    parallax.y = pointer.y;
  }
  function worldAtPointer() {
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(plane, hit); // hit หรือ null
  }
  function spawnBurst() {
    const o = worldAtPointer();
    if (!o) return;
    for (let k = 0; k < PER_BURST; k++) {
      const idx = nextSlot; nextSlot = (nextSlot + 1) % BURST_MAX;
      const s = slots[idx];
      const ang = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.5) * Math.PI;
      const spd = 6 + Math.random() * 10;
      s.active = true; s.life = 1;
      s.vx = Math.cos(ang) * Math.cos(elev) * spd;
      s.vy = Math.sin(elev) * spd;
      s.vz = Math.sin(ang) * Math.cos(elev) * spd * 0.5;
      bPos[idx * 3 + 0] = o.x; bPos[idx * 3 + 1] = o.y; bPos[idx * 3 + 2] = o.z;
      c.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]);
      s.r = c.r; s.g = c.g; s.b = c.b;
      bCol[idx * 3 + 0] = c.r; bCol[idx * 3 + 1] = c.g; bCol[idx * 3 + 2] = c.b;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstGeo.attributes.color.needsUpdate = true;
    const rg = rings[nextRing]; nextRing = (nextRing + 1) % RING_POOL;
    rg.loop.position.copy(o);
    rg.loop.scale.setScalar(0.1);
    c.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]);
    rg.mat.color.copy(c);
    rg.mat.opacity = 0.9;
    rg.life = 1;
    rg.loop.visible = true;
  }

  // ---------- events ----------
  window.addEventListener('pointermove', setPointer, { passive: true });
  window.addEventListener('pointerdown', (e) => { setPointer(e); spawnBurst(); }, { passive: true });
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------- loop ----------
  const clock = new THREE.Clock();
  let rafId = null;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    field.rotation.y += dt * 0.04;
    field.rotation.x += dt * 0.015;
    camera.position.x += (parallax.x * 4 - camera.position.x) * 0.04;
    camera.position.y += (parallax.y * 3 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    let touched = false;
    for (let i = 0; i < BURST_MAX; i++) {
      const s = slots[i];
      if (!s.active) continue;
      touched = true;
      s.life -= dt / 1.1;
      if (s.life <= 0) {
        s.active = false;
        bCol[i * 3 + 0] = 0; bCol[i * 3 + 1] = 0; bCol[i * 3 + 2] = 0;
        continue;
      }
      s.vx *= 0.96; s.vy = s.vy * 0.96 - dt * 2.2; s.vz *= 0.96;
      bPos[i * 3 + 0] += s.vx * dt;
      bPos[i * 3 + 1] += s.vy * dt;
      bPos[i * 3 + 2] += s.vz * dt;
      const f = s.life;
      bCol[i * 3 + 0] = s.r * f; bCol[i * 3 + 1] = s.g * f; bCol[i * 3 + 2] = s.b * f;
    }
    if (touched) {
      burstGeo.attributes.position.needsUpdate = true;
      burstGeo.attributes.color.needsUpdate = true;
    }

    for (let i = 0; i < RING_POOL; i++) {
      const rg = rings[i];
      if (rg.life <= 0) continue;
      rg.life -= dt / 0.8;
      if (rg.life <= 0) { rg.loop.visible = false; rg.mat.opacity = 0; continue; }
      rg.loop.scale.setScalar((1 - rg.life) * 10 + 0.1);
      rg.mat.opacity = rg.life * 0.9;
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  function start() { if (rafId == null) { clock.getDelta(); rafId = requestAnimationFrame(frame); } }
  function stop() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }
  start();

  // ---------- helper: texture จุดกลมเรืองแสง ----------
  function makeDotTexture() {
    const s = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  }
})();
