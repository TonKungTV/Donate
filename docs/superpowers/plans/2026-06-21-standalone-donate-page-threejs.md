# Standalone Donate Page + three.js Background — Implementation Plan

> **For the engineer/agent (Codex) picking this up:** You have zero prior context.
> Everything you need is in this file. Execute task-by-task, top to bottom.
> Steps use checkbox (`- [ ]`) syntax for tracking. This project is **not a git repo**
> (no `.git`), so the "commit" steps are optional — run them only if you `git init` first;
> otherwise just save files and move to the next task.

**Goal:** Turn the donor page (`public/index.html`) into a self-contained single page —
remove the internal navigation links + logo, add the channel header (TonKungTV + TikTok/YouTube),
and add a minimal, performant three.js floating-particle background that reacts to mouse move,
click, and mobile touch (parallax + tap-to-burst ripple).

**Architecture:** The page keeps its existing 3-step donate flow (`donate.js`, untouched).
A full-viewport `<canvas>` sits behind the content (`z-index:-1`, `pointer-events:none`) and
renders a three.js `Points` field. Pointer events are listened on `window` (not the canvas), so
the form stays fully interactive while the background reads pointer position for parallax and
spawns a particle burst + ripple ring at each click/tap. three.js loads from CDN via an import map.

**Tech Stack:** Vanilla JS (ES modules), three.js r0.160.0 (CDN), existing Express static server,
existing `site.css` design tokens (CSS custom properties).

## Global Constraints

- **Do NOT modify** `public/js/donate.js` (the donate flow logic) — it must keep working as-is.
- **Only `public/index.html`** loses its nav. Do **not** touch the nav on `leaderboard.html`,
  `dashboard.html`, or `control.html`.
- **Channel name:** `TonKungTV` (exact casing).
- **Social links (exact, open in new tab, `rel="noopener"`):**
  - YouTube: `https://www.youtube.com/@TonKungTV`
  - TikTok: `https://www.tiktok.com/@tonkungtv`
- **three.js version:** `0.160.0`, imported via import map specifier `three` →
  `https://unpkg.com/three@0.160.0/build/three.module.js` (core only; no addons needed).
- **Performance budget (hard requirements — the page was just optimized for lag, do not regress):**
  - Cap renderer pixel ratio at `Math.min(devicePixelRatio, 2)`.
  - Particle field count ≤ ~320; burst pool ≤ ~360; use `Points` + `AdditiveBlending`, **no shadows**.
  - Pause the render loop when the tab is hidden (`visibilitychange`).
  - If `prefers-reduced-motion: reduce` is set **or** WebGL is unavailable, **skip 3D entirely**
    (`canvas.style.display='none'`) and let the existing static CSS background show.
- **Reuse existing design tokens** from `site.css` (`--ultra #b14dff`, `--cyan #2ce8f5`,
  `--magenta #ff3ca6`, `--gold #ffc24b`, `--ink`, `--line`, `--glow-ultra`, fonts). The neon
  particle palette is `[0xb14dff, 0x2ce8f5, 0xff3ca6, 0xffc24b]`.
- **z-index layering** (already established): `body::before` aurora is `z-index:-2`; the new
  `#bg-canvas` must be `z-index:-1`; `.container` content is `z-index:1`.

---

## File Structure

- **Create** `public/js/scene.js` — the three.js background module (self-contained, ES module).
  Responsibility: render the particle field, handle pointer parallax, spawn click/tap bursts +
  ripples, and respect the performance budget. No dependencies on `donate.js`.
- **Create** `public/css/donate.css` — styles specific to the standalone donate page:
  the `#bg-canvas` positioning, the `.channel-head` header, and the `.socials` icon buttons.
  Loaded only by `index.html`, so it cannot affect other pages.
- **Modify** `public/index.html` — remove `<nav>`, add `.channel-head` header + socials,
  add `<canvas id="bg-canvas">`, link `donate.css`, add the three.js import map + module script.

---

## Task 1: Add the standalone-page styles (`donate.css`)

