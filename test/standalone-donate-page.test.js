'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('donate page is standalone and keeps the existing donation flow hooks', () => {
  const html = read('public/index.html');

  for (const expected of [
    '<canvas id="bg-canvas"></canvas>',
    'class="channel-head"',
    'TonKungTV',
    'https://www.youtube.com/@TonKungTV',
    'https://www.tiktok.com/@tonkungtv',
    'rel="noopener"',
    'type="importmap"',
    '"three": "https://unpkg.com/three@0.160.0/build/three.module.js"',
    '<script type="module" src="/js/scene.js"></script>',
    '<script src="/js/donate.js"></script>',
    '<link rel="stylesheet" href="/css/donate.css" />',
    'id="step-form"',
    'id="step-pay"',
    'id="step-done"',
  ]) {
    assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const removed of [
    'class="nav"',
    'Donate Overlay</div>',
    '/leaderboard.html',
    '/dashboard.html',
    '/control.html',
  ]) {
    assert.doesNotMatch(html, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('donate-specific CSS provides non-interactive background canvas and channel header styles', () => {
  const css = read('public/css/donate.css');

  for (const expected of [
    '#bg-canvas',
    'position: fixed',
    'z-index: -1',
    'pointer-events: none',
    '.channel-head',
    '.channel-name',
    '.socials',
    '.socials a.yt:hover',
    '.socials a.tt:hover',
    'var(--glow-cyan)',
  ]) {
    assert.match(css, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('three.js scene module respects performance and accessibility constraints', () => {
  const js = read('public/js/scene.js');

  for (const expected of [
    "import * as THREE from 'three'",
    "document.getElementById('bg-canvas')",
    "matchMedia('(prefers-reduced-motion: reduce)')",
    "canvas.style.display = 'none'",
    'new THREE.WebGLRenderer',
    'Math.min(window.devicePixelRatio || 1, 2)',
    'const FIELD_COUNT = 320',
    'const BURST_MAX = 360',
    'THREE.AdditiveBlending',
    "window.addEventListener('pointermove'",
    "window.addEventListener('pointerdown'",
    "document.addEventListener('visibilitychange'",
    'function spawnBurst()',
    'function makeDotTexture()',
  ]) {
    assert.match(js, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(js, /ShadowMap|castShadow|receiveShadow/);
});