**Files:**
- Create: `public/css/donate.css`

**Interfaces:**
- Produces: CSS classes `.channel-head`, `.channel-name`, `.socials`, `.socials a`,
  `.socials a.yt`, `.socials a.tt`, and the `#bg-canvas` rule — all consumed by Task 3's HTML.
- Consumes: CSS custom properties already defined in `site.css` (`--font-display`, `--cyan`,
  `--ultra`, `--magenta`, `--ink`, `--line`, `--glow-ultra`).

- [ ] **Step 1: Create the file with the exact content below**

```css
/* ============================================================
   donate.css — เฉพาะหน้าบริจาคเดี่ยว (standalone)
   พื้นหลัง three.js + ส่วนหัวชื่อช่อง + ปุ่มโซเชียล
   (โหลดเฉพาะ index.html — ไม่กระทบหน้าอื่น)
   ============================================================ */

/* canvas พื้นหลัง 3D: อยู่เหนือ aurora (z=-2) แต่ใต้เนื้อหา (.container z=1) */
#bg-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  display: block;
  pointer-events: none;   /* ไม่บังการกด/พิมพ์ในฟอร์ม */
}

/* ---- ส่วนหัวช่อง (แทน nav เดิม) ---- */
.channel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 30px;
}
.channel-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(1.4rem, 4vw, 2rem);
  letter-spacing: 0.5px;
  background: linear-gradient(100deg, var(--cyan), var(--ultra) 45%, var(--magenta));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ---- ปุ่มโซเชียล ---- */
.socials { display: flex; gap: 10px; }
.socials a {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: var(--ink);
  background: rgba(150, 120, 255, 0.08);
  border: 1px solid var(--line);
  transition: transform 0.14s, background 0.16s, border-color 0.16s, box-shadow 0.16s;
}
.socials a:hover { transform: translateY(-2px); background: rgba(177, 77, 255, 0.16); border-color: var(--ultra); box-shadow: var(--glow-ultra); }
.socials a svg { width: 22px; height: 22px; display: block; fill: currentColor; }
.socials a.yt:hover { color: #ff4d4d; border-color: #ff4d4d; box-shadow: 0 0 18px rgba(255, 77, 77, 0.4); }
.socials a.tt:hover { color: var(--cyan); border-color: var(--cyan); box-shadow: var(--glow-cyan); }
```

- [ ] **Step 2: Verify the file saved** (no build step for CSS)

Run: `node -e "const s=require('fs').readFileSync('public/css/donate.css','utf8'); if(!s.includes('#bg-canvas')||!s.includes('.channel-head')) throw new Error('donate.css missing expected rules'); console.log('donate.css OK', s.length, 'bytes');"`
Expected: prints `donate.css OK <n> bytes` with no error.

- [ ] **Step 3 (optional): Commit**

```bash
git add public/css/donate.css
git commit -m "feat(donate): add standalone-page styles (canvas + channel header)"
```

---

## Task 2: Create the three.js background module (`scene.js`)

**Files:**
- Create: `public/js/scene.js`

**Interfaces:**
- Consumes: a DOM element `<canvas id="bg-canvas">` (added in Task 3); the `three` ES module
  specifier (resolved by the import map added in Task 3).
- Produces: no exports — it is a self-invoking module that wires itself to `#bg-canvas` and
  `window` pointer/resize/visibility events. Safe no-op if `#bg-canvas` is absent.

- [ ] **Step 1: Create the file with the exact content below**

```js
// scene.js — พื้นหลัง three.js แบบมินิมอลสำหรับหน้าบริจาค
//  • ฟิลด์อนุภาคนีออนลอย/หมุนช้าๆ + parallax ตามเมาส์/นิ้ว
//  • คลิก/แตะ -> ระเบิดอนุภาค + วงริปเปิลตรงจุดนั้น
//  • เคารพ prefers-reduced-motion / ไม่มี WebGL -> ข้าม 3D (ใช้พื้น CSS เดิม)
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
```

- [ ] **Step 2: Verify the file saved and is non-empty**

Run: `node -e "const s=require('fs').readFileSync('public/js/scene.js','utf8'); if(!s.includes(\"import * as THREE\")||!s.includes('spawnBurst')) throw new Error('scene.js missing expected code'); console.log('scene.js OK', s.length, 'bytes');"`
Expected: prints `scene.js OK <n> bytes`.

> Note: do **not** run `node --check public/js/scene.js`. `package.json` has `"type":"commonjs"`,
> so Node parses `.js` as CommonJS and the ESM `import` line will report a false syntax error.
> This module is browser-only (loaded as `<script type="module">`); it is verified in the browser
> in Task 4.

- [ ] **Step 3 (optional): Commit**

```bash
git add public/js/scene.js
git commit -m "feat(donate): add minimal three.js particle background with click bursts"
```

---

## Task 3: Rewrite `index.html` (remove nav, add header + canvas + scripts)

**Files:**
- Modify: `public/index.html` (full replacement)

**Interfaces:**
- Consumes: `.channel-head`/`.socials`/`#bg-canvas` styles (Task 1); `scene.js` (Task 2);
  the existing `donate.js` and `site.css` (unchanged); the import map specifier `three`.
- Produces: the standalone page DOM the user sees.

**What changes vs. the current file:**
1. Add `<link rel="stylesheet" href="/css/donate.css" />` after the `site.css` link.
2. Add `<canvas id="bg-canvas"></canvas>` as the first child of `<body>`.
3. Replace the whole `<nav class="nav">…</nav>` block with a `<header class="channel-head">`
   containing the channel name + YouTube/TikTok icon links (no internal page links, no logo).
4. Before the closing `</body>`, add the three.js **import map** and the `scene.js` module script,
   keeping the existing `donate.js` script.
5. Everything inside `#step-form`, `#step-pay`, `#step-done` stays exactly as-is.

- [ ] **Step 1: Replace the entire contents of `public/index.html` with the exact content below**

```html
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ส่งกำลังใจ • TonKungTV</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@500;600;700;800&family=Sarabun:wght@400;600;700&family=Chakra+Petch:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/site.css" />
  <link rel="stylesheet" href="/css/donate.css" />
</head>
<body>
  <canvas id="bg-canvas"></canvas>

  <div class="container">
    <header class="channel-head">
      <div class="channel-name">TonKungTV</div>
      <div class="socials">
        <a class="yt" href="https://www.youtube.com/@TonKungTV" target="_blank" rel="noopener" aria-label="YouTube">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.5 15.5v-7l6.5 3.5-6.5 3.5z"/></svg>
        </a>
        <a class="tt" href="https://www.tiktok.com/@tonkungtv" target="_blank" rel="noopener" aria-label="TikTok">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3c.31 2.13 1.5 3.83 3.5 4.2v2.53c-1.27.06-2.5-.31-3.5-1.06v6.08a6 6 0 1 1-6-6c.31 0 .62.02.91.07v2.62a3.4 3.4 0 0 0-.91-.13 3.44 3.44 0 1 0 3.44 3.44V3h2.56z"/></svg>
        </a>
      </div>
    </header>

    <!-- ขั้นที่ 1: กรอกข้อมูล -->
    <div class="card glow" id="step-form">
      <span class="eyebrow">▸ ส่งโดเนทขึ้นจอสด</span>
      <h1>จุดพลัง<span class="grad-text">ให้สตรีมเมอร์</span> 💜</h1>
      <p class="subtitle">กรอกชื่อ จำนวนเงิน และข้อความ → สแกน QR พร้อมเพย์ → แนบสลิป แล้วชื่อคุณจะเด้งขึ้นจอทันที</p>

      <form id="donate-form">
        <div class="field">
          <label for="name">ชื่อของคุณ</label>
          <input type="text" id="name" name="name" placeholder="เช่น น้องเมย์ (เว้นว่าง = ไม่ประสงค์ออกนาม)" maxlength="40" autocomplete="off" />
        </div>

        <div class="field">
          <label for="amount">จำนวนเงิน (<span class="cur">฿</span>)</label>
          <input type="number" id="amount" name="amount" placeholder="0" min="1" step="1" inputmode="numeric" required />
          <div class="amount-chips">
            <button type="button" class="chip" data-amount="20">฿20</button>
            <button type="button" class="chip" data-amount="50">฿50</button>
            <button type="button" class="chip" data-amount="100">฿100</button>
            <button type="button" class="chip" data-amount="200">฿200</button>
            <button type="button" class="chip" data-amount="500">฿500</button>
          </div>
        </div>

        <div class="field">
          <label for="message">ข้อความถึงสตรีมเมอร์</label>
          <textarea id="message" name="message" placeholder="พิมพ์ข้อความให้กำลังใจ..." maxlength="200"></textarea>
        </div>

        <button type="submit" class="btn btn-primary" id="submit-btn">สร้าง QR พร้อมเพย์ 📱</button>
        <div class="toast" id="toast"></div>
      </form>
    </div>

    <!-- ขั้นที่ 2: QR + อัปโหลดสลิป -->
    <div class="card glow" id="step-pay" style="display:none">
      <span class="eyebrow">▸ ขั้นที่ 2 / 2 — โอนแล้วแนบสลิป</span>
      <h1>สแกนเพื่อ<span class="grad-text">โอน</span> 📱</h1>
      <p class="subtitle">สแกน QR ด้วยแอปธนาคาร โอน <b class="mono" style="color:var(--gold)"><span class="cur">฿</span><span id="pay-amount">0</span></b> แล้วแนบสลิปด้านล่าง</p>

      <div style="text-align:center">
        <div class="qr-box"><img id="qr-img" alt="PromptPay QR" /></div>
        <p class="note" style="margin-top:12px">พร้อมเพย์: <b id="pp-id" class="mono" style="color:var(--cyan)">-</b></p>
      </div>

      <div class="field" style="margin-top:20px">
        <label for="slip">แนบสลิปการโอน (รูปภาพ ไม่เกิน 5MB)</label>
        <input type="file" id="slip" accept="image/*" />
      </div>
      <img id="slip-preview" class="slip-preview" alt="ตัวอย่างสลิป" style="display:none" />

      <div class="row" style="margin-top:10px">
        <button type="button" class="btn btn-ghost" id="back-btn" style="flex:1">ย้อนกลับ</button>
        <button type="button" class="btn btn-primary" id="confirm-btn" style="flex:2">ยืนยันการโอน ✓</button>
      </div>
      <div class="toast" id="toast2"></div>
    </div>

    <!-- ขั้นที่ 3: สำเร็จ -->
    <div class="card glow" id="step-done" style="display:none; text-align:center">
      <div class="success-burst">🎉</div>
      <h1>ขอบคุณสำหรับ<span class="grad-text">การบริจาค!</span></h1>
      <p class="subtitle">ข้อความของคุณถูกส่งขึ้นสตรีมเรียบร้อยแล้ว 💜</p>
      <button type="button" class="btn btn-primary" id="again-btn" style="max-width:300px;margin:0 auto">บริจาคอีกครั้ง</button>
    </div>

    <p class="note">เมื่อแนบสลิปแล้ว ระบบจะตรวจด้วย OCR ว่าเป็นสลิปจริงและโอนเข้าชื่อผู้รับถูกต้อง ก่อนแจ้งเตือนขึ้นจอสตรีม</p>
  </div>

  <script type="importmap">
  { "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
  </script>
  <script type="module" src="/js/scene.js"></script>
  <script src="/js/donate.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify the HTML structure**

Run: `node -e "const s=require('fs').readFileSync('public/index.html','utf8'); const must=['bg-canvas','channel-head','@TonKungTV','@tonkungtv','importmap','/js/scene.js','/js/donate.js','/css/donate.css','id=\"step-form\"']; const bad=['class=\"nav\"','/leaderboard.html','/dashboard.html','/control.html']; for(const m of must) if(!s.includes(m)) throw new Error('MISSING: '+m); for(const b of bad) if(s.includes(b)) throw new Error('SHOULD BE REMOVED: '+b); console.log('index.html OK');"`
Expected: prints `index.html OK` (confirms header/canvas/scripts present AND the old nav + internal links are gone).

- [ ] **Step 3 (optional): Commit**

```bash
git add public/index.html
git commit -m "feat(donate): make donate page standalone with channel header + 3D background"
```

---

## Task 4: Integration verification (server + browser)

**Files:** none (verification only)

- [ ] **Step 1: Start the server**

Run: `npm start`
Expected: console shows the server listening (default port `3000`). Leave it running for the next steps.

- [ ] **Step 2: Confirm all new assets are served (HTTP 200)**

In a second terminal:
Run: `curl -s -o /dev/null -w "index=%{http_code}\n" http://localhost:3000/ && curl -s -o /dev/null -w "scene=%{http_code}\n" http://localhost:3000/js/scene.js && curl -s -o /dev/null -w "css=%{http_code}\n" http://localhost:3000/css/donate.css`
Expected:
```
index=200
scene=200
css=200
```

- [ ] **Step 3: Browser visual check** — open `http://localhost:3000/` in a desktop browser, open DevTools Console, and confirm ALL of the following:
  - [ ] **No console errors** (especially no failed `three` import / no WebGL errors).
  - [ ] A field of soft neon dots is visible behind the card, drifting slowly.
  - [ ] Moving the mouse shifts the field gently (parallax follows the cursor).
  - [ ] Clicking **anywhere** spawns a particle burst + an expanding ring at the click point.
  - [ ] The donate form still works: typing in the fields, the amount chips select, and
        submitting advances to the QR step (i.e. `donate.js` is unaffected and the canvas does
        not block clicks).
  - [ ] The header shows `TonKungTV` with YouTube + TikTok icons; the icons open the correct
        URLs in a new tab; there are **no** links to อันดับ/Dashboard/Control and no logo.

- [ ] **Step 4: Mobile / touch check** — open the page on a phone (same LAN, e.g.
      `http://<your-LAN-IP>:3000/`) **or** use the browser DevTools device-emulation (touch) mode:
  - [ ] Dragging a finger across the screen produces the parallax shift.
  - [ ] Tapping spawns a burst + ripple at the tap point.
  - [ ] Page still scrolls and the form is usable.

- [ ] **Step 5: Performance / guard checks**
  - [ ] Switch to another browser tab for a few seconds, come back — the animation resumes and the
        page is not janky (the loop paused while hidden).
  - [ ] In DevTools, enable "Emulate CSS prefers-reduced-motion: reduce" and reload — the 3D canvas
        is hidden (`display:none`) and the page falls back to the static CSS background with no errors.

- [ ] **Step 6 (optional): Commit any final tweaks**

```bash
git add -A
git commit -m "chore(donate): verify standalone page + 3D background"
```

---

## Notes for the implementer

- **Why pointer events live on `window`, not the canvas:** the canvas is `pointer-events:none`
  so it never intercepts form interaction; reading pointer position globally still lets the
  background react to every move/click/tap, including taps on the form (which feels intentional).
- **Why the burst fades via color, not opacity:** with `AdditiveBlending`, multiplying a particle's
  RGB toward `0` makes it contribute nothing (effectively invisible), which lets one shared
  `Points` object fade individual particles without a custom shader or per-vertex alpha.
- **If you prefer to vendor three.js instead of CDN** (e.g. for offline reliability): download
  `three.module.js` (r0.160.0) into `public/vendor/three.module.js` and change the import map to
  `{ "imports": { "three": "/vendor/three.module.js" } }`. No other code changes needed.
- **Do not reintroduce** heavy CSS effects (`backdrop-filter`, animated `blur()`, spinning
  conic-gradients) — those were removed earlier specifically to fix lag.
```
