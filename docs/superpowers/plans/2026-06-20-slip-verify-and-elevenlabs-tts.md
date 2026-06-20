# Slip OCR Verification + ElevenLabs TTS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม (A) การตรวจสลิปด้วย OCR ที่บล็อกรูปที่ไม่ใช่สลิปและติดธงเมื่อชื่อผู้รับไม่ตรง "ธีรภัทร ปิ่นพรม", และ (B) เสียงแจ้งเตือนด้วย ElevenLabs (มีแคช + fallback กลับเบราว์เซอร์)

**Architecture:** ตรรกะล้วนแยกเป็นโมดูลใน `lib/` (เทสต์ได้โดยไม่ยิง OCR/API จริง), เซิร์ฟเวอร์ `server.js` ต่อสายเข้า endpoint เดิม, หน้าเว็บ (`public/`) ปรับ UX. การตัดสินผลตรวจอยู่ใน `lib/slip-verify.js` (pure); การเรียก Tesseract/ElevenLabs ถูกหุ้มใน `lib/ocr.js` / `lib/tts.js` และ inject ได้ตอนเทสต์

**Tech Stack:** Node 16+, Express, Socket.IO, `tesseract.js` (OCR), ElevenLabs REST API, `node:test` + `supertest` (เทสต์)

## Global Constraints

- Deploy บน **Linux** (Docker / pm2 / systemd) — ไม่ต้องรองรับ Windows Server 2012 อีก
- API key เก็บใน `.env` เท่านั้น (gitignore + dockerignore ครอบคลุมแล้ว) — ห้าม hardcode/commit/ส่งไปฝั่งเบราว์เซอร์
- ห้ามส่ง `verify.text` (ข้อความ OCR ดิบ) ออกทาง API สาธารณะ (มีชื่อผู้โอนจริง = ข้อมูลส่วนบุคคล)
- บล็อกเฉพาะกรณี "ไม่ใช่สลิป" เท่านั้น; ชื่อไม่ตรง/OCR พัง = ผ่านแต่ติดธง (fail-open)
- ชื่อผู้รับที่ตรวจ: ค่าเริ่มต้น `ธีรภัทร ปิ่นพรม` (ตั้งค่าได้ผ่าน settings)
- เสียง ElevenLabs ค่าเริ่มต้น: voiceId `cgSgspJ2msm6clMCkdW9` (Jessica), model `eleven_multilingual_v2`
- ไม่เพิ่ม native dependency ใน v1 (ไม่ใช้ sharp); ไม่เทียบยอดเงิน; ไม่ตรวจ QR กับธนาคาร (YAGNI)
- ตรรกะล้วนใน `lib/` ห้ามมี side-effect I/O (อ่านไฟล์/เน็ต) — แยก I/O ไปไว้ที่ตัวหุ้ม/`server.js`

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `lib/slip-verify.js` | ตรรกะล้วน: normalize ไทย, fuzzy match, ตรวจ "เป็นสลิปไหม", ตรวจชื่อ | สร้างใหม่ |
| `lib/ocr.js` | หุ้ม Tesseract.js (worker singleton + timeout) | สร้างใหม่ |
| `lib/tts.js` | หุ้ม ElevenLabs + แคชไฟล์ MP3 | สร้างใหม่ |
| `test/slip-verify.test.js` | เทสต์ตรรกะตรวจสลิป | สร้างใหม่ |
| `test/ocr.test.js` | เทสต์ `withTimeout` | สร้างใหม่ |
| `test/tts.test.js` | เทสต์แคช/synthesize (mock fetch) | สร้างใหม่ |
| `test/slip-endpoint.test.js` | เทสต์ endpoint อัปโหลดสลิป (mock OCR) | สร้างใหม่ |
| `test/tts-endpoint.test.js` | เทสต์ `/api/tts` (mock tts) | สร้างใหม่ |
| `server.js` | ต่อสาย verify เข้า slip endpoint + route `/api/tts` + settings/env + export app | แก้ |
| `public/js/donate.js` | spinner + ข้อความเมื่อโดนปฏิเสธ | แก้ |
| `public/index.html` | ข้อความ note ใต้ฟอร์ม | แก้ |
| `public/js/dashboard.js` | ป้ายสถานะ verify ในประวัติ | แก้ |
| `public/css/site.css` | สไตล์ป้าย/ขอบเตือน | แก้ |
| `public/js/overlay.js` | เล่นเสียง ElevenLabs + fallback | แก้ |
| `public/control.html` + `public/js/control.js` | ฟิลด์ตรวจสลิป + เลือกเสียง/provider | แก้ |
| `package.json` | dep `tesseract.js`, devDep `supertest`, script `test` | แก้ |
| `.env.example` | env ใหม่ | แก้ |
| `Dockerfile` | COPY `lib`, `vendor/tessdata` (ถ้ามี) | แก้ |
| `deploy/DEPLOY.md` | คู่มือ Linux + traineddata + env | แก้ |

---

## Task 1: `lib/slip-verify.js` — ตรรกะตรวจสลิป (pure) + ตั้งค่า test runner

**Files:**
- Create: `lib/slip-verify.js`
- Create: `test/slip-verify.test.js`
- Modify: `package.json` (เพิ่ม `"test": "node --test"`)

**Interfaces:**
- Consumes: (ไม่มี)
- Produces:
  - `normalizeThai(s: string) => string`
  - `levenshtein(a: string, b: string) => number`
  - `fuzzyContains(haystack: string, needle: string, maxDist: number) => boolean`
  - `looksLikeSlip(text: string, keywords?: string[]) => { slipLike: boolean, hits: string[] }`
  - `matchName(text: string, expectedName: string) => { nameFound: boolean, firstNameMatch: boolean, lastNameMatch: boolean }`
  - `verifyOcrText(text: string, opts?: { expectedName?: string, keywords?: string[], slipKeywordMin?: number }) => { status: 'not_a_slip'|'verified'|'unverified', nameFound: boolean, slipLike: boolean, hits: string[] }`
  - `SLIP_KEYWORDS: string[]`, `SLIP_KEYWORD_MIN: number`

- [ ] **Step 1: เพิ่ม test script ใน package.json**

แก้ `package.json` ส่วน `"scripts"` เพิ่มบรรทัด (วางต่อจาก `"dev"`):

```json
    "test": "node --test",
```

- [ ] **Step 2: เขียนเทสต์ที่ยังล้มเหลว** — `test/slip-verify.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeThai, levenshtein, fuzzyContains,
  looksLikeSlip, matchName, verifyOcrText,
} = require('../lib/slip-verify');

test('normalizeThai ตัดช่องว่างและทำตัวพิมพ์เล็ก', () => {
  assert.strictEqual(normalizeThai('  ธีรภัทร  ปิ่นพรม '), 'ธีรภัทรปิ่นพรม');
  assert.strictEqual(normalizeThai('PromptPay'), 'promptpay');
});

test('levenshtein นับระยะแก้ไขถูกต้อง', () => {
  assert.strictEqual(levenshtein('abc', 'abc'), 0);
  assert.strictEqual(levenshtein('abc', 'abd'), 1);
  assert.strictEqual(levenshtein('abc', 'aXbc'), 1);
});

test('fuzzyContains เจอเมื่อพลาดในเกณฑ์ ไม่เจอเมื่อพลาดเกิน', () => {
  assert.strictEqual(fuzzyContains('xxธีรภัทรyy', 'ธีรภัทร', 0), true);
  assert.strictEqual(fuzzyContains('xxธีรกัทรyy', 'ธีรภัทร', 1), true); // ภ->ก พลาด 1
  assert.strictEqual(fuzzyContains('สมชายใจดี', 'ธีรภัทร', 1), false);
});

test('looksLikeSlip: ข้อความสลิปจริง = true, ข้อความสุ่ม = false', () => {
  const slip = 'โอนเงินสำเร็จ จำนวนเงิน 100.00 บาท ธนาคารกสิกรไทย รหัสอ้างอิง 12345';
  assert.strictEqual(looksLikeSlip(slip).slipLike, true);
  assert.strictEqual(looksLikeSlip('แมวน่ารักวันนี้อากาศดี').slipLike, false);
  assert.strictEqual(looksLikeSlip('').slipLike, false);
});

test('matchName: เจอชื่อเต็ม / นามสกุลถูกปิด / OCR เพี้ยน 1 ตัว / ชื่ออื่น', () => {
  const expected = 'ธีรภัทร ปิ่นพรม';
  assert.strictEqual(matchName('ไปยัง นาย ธีรภัทร ปิ่นพรม', expected).nameFound, true);
  assert.strictEqual(matchName('นาย ธีรภัทร ป.', expected).nameFound, true); // นามสกุลปิด
  assert.strictEqual(matchName('ธีรกัทร ปิ่นพรม', expected).nameFound, true); // เพี้ยน 1 ตัว
  assert.strictEqual(matchName('นางสาว สมหญิง ใจงาม', expected).nameFound, false);
});

test('verifyOcrText: ครบทุกสถานะ', () => {
  const expected = 'ธีรภัทร ปิ่นพรม';
  const slipOk = 'โอนเงินสำเร็จ 50 บาท พร้อมเพย์ ไปยัง ธีรภัทร ปิ่นพรม รหัสอ้างอิง 9';
  const slipWrong = 'โอนเงินสำเร็จ 50 บาท ธนาคารกสิกร ไปยัง สมชาย ใจดี รหัสอ้างอิง 9';
  assert.strictEqual(verifyOcrText(slipOk, { expectedName: expected }).status, 'verified');
  assert.strictEqual(verifyOcrText(slipWrong, { expectedName: expected }).status, 'unverified');
  assert.strictEqual(verifyOcrText('สวัสดีตอนเช้า', { expectedName: expected }).status, 'not_a_slip');
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/slip-verify'`

- [ ] **Step 4: เขียน implementation** — `lib/slip-verify.js`

```js
'use strict';

// คำบ่งชี้ว่าเป็น "สลิปโอนเงิน" (เทียบหลัง normalize แล้ว)
const SLIP_KEYWORDS = [
  'โอนเงินสำเร็จ', 'โอนสำเร็จ', 'จำนวนเงิน', 'จำนวน', 'บาท', 'ค่าธรรมเนียม',
  'รหัสอ้างอิง', 'เลขที่รายการ', 'ธนาคาร', 'พร้อมเพย์', 'promptpay', 'baht',
  'กสิกร', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'กรุงศรี', 'ทหารไทย', 'ออมสิน', 'ttb', 'scb', 'kbank',
];
const SLIP_KEYWORD_MIN = 2;

// normalize: NFC, ตัด whitespace/zero-width, อังกฤษเป็นพิมพ์เล็ก, คงไทย+a-z+0-9
function normalizeThai(s) {
  if (typeof s !== 'string') return '';
  let out = s.normalize('NFC').toLowerCase();
  out = out.replace(/[​-‏‪-‮﻿]/g, ''); // zero-width/bidi
  out = out.replace(/\s+/g, '');                                  // ทุกช่องว่าง
  out = out.replace(/[^฀-๿a-z0-9]/g, '');               // คงเฉพาะไทย/a-z/0-9
  return out;
}

function levenshtein(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// มี substring ของ haystack ที่ระยะ <= maxDist จาก needle ไหม
function fuzzyContains(haystack, needle, maxDist) {
  const H = normalizeThai(haystack);
  const N = normalizeThai(needle);
  if (!N) return false;
  if (maxDist <= 0) return H.includes(N);
  const len = N.length;
  // ลองหน้าต่างความยาว len-maxDist .. len+maxDist
  for (let w = Math.max(1, len - maxDist); w <= len + maxDist; w++) {
    for (let i = 0; i + w <= H.length; i++) {
      if (levenshtein(H.slice(i, i + w), N) <= maxDist) return true;
    }
  }
  return false;
}

function looksLikeSlip(text, keywords) {
  const H = normalizeThai(text);
  const list = keywords || SLIP_KEYWORDS;
  const hits = [];
  for (const kw of list) {
    if (H.includes(normalizeThai(kw))) hits.push(kw);
  }
  return { slipLike: hits.length >= SLIP_KEYWORD_MIN, hits };
}

function matchName(text, expectedName) {
  const parts = String(expectedName || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || '';
  const last = parts.slice(1).join('');
  const firstMaxDist = Math.max(1, Math.floor(normalizeThai(first).length * 0.2));
  const firstNameMatch = first ? fuzzyContains(text, first, firstMaxDist) : false;
  // นามสกุล: เทียบ 3-4 อักขระแรก รองรับสลิปที่ปิดนามสกุล
  let lastNameMatch = false;
  const lastNorm = normalizeThai(last);
  if (lastNorm) {
    const prefix = lastNorm.slice(0, Math.min(4, lastNorm.length));
    lastNameMatch = fuzzyContains(text, prefix, prefix.length >= 4 ? 1 : 0);
  }
  return { nameFound: firstNameMatch, firstNameMatch, lastNameMatch };
}

function verifyOcrText(text, opts) {
  opts = opts || {};
  const keywords = opts.keywords || SLIP_KEYWORDS;
  const min = opts.slipKeywordMin || SLIP_KEYWORD_MIN;
  const { hits } = looksLikeSlip(text, keywords);
  const slipLike = hits.length >= min;
  if (!slipLike) return { status: 'not_a_slip', nameFound: false, slipLike: false, hits };
  const { nameFound } = matchName(text, opts.expectedName || 'ธีรภัทร ปิ่นพรม');
  return { status: nameFound ? 'verified' : 'unverified', nameFound, slipLike: true, hits };
}

module.exports = {
  normalizeThai, levenshtein, fuzzyContains,
  looksLikeSlip, matchName, verifyOcrText,
  SLIP_KEYWORDS, SLIP_KEYWORD_MIN,
};
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS ทุกเคสในไฟล์ slip-verify

- [ ] **Step 6: Commit**

```bash
git add lib/slip-verify.js test/slip-verify.test.js package.json
git commit -m "feat(verify): add pure slip-verify logic (thai fuzzy match + slip detection)"
```

---

## Task 2: `lib/ocr.js` — หุ้ม Tesseract.js + timeout

**Files:**
- Create: `lib/ocr.js`
- Create: `test/ocr.test.js`
- Modify: `package.json` (ติดตั้ง `tesseract.js`)

**Interfaces:**
- Consumes: (ไม่มีจาก task อื่น)
- Produces:
  - `withTimeout(promise: Promise, ms: number, message?: string) => Promise` — reject ด้วย Error(message) เมื่อเกินเวลา
  - `runOcr(imagePath: string, opts?: { langPath?: string, timeoutMs?: number, langs?: string }) => Promise<string>`
  - `terminate() => Promise<void>` — ปิด worker (ใช้ตอน shutdown/เทสต์)

- [ ] **Step 1: ติดตั้ง tesseract.js**

Run: `npm install tesseract.js`
Expected: เพิ่มใน `dependencies` สำเร็จ

- [ ] **Step 2: เขียนเทสต์ `withTimeout` ที่ยังล้มเหลว** — `test/ocr.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { withTimeout } = require('../lib/ocr');

test('withTimeout: resolve ทันถ้าเสร็จก่อนเวลา', async () => {
  const r = await withTimeout(Promise.resolve('ok'), 1000);
  assert.strictEqual(r, 'ok');
});

test('withTimeout: reject เมื่อเกินเวลา', async () => {
  const slow = new Promise((res) => setTimeout(() => res('late'), 50));
  await assert.rejects(() => withTimeout(slow, 5, 'หมดเวลา OCR'), /หมดเวลา OCR/);
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `node --test test/ocr.test.js`
Expected: FAIL — `Cannot find module '../lib/ocr'`

- [ ] **Step 4: เขียน implementation** — `lib/ocr.js`

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || 'OCR timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let workerPromise = null;

// โฟลเดอร์ traineddata แบบ offline ถ้ามี (vendor/tessdata) — ไม่งั้นปล่อย tesseract.js โหลดจาก CDN
function defaultLangPath() {
  const p = path.join(__dirname, '..', 'vendor', 'tessdata');
  return fs.existsSync(p) ? p : undefined;
}

async function getWorker(opts) {
  if (!workerPromise) {
    const langs = (opts && opts.langs) || 'tha+eng';
    const options = {};
    const langPath = (opts && opts.langPath) || process.env.TESSDATA_PATH || defaultLangPath();
    if (langPath) {
      options.langPath = langPath;
      options.cachePath = langPath;
    }
    workerPromise = createWorker(langs, 1, options);
  }
  return workerPromise;
}

async function runOcr(imagePath, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || Number(process.env.OCR_TIMEOUT_MS) || 20000;
  const worker = await getWorker(opts);
  const { data } = await withTimeout(worker.recognize(imagePath), timeoutMs, 'หมดเวลา OCR');
  return (data && data.text) || '';
}

async function terminate() {
  if (workerPromise) {
    try { const w = await workerPromise; await w.terminate(); } catch (e) { /* ignore */ }
    workerPromise = null;
  }
}

module.exports = { withTimeout, runOcr, terminate };
```

- [ ] **Step 5: รันเทสต์ `withTimeout` ให้ผ่าน**

Run: `node --test test/ocr.test.js`
Expected: PASS ทั้ง 2 เคส

- [ ] **Step 6: ตรวจ OCR จริงด้วยมือ (manual — ไม่อยู่ในชุดเทสต์อัตโนมัติ เพราะช้า/ต้องมีรูปจริง)**

สร้างไฟล์ชั่วคราว `tmp-ocr-check.js` (ลบทิ้งหลังตรวจ) แล้วชี้ไปที่รูปสลิปจริง 1 ใบ:

```js
const { runOcr, terminate } = require('./lib/ocr');
(async () => {
  const text = await runOcr(process.argv[2]);
  console.log('OCR TEXT >>>\n', text);
  await terminate();
})();
```

Run: `node tmp-ocr-check.js path/to/slip.jpg`
Expected: พิมพ์ข้อความภาษาไทยจากสลิปออกมา (ครั้งแรกจะดาวน์โหลด traineddata สักครู่) → ถ้าเห็นข้อความ ลบ `tmp-ocr-check.js` ทิ้ง

- [ ] **Step 7: Commit**

```bash
git add lib/ocr.js test/ocr.test.js package.json package-lock.json
git commit -m "feat(verify): add tesseract.js OCR wrapper with shared worker and timeout"
```

---

## Task 3: ต่อสาย verify เข้า slip endpoint + settings/env + export app

**Files:**
- Modify: `server.js` (DEFAULT_SETTINGS, applySettings, publicDonation, slip endpoint, export app/guard listen, เพิ่ม require lib)
- Modify: `.env.example`
- Create: `test/slip-endpoint.test.js`
- Modify: `package.json` (devDep `supertest`)

**Interfaces:**
- Consumes: `verifyOcrText` (Task 1), `runOcr` (Task 2)
- Produces:
  - `module.exports = { app, server, io }` จาก `server.js`
  - `donation.verify = { status, nameFound, slipLike, text, at }` ในที่เก็บข้อมูล
  - `publicDonation(d).verify = { status, nameFound } | null`
  - `settings.verifyEnabled: boolean`, `settings.expectedName: string`

- [ ] **Step 1: ติดตั้ง supertest (dev)**

Run: `npm install --save-dev supertest`
Expected: เพิ่มใน `devDependencies`

- [ ] **Step 2: เขียนเทสต์ endpoint ที่ยังล้มเหลว** — `test/slip-endpoint.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

// ใช้ data dir ชั่วคราว + ปิด OCR จริงด้วยการ mock ก่อน require server
process.env.DATA_DIR_OVERRIDE = path.join(__dirname, '..', 'data-test');
const ocr = require('../lib/ocr');

const { app } = require('../server');

// รูป 1x1 PNG เล็ก ๆ ใช้เป็นไฟล์อัปโหลด
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

async function createDonation() {
  const res = await request(app).post('/api/donate')
    .send({ name: 'tester', amount: 50, message: 'hi' });
  return res.body.donation.id;
}

test('not_a_slip -> 400 และยังไม่ยืนยัน', async () => {
  ocr.runOcr = async () => 'สวัสดีตอนเช้าอากาศดี'; // mock: ไม่ใช่สลิป
  const id = await createDonation();
  const res = await request(app).post('/api/donations/' + id + '/slip')
    .attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.reason, 'not_a_slip');
});

test('verified -> ยืนยัน + verify.status=verified', async () => {
  ocr.runOcr = async () => 'โอนเงินสำเร็จ 50 บาท พร้อมเพย์ ไปยัง ธีรภัทร ปิ่นพรม รหัสอ้างอิง 1';
  const id = await createDonation();
  const res = await request(app).post('/api/donations/' + id + '/slip')
    .attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.verify.status, 'verified');
});

test('unverified -> ยืนยันแต่ติดธง', async () => {
  ocr.runOcr = async () => 'โอนเงินสำเร็จ 50 บาท ธนาคารกสิกร ไปยัง สมชาย ใจดี รหัสอ้างอิง 1';
  const id = await createDonation();
  const res = await request(app).post('/api/donations/' + id + '/slip')
    .attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.verify.status, 'unverified');
});

test('OCR พัง -> fail-open (ยืนยัน + error)', async () => {
  ocr.runOcr = async () => { throw new Error('boom'); };
  const id = await createDonation();
  const res = await request(app).post('/api/donations/' + id + '/slip')
    .attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.verify.status, 'error');
});

test('publicDonation ไม่หลุดข้อความ OCR ดิบ', async () => {
  ocr.runOcr = async () => 'โอนเงินสำเร็จ 50 บาท ไปยัง ธีรภัทร ปิ่นพรม รหัสอ้างอิง 1';
  const id = await createDonation();
  await request(app).post('/api/donations/' + id + '/slip').attach('slip', PNG_1x1, 'x.png');
  const list = await request(app).get('/api/donations?status=all');
  const item = list.body.donations.find((d) => d.id === id);
  assert.ok(item.verify);
  assert.strictEqual(item.verify.text, undefined); // ห้ามมี text
});

test.after(async () => {
  await ocr.terminate().catch(() => {});
  fs.rmSync(path.join(__dirname, '..', 'data-test'), { recursive: true, force: true });
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `node --test test/slip-endpoint.test.js`
Expected: FAIL (server ยังไม่ export `app` / ยังไม่มี verify)

- [ ] **Step 4: แก้ `server.js` — (4a) รองรับ DATA_DIR override + require lib**

แก้บล็อกที่เก็บข้อมูล (เดิม `server.js:34-38`) ให้รองรับ override (ใช้ตอนเทสต์):

```js
// ----- ที่เก็บข้อมูล -----
const DATA_DIR = process.env.DATA_DIR_OVERRIDE || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'donations.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SLIP_DIR = path.join(DATA_DIR, 'slips');
const TTS_DIR = path.join(DATA_DIR, 'tts');
```

เพิ่ม require ใต้บรรทัด `const QRCode = require('qrcode');` (เดิม `server.js:23`):

```js
const { verifyOcrText } = require('./lib/slip-verify');
const ocr = require('./lib/ocr'); // ใช้ ocr.runOcr เพื่อให้ mock ได้ตอนเทสต์
```

- [ ] **Step 5: แก้ `server.js` — (4b) settings ใหม่**

ใน `DEFAULT_SETTINGS` (เดิม `server.js:48-63`) เพิ่มก่อนปิดปีกกา:

```js
  // ---- ตรวจสลิป (OCR) ----
  verifyEnabled: true,
  expectedName: 'ธีรภัทร ปิ่นพรม',
  // ---- เสียง ElevenLabs (ใช้ใน Task 7) ----
  ttsProvider: 'elevenlabs', // 'elevenlabs' | 'browser'
  ttsVoiceId: 'cgSgspJ2msm6clMCkdW9',
```

ใน `applySettings(input)` (เดิม `server.js:318-341`) เพิ่มก่อน `return s;`:

```js
  if (input.verifyEnabled !== undefined) s.verifyEnabled = !!input.verifyEnabled;
  if (typeof input.expectedName === 'string') s.expectedName = sanitizeText(input.expectedName, 60) || s.expectedName;
  if (typeof input.ttsProvider === 'string') s.ttsProvider = input.ttsProvider === 'browser' ? 'browser' : 'elevenlabs';
  if (typeof input.ttsVoiceId === 'string') s.ttsVoiceId = sanitizeText(input.ttsVoiceId, 40) || s.ttsVoiceId;
```

- [ ] **Step 6: แก้ `server.js` — (4c) publicDonation แนบ verify**

แก้ `publicDonation(d)` (เดิม `server.js:162-172`) เพิ่ม field `verify` ในออบเจกต์ที่ return:

```js
function publicDonation(d) {
  return {
    id: d.id,
    name: d.name,
    amount: d.amount,
    message: d.message,
    slip: d.slip ? '/slips/' + d.slip : null,
    verify: d.verify ? { status: d.verify.status, nameFound: d.verify.nameFound } : null,
    createdAt: d.createdAt,
    confirmedAt: d.confirmedAt || null,
  };
}
```

- [ ] **Step 7: แก้ `server.js` — (4d) เขียน slip endpoint ใหม่**

แทนที่ทั้ง handler `app.post('/api/donations/:id/slip', ...)` (เดิม `server.js:271-299`) ด้วย:

```js
// ขั้นที่ 2: อัปโหลดสลิป -> ตรวจ OCR -> ยืนยัน/ปฏิเสธ
app.post('/api/donations/:id/slip', (req, res) => {
  upload.single('slip')(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message || 'อัปโหลดไม่สำเร็จ' });

    const donation = donations.find((d) => d.id === req.params.id);
    if (!donation) return res.status(404).json({ ok: false, error: 'ไม่พบรายการบริจาค' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'กรุณาแนบไฟล์สลิป' });
    if (donation.status === 'confirmed') {
      return res.status(409).json({ ok: false, error: 'รายการนี้ยืนยันไปแล้ว' });
    }

    const filePath = path.join(SLIP_DIR, req.file.filename);

    // โหมดเชื่อใจ: ปิดการตรวจ -> ยืนยันทันที
    if (!settings.verifyEnabled) {
      donation.verify = { status: 'skipped', nameFound: null, slipLike: null, text: '', at: Date.now() };
      return confirmAndBroadcast(donation, req.file.filename, res);
    }

    // ตรวจ OCR
    let result, ocrText = '';
    try {
      ocrText = await ocr.runOcr(filePath);
      result = verifyOcrText(ocrText, { expectedName: settings.expectedName });
    } catch (e) {
      result = { status: 'error' }; // fail-open
    }

    // ไม่ใช่สลิป -> ปฏิเสธ + ลบไฟล์ทิ้ง
    if (result.status === 'not_a_slip') {
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      return res.status(400).json({
        ok: false, reason: 'not_a_slip',
        error: 'นี่ไม่ใช่สลิปการโอน หรืออ่านไม่ออก กรุณาแนบสลิปที่ชัดเจน',
      });
    }

    // verified / unverified / error -> ยืนยัน + ติดธงตามผล
    donation.verify = {
      status: result.status,
      nameFound: result.nameFound !== undefined ? result.nameFound : null,
      slipLike: result.slipLike !== undefined ? result.slipLike : null,
      text: ocrText,
      at: Date.now(),
    };
    return confirmAndBroadcast(donation, req.file.filename, res);
  });
});

// ยืนยันรายการ + ยิงแจ้งเตือน + อัปเดตสถิติ
function confirmAndBroadcast(donation, filename, res) {
  donation.slip = filename;
  donation.slipAt = Date.now();
  donation.status = 'confirmed';
  donation.confirmedAt = Date.now();
  saveDonations();
  io.emit('donation', {
    id: donation.id,
    name: donation.name,
    amount: donation.amount,
    message: donation.message,
    createdAt: donation.createdAt,
  });
  broadcastUpdates();
  res.json({ ok: true, verify: donation.verify ? { status: donation.verify.status, nameFound: donation.verify.nameFound } : null });
}
```

- [ ] **Step 8: แก้ `server.js` — (4e) export app + guard listen**

แทนที่บล็อก `server.listen(PORT, () => { ... });` ท้ายไฟล์ (เดิม `server.js:387-397`) ด้วย:

```js
function start() {
  server.listen(PORT, () => {
    console.log('\n  💸 Donate Overlay พร้อมใช้งานแล้ว');
    console.log('  ─────────────────────────────────────');
    console.log(`  PromptPay    : ${PROMPTPAY_ID}`);
    console.log(`  หน้าบริจาค   : http://localhost:${PORT}/`);
    console.log(`  Overlay/OBS  : http://localhost:${PORT}/overlay.html`);
    console.log(`  Dashboard    : http://localhost:${PORT}/dashboard.html`);
    console.log(`  Control Panel: http://localhost:${PORT}/control.html`);
    console.log(`  Leaderboard  : http://localhost:${PORT}/leaderboard.html`);
    console.log('  ─────────────────────────────────────\n');
  });
}

if (require.main === module) start();

module.exports = { app, server, io, start };
```

- [ ] **Step 9: เพิ่ม env ใหม่ใน `.env.example`**

เพิ่มท้ายไฟล์ `.env.example`:

```
# ---- ตรวจสลิป (OCR) ----
# โฟลเดอร์ traineddata แบบ offline (เว้นว่าง = โหลดจาก CDN ครั้งแรกแล้วแคชเอง)
TESSDATA_PATH=
# timeout การอ่าน OCR ต่อรูป (มิลลิวินาที)
OCR_TIMEOUT_MS=20000
```

- [ ] **Step 10: รันเทสต์ทั้งหมดให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้ง slip-verify, ocr, slip-endpoint

- [ ] **Step 11: Commit**

```bash
git add server.js .env.example test/slip-endpoint.test.js package.json package-lock.json
git commit -m "feat(verify): verify slips via OCR on upload (block non-slips, flag name mismatch)"
```

---

## Task 4: หน้าบริจาค — spinner + ข้อความเมื่อโดนปฏิเสธ

**Files:**
- Modify: `public/js/donate.js` (handler ปุ่มยืนยัน เดิม `public/js/donate.js:97-122`)
- Modify: `public/index.html` (note เดิม `public/index.html:90`)

**Interfaces:**
- Consumes: response `{ ok:false, reason:'not_a_slip', error }` หรือ `{ ok:true, verify }` จาก slip endpoint (Task 3)
- Produces: (UX เท่านั้น)

- [ ] **Step 1: แก้ข้อความปุ่ม + การจัดการ response** — `public/js/donate.js`

แทนที่ handler `$('confirm-btn').addEventListener('click', ...)` (เดิมบรรทัด 97-122) ด้วย:

```js
  // ---- ขั้นที่ 2: อัปโหลดสลิป (ตรวจ OCR ก่อนยืนยัน) ----
  $('confirm-btn').addEventListener('click', async () => {
    const file = $('slip').files[0];
    if (!file) {
      showToast(toast2, 'กรุณาแนบสลิปการโอนก่อน', 'err');
      return;
    }
    const confirmBtn = $('confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ กำลังตรวจสลิป...';
    try {
      const fd = new FormData();
      fd.append('slip', file);
      const res = await fetch('/api/donations/' + currentId + '/slip', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        show('done');
      } else if (data.reason === 'not_a_slip') {
        showToast(toast2, '❌ ไม่ใช่สลิป หรืออ่านไม่ออก แนบสลิปที่ชัดเจน', 'err');
      } else {
        showToast(toast2, data.error || 'อัปโหลดไม่สำเร็จ', 'err');
      }
    } catch (err) {
      showToast(toast2, 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'err');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'ยืนยันการโอน ✓';
    }
  });
```

- [ ] **Step 2: แก้ข้อความ note ใต้ฟอร์ม** — `public/index.html:90`

แทนที่บรรทัด:

```html
    <p class="note">เมื่อแนบสลิปแล้ว ระบบจะแจ้งเตือนขึ้นจอสตรีมทันที · โหมดเชื่อใจ (ยังไม่ตรวจสลิปกับธนาคาร)</p>
```

ด้วย:

```html
    <p class="note">เมื่อแนบสลิปแล้ว ระบบจะตรวจด้วย OCR ว่าเป็นสลิปจริงและโอนเข้าชื่อผู้รับถูกต้อง ก่อนแจ้งเตือนขึ้นจอสตรีม</p>
```

- [ ] **Step 3: ตรวจด้วยมือ (manual)**

Run: `npm start` แล้วเปิด `http://localhost:3000/`
ทำตามขั้น: กรอกยอด → สร้าง QR → แนบรูปที่ "ไม่ใช่สลิป" → กดยืนยัน
Expected: ปุ่มขึ้น "⏳ กำลังตรวจสลิป..." แล้วเด้ง toast "❌ ไม่ใช่สลิป..." (ไม่ไปหน้าสำเร็จ) — กด Ctrl+C ปิด

- [ ] **Step 4: Commit**

```bash
git add public/js/donate.js public/index.html
git commit -m "feat(verify): show checking spinner and reject message on donate page"
```

---

## Task 5: Dashboard — ป้ายสถานะ verify ในประวัติ

**Files:**
- Modify: `public/js/dashboard.js` (`renderHistory()` เดิม `public/js/dashboard.js:42-88`)
- Modify: `public/css/site.css` (เพิ่มสไตล์ป้าย — ต่อท้ายไฟล์)

**Interfaces:**
- Consumes: `donation.verify = { status, nameFound }` จาก `/api/donations` (Task 3)
- Produces: (UX เท่านั้น)

- [ ] **Step 1: เพิ่มป้ายใน renderHistory** — `public/js/dashboard.js`

ใน `history.forEach((d) => { ... })` หลังบรรทัด `li.className = 'history-item';` (เดิมบรรทัด 50) เพิ่ม:

```js
      // ป้ายสถานะตรวจสลิป
      const V = { verified:  ['v-ok',   '✅ ตรวจแล้ว'],
                  unverified:['v-warn', '⚠️ ชื่อไม่ตรง—ตรวจเอง'],
                  error:     ['v-err',  '🔁 ตรวจไม่ได้'] };
      if (d.verify && V[d.verify.status]) {
        li.classList.add('flagged-' + d.verify.status);
      }
```

จากนั้นในส่วน `right` (ก่อน `li.append(left, amount, right);` เดิมบรรทัด 85) เพิ่มการต่อป้าย:

```js
      if (d.verify && V[d.verify.status]) {
        const badge = document.createElement('span');
        badge.className = 'verify-badge ' + V[d.verify.status][0];
        badge.textContent = V[d.verify.status][1];
        badge.style.cssText = 'display:block;font-size:.72rem;margin-top:2px';
        right.append(badge);
      }
```

- [ ] **Step 2: เพิ่มสไตล์** — ต่อท้าย `public/css/site.css`

```css
/* ===== ป้ายสถานะตรวจสลิป (Dashboard) ===== */
.verify-badge { font-weight: 600; }
.verify-badge.v-ok   { color: #36d399; }
.verify-badge.v-warn { color: #fbbd23; }
.verify-badge.v-err  { color: #9aa3b2; }
.history-item.flagged-unverified { border-left: 3px solid #fbbd23; padding-left: 9px; }
.history-item.flagged-error      { border-left: 3px solid #9aa3b2; padding-left: 9px; }
```

- [ ] **Step 3: ตรวจด้วยมือ (manual)**

Run: `npm start` → เปิด `/dashboard.html`; ทำรายการบริจาค 1 รายการ (จาก `/`) ด้วยสลิปที่ชื่อไม่ตรง
Expected: ประวัติแสดงป้าย "⚠️ ชื่อไม่ตรง—ตรวจเอง" + ขอบซ้ายสีเหลือง

- [ ] **Step 4: Commit**

```bash
git add public/js/dashboard.js public/css/site.css
git commit -m "feat(verify): show slip verification badges in dashboard history"
```

---

## Task 6: `lib/tts.js` — หุ้ม ElevenLabs + แคช

**Files:**
- Create: `lib/tts.js`
- Create: `test/tts.test.js`

**Interfaces:**
- Consumes: (ไม่มี)
- Produces:
  - `cachePathFor(text: string, voiceId: string, model: string, dir: string) => string`
  - `synthesize(text: string, { voiceId, model, apiKey, fetchImpl? }) => Promise<Buffer>`
  - `getOrSynthesize(text: string, { voiceId, model, apiKey, cacheDir, fetchImpl? }) => Promise<{ buffer: Buffer, cached: boolean }>`

- [ ] **Step 1: เขียนเทสต์ที่ยังล้มเหลว** — `test/tts.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { cachePathFor, getOrSynthesize } = require('../lib/tts');

test('cachePathFor: แฮชเสถียร และเปลี่ยนตาม voice/model', () => {
  const dir = '/tmp/x';
  const a = cachePathFor('สวัสดี', 'v1', 'm1', dir);
  const b = cachePathFor('สวัสดี', 'v1', 'm1', dir);
  const c = cachePathFor('สวัสดี', 'v2', 'm1', dir);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.ok(a.endsWith('.mp3'));
});

test('getOrSynthesize: cache miss -> เรียก fetch แล้วเขียนไฟล์', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, arrayBuffer: async () => Buffer.from('AUDIO').buffer }; };
  const r1 = await getOrSynthesize('ทดสอบ', { voiceId: 'v', model: 'm', apiKey: 'k', cacheDir, fetchImpl });
  assert.strictEqual(r1.cached, false);
  assert.strictEqual(calls, 1);
  // ครั้งที่สอง = cache hit ไม่เรียก fetch
  const r2 = await getOrSynthesize('ทดสอบ', { voiceId: 'v', model: 'm', apiKey: 'k', cacheDir, fetchImpl });
  assert.strictEqual(r2.cached, true);
  assert.strictEqual(calls, 1);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('synthesize ผ่าน getOrSynthesize: โยน error เมื่อ response ไม่ ok', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(() => getOrSynthesize('x', { voiceId: 'v', model: 'm', apiKey: 'bad', cacheDir, fetchImpl }));
  fs.rmSync(cacheDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `node --test test/tts.test.js`
Expected: FAIL — `Cannot find module '../lib/tts'`

- [ ] **Step 3: เขียน implementation** — `lib/tts.js`

```js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function cachePathFor(text, voiceId, model, dir) {
  const hash = crypto.createHash('sha1').update(`${text}|${voiceId}|${model}`).digest('hex');
  return path.join(dir, hash + '.mp3');
}

// เรียก ElevenLabs TTS -> คืน Buffer (MP3). inject fetchImpl ได้ตอนเทสต์
async function synthesize(text, opts) {
  const { voiceId, model, apiKey } = opts;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`ElevenLabs error ${res.status}: ${detail}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}

async function getOrSynthesize(text, opts) {
  const { voiceId, model, cacheDir } = opts;
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = cachePathFor(text, voiceId, model, cacheDir);
  if (fs.existsSync(file)) {
    return { buffer: fs.readFileSync(file), cached: true };
  }
  const buffer = await synthesize(text, opts);
  fs.writeFileSync(file, buffer);
  return { buffer, cached: false };
}

module.exports = { cachePathFor, synthesize, getOrSynthesize };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `node --test test/tts.test.js`
Expected: PASS ทั้ง 3 เคส

- [ ] **Step 5: Commit**

```bash
git add lib/tts.js test/tts.test.js
git commit -m "feat(tts): add ElevenLabs TTS wrapper with on-disk caching"
```

---

## Task 7: server.js — route `GET /api/tts` + env + settings

**Files:**
- Modify: `server.js` (require tts, env, route ใหม่, ensureDir TTS_DIR)
- Modify: `.env.example`
- Create: `test/tts-endpoint.test.js`

**Interfaces:**
- Consumes: `getOrSynthesize` (Task 6); `settings.ttsVoiceId`, `settings.ttsProvider` (Task 3); `module.exports.app` (Task 3)
- Produces: `GET /api/tts?text=...` → `audio/mpeg` (200) หรือ `400/502/503` เป็น JSON

- [ ] **Step 1: เขียนเทสต์ที่ยังล้มเหลว** — `test/tts-endpoint.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR_OVERRIDE = path.join(__dirname, '..', 'data-test-tts');
process.env.ELEVENLABS_API_KEY = 'test-key';
const tts = require('../lib/tts');
const request = require('supertest');
const { app } = require('../server');

test('GET /api/tts ไม่มี text -> 400', async () => {
  const res = await request(app).get('/api/tts');
  assert.strictEqual(res.status, 400);
});

test('GET /api/tts -> คืน audio/mpeg', async () => {
  tts.getOrSynthesize = async () => ({ buffer: Buffer.from('AUDIO'), cached: false });
  const res = await request(app).get('/api/tts').query({ text: 'สวัสดี' });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /audio\/mpeg/);
});

test('GET /api/tts -> 502 เมื่อ ElevenLabs ล้มเหลว (ให้ overlay fallback)', async () => {
  tts.getOrSynthesize = async () => { throw new Error('boom'); };
  const res = await request(app).get('/api/tts').query({ text: 'x' });
  assert.strictEqual(res.status, 502);
});

test.after(() => {
  fs.rmSync(path.join(__dirname, '..', 'data-test-tts'), { recursive: true, force: true });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `node --test test/tts-endpoint.test.js`
Expected: FAIL (ยังไม่มี route `/api/tts`)

- [ ] **Step 3: แก้ `server.js` — require + env + ensureDir**

ใต้ require `const ocr = require('./lib/ocr');` (จาก Task 3) เพิ่ม:

```js
const tts = require('./lib/tts'); // ใช้ tts.getOrSynthesize เพื่อให้ mock ได้ตอนเทสต์
```

ใต้บรรทัด `const PROMPTPAY_ID = ...` (เดิม `server.js:32`) เพิ่ม:

```js
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
```

- [ ] **Step 4: แก้ `server.js` — เพิ่ม route `/api/tts`**

วางก่อนบล็อก `// ----- การตั้งค่า overlay -----` (เดิม `server.js:317`):

```js
// ----- เสียง TTS (ElevenLabs ฝั่งเซิร์ฟเวอร์ + แคช) -----
app.get('/api/tts', async (req, res) => {
  const text = sanitizeText(req.query.text, 300);
  if (!text) return res.status(400).json({ ok: false, error: 'ต้องมีพารามิเตอร์ text' });
  if (settings.ttsProvider !== 'elevenlabs' || !ELEVENLABS_API_KEY) {
    return res.status(503).json({ ok: false, error: 'ElevenLabs ไม่พร้อมใช้งาน (ใช้เสียงเบราว์เซอร์แทน)' });
  }
  try {
    const { buffer } = await tts.getOrSynthesize(text, {
      voiceId: settings.ttsVoiceId,
      model: ELEVENLABS_MODEL,
      apiKey: ELEVENLABS_API_KEY,
      cacheDir: TTS_DIR,
    });
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error('TTS ล้มเหลว:', e.message);
    res.status(502).json({ ok: false, error: 'สร้างเสียงไม่สำเร็จ' });
  }
});
```

- [ ] **Step 5: เพิ่ม env ใน `.env.example`**

เพิ่มท้ายไฟล์ `.env.example`:

```
# ---- เสียง ElevenLabs ----
# คีย์จาก ElevenLabs (เว้นว่าง = ใช้เสียงสังเคราะห์ของเบราว์เซอร์แทน)
ELEVENLABS_API_KEY=
# โมเดล (ดีฟอลต์รองรับภาษาไทย)
ELEVENLABS_MODEL=eleven_multilingual_v2
```

- [ ] **Step 6: รันเทสต์ทั้งหมดให้ผ่าน**

Run: `npm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 7: Commit**

```bash
git add server.js .env.example test/tts-endpoint.test.js
git commit -m "feat(tts): add /api/tts ElevenLabs endpoint with cache and graceful errors"
```

---

## Task 8: overlay.js — เล่นเสียง ElevenLabs + fallback

**Files:**
- Modify: `public/js/overlay.js` (เพิ่มค่า settings เริ่มต้น, แก้ `speak()` เดิม `public/js/overlay.js:233-249`)

**Interfaces:**
- Consumes: `GET /api/tts?text=...` (Task 7); `settings.ttsProvider` (broadcast ผ่าน socket 'settings')
- Produces: (UX เท่านั้น)

- [ ] **Step 1: เพิ่มค่า default ของ settings ฝั่ง overlay** — `public/js/overlay.js`

ในออบเจกต์ `let settings = { ... }` (เดิมบรรทัด 32-38) เพิ่ม 2 คีย์ก่อนปิดปีกกา:

```js
    ttsProvider: 'elevenlabs', ttsVoiceId: 'cgSgspJ2msm6clMCkdW9',
```

- [ ] **Step 2: แก้ฟังก์ชัน `speak()` ให้ใช้ ElevenLabs ก่อน แล้ว fallback** — แทนที่ `speak(d)` เดิม (บรรทัด 233-249) ด้วย:

```js
  // เล่นเสียงเบราว์เซอร์ (fallback)
  function speakBrowser(text) {
    if (!('speechSynthesis' in window)) return 0;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = settings.ttsLang || 'th-TH';
      const voice = pickVoice(u.lang);
      if (voice) u.voice = voice;
      u.rate = 1; u.pitch = 1; u.volume = 1;
      setTimeout(() => window.speechSynthesis.speak(u), 500);
      return Math.max(2000, text.length * 75 + 600);
    } catch (e) { return 0; }
  }

  // เล่นเสียงจาก ElevenLabs (ผ่าน /api/tts); ถ้าพลาด -> fallback เบราว์เซอร์
  function speakElevenLabs(text) {
    try {
      const audio = new Audio('/api/tts?text=' + encodeURIComponent(text));
      audio.volume = Math.min(1, Math.max(0, settings.volume));
      audio.addEventListener('error', () => speakBrowser(text)); // เช่น 502/503 -> fallback
      const p = audio.play();
      if (p && p.catch) p.catch(() => speakBrowser(text));
    } catch (e) { speakBrowser(text); }
  }

  function speak(d) {
    let text = '';
    if (settings.speakAmount) text += d.name + ' บริจาค ' + fmt(d.amount) + ' บาท. ';
    if (d.message) text += d.message;
    if (!text.trim()) return 0;
    if (settings.ttsProvider === 'elevenlabs') speakElevenLabs(text);
    else speakBrowser(text);
    // คืนเวลาประมาณการให้การ์ดค้างพออ่านจบ (ElevenLabs เล่นแบบ async)
    return Math.max(2000, text.length * 75 + 600);
  }
```

- [ ] **Step 3: ตรวจด้วยมือ (manual)**

ตั้ง `ELEVENLABS_API_KEY` ใน `.env` (คีย์จริง) แล้ว `npm start`; เปิด `http://localhost:3000/overlay.html?demo=250` แล้วคลิกหน้าจอ 1 ครั้ง (ปลดล็อกเสียง)
Expected: ได้ยินเสียง ElevenLabs (Jessica) อ่านข้อความไทย; ถ้าลบ key ใน `.env` แล้วรีสตาร์ท → ตกกลับไปเสียงเบราว์เซอร์ (ไม่เงียบ/ไม่ error ค้าง)

- [ ] **Step 4: Commit**

```bash
git add public/js/overlay.js
git commit -m "feat(tts): play ElevenLabs audio in overlay with browser fallback"
```

---

## Task 9: Control Panel — ฟิลด์ตรวจสลิป + เลือกเสียง/provider

**Files:**
- Modify: `public/control.html` (เพิ่มการ์ด/แถวตั้งค่า)
- Modify: `public/js/control.js` (เพิ่มใน `FIELDS` เดิม `public/js/control.js:8-23`)

**Interfaces:**
- Consumes: settings keys `verifyEnabled, expectedName, ttsProvider, ttsVoiceId` (Task 3); `POST /api/settings`
- Produces: (UX เท่านั้น)

- [ ] **Step 1: เพิ่มการ์ด "ตรวจสลิป" ใน `public/control.html`**

วางการ์ดใหม่นี้ก่อนการ์ด `<!-- เสียง -->` (เดิมบรรทัด 86):

```html
    <!-- ตรวจสลิป -->
    <div class="card">
      <h2>🧾 ตรวจสลิป (OCR)</h2>
      <p class="subtitle" style="margin-bottom:16px">ตรวจว่าเป็นสลิปจริงและโอนเข้าชื่อผู้รับที่กำหนด ก่อนแจ้งเตือนขึ้นจอ</p>
      <div class="control-grid">
        <div class="setting-row">
          <div class="s-label">เปิดการตรวจสลิป<small>ปิด = เชื่อใจ ยืนยันทันที</small></div>
          <div class="s-input"><label class="switch"><input type="checkbox" id="verifyEnabled" /><span class="slider"></span></label></div>
        </div>
        <div class="setting-row">
          <div class="s-label">ชื่อผู้รับที่ต้องตรงในสลิป</div>
          <div class="s-input"><input type="text" id="expectedName" style="width:240px" maxlength="60" /></div>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: เพิ่มแถว provider + voice ในการ์ด TTS** — `public/control.html`

ในการ์ด `<!-- อ่านข้อความ (TTS) -->` ภายใน `<div class="control-grid">` (หลังบรรทัด 105) เพิ่มเป็น 2 แถวแรก:

```html
        <div class="setting-row">
          <div class="s-label">แหล่งเสียง</div>
          <div class="s-input">
            <select id="ttsProvider">
              <option value="elevenlabs">ElevenLabs (คุณภาพสูง)</option>
              <option value="browser">เบราว์เซอร์ (ฟรี)</option>
            </select>
          </div>
        </div>
        <div class="setting-row">
          <div class="s-label">เสียง ElevenLabs</div>
          <div class="s-input">
            <select id="ttsVoiceId">
              <option value="cgSgspJ2msm6clMCkdW9">Jessica — สดใส อบอุ่น (หญิง)</option>
              <option value="TX3LPaxmHKxFdv7VOQHJ">Liam — มีพลัง (ชาย)</option>
              <option value="IKne3meq5aSn9XLyUdCD">Charlie — ทุ้ม มั่นใจ (ชาย)</option>
              <option value="EXAVITQu4vr4xnSDxMaL">Sarah — ชัดเจน น่าเชื่อถือ (หญิง)</option>
            </select>
          </div>
        </div>
```

- [ ] **Step 3: ผูกฟิลด์ใหม่เข้า FIELDS** — `public/js/control.js`

ในออบเจกต์ `FIELDS` (เดิมบรรทัด 8-23) เพิ่มก่อนปิดปีกกา:

```js
    verifyEnabled: 'bool',
    expectedName: 'text',
    ttsProvider: 'text',
    ttsVoiceId: 'text',
```

- [ ] **Step 4: ตรวจด้วยมือ (manual)**

Run: `npm start` → เปิด `/control.html`
Expected: เห็นการ์ด "ตรวจสลิป (OCR)" (สวิตช์ + ช่องชื่อ = "ธีรภัทร ปิ่นพรม") และในการ์ด TTS มี dropdown "แหล่งเสียง" + "เสียง ElevenLabs"; แก้ค่าแล้วกด "บันทึก" → รีเฟรชแล้วค่ายังอยู่

- [ ] **Step 5: Commit**

```bash
git add public/control.html public/js/control.js
git commit -m "feat(control): add slip-verify and ElevenLabs voice settings to control panel"
```

---

## Task 10: Deploy — Dockerfile + DEPLOY.md (Linux)

**Files:**
- Modify: `Dockerfile` (COPY `lib`, `vendor/tessdata` ถ้ามี)
- Modify: `deploy/DEPLOY.md` (Linux + traineddata + env ใหม่)

**Interfaces:**
- Consumes: โครงไฟล์จาก Task 1-9
- Produces: image/คู่มือที่ deploy ฟีเจอร์ใหม่ได้

- [ ] **Step 1: แก้ `Dockerfile` ให้ COPY lib และ tessdata (ถ้ามี)**

แทนที่บล็อก COPY ซอร์ส (เดิม `Dockerfile:13-15`) ด้วย:

```dockerfile
# คัดลอกซอร์ส
COPY server.js ./
COPY lib ./lib
COPY public ./public
# traineddata แบบ offline (ถ้ามีโฟลเดอร์ vendor/tessdata จะถูกใช้; ถ้าไม่มี tesseract.js โหลดจาก CDN เอง)
COPY vendor* ./vendor
```

> หมายเหตุ: ถ้าไม่มีโฟลเดอร์ `vendor/` ในเครื่อง ให้สร้าง `vendor/.gitkeep` ไว้ก่อน เพื่อให้คำสั่ง COPY ไม่ล้มเหลว

- [ ] **Step 2: สร้าง placeholder ให้ vendor ไม่ทำให้ COPY ล้ม**

Run: `mkdir -p vendor/tessdata && touch vendor/.gitkeep`
Expected: มีโฟลเดอร์ `vendor/`

- [ ] **Step 3: แก้ `deploy/DEPLOY.md` — เพิ่มหัวข้อ Linux + OCR + ElevenLabs**

แทนที่เนื้อหาส่วนหัว/วิธีรันที่อิง Windows Server 2012 ด้วยแนวทาง Linux เป็นหลัก และเพิ่มหัวข้อใหม่ท้ายไฟล์:

```markdown
## 🐧 รันบน Linux (แนะนำ)

### ตัวเลือก A — Docker
```bash
cp .env.example .env   # ใส่ ELEVENLABS_API_KEY และค่าอื่น ๆ
docker compose up -d
docker compose logs -f
```
ข้อมูล (สลิป/สถิติ/ตั้งค่า/แคชเสียง) เก็บใน `./data` ผ่าน volume

### ตัวเลือก B — Native + pm2
```bash
npm install
cp .env.example .env && nano .env
npm install -g pm2
pm2 start server.js --name donate-overlay
pm2 save && pm2 startup
```

## 🧾 OCR (ตรวจสลิป)
- ใช้ `tesseract.js` — ครั้งแรกจะดาวน์โหลดไฟล์ภาษา `tha`/`eng` จาก CDN แล้วแคชไว้
- แบบ offline: ดาวน์โหลด `tha.traineddata` + `eng.traineddata` จาก
  https://github.com/tesseract-ocr/tessdata_fast วางใน `vendor/tessdata/`
  แล้วตั้ง `TESSDATA_PATH=/app/vendor/tessdata` ใน `.env`
- ปรับ timeout ได้ที่ `OCR_TIMEOUT_MS` (ดีฟอลต์ 20000)
- เปิด/ปิดการตรวจ และตั้งชื่อผู้รับได้จากหน้า Control Panel

## 🗣️ เสียง ElevenLabs
- ใส่ `ELEVENLABS_API_KEY` ใน `.env` (เว้นว่าง = ใช้เสียงเบราว์เซอร์อัตโนมัติ)
- เลือกเสียง/แหล่งเสียงได้จากหน้า Control Panel
- คิดเงินตามจำนวนตัวอักษร — ระบบแคชไฟล์เสียงข้อความซ้ำใน `data/tts/`
- ⚠️ ถ้าคีย์เคยถูกแชร์ในที่สาธารณะ ให้ revoke แล้วออกใหม่
```

- [ ] **Step 4: ตรวจด้วยมือ (manual, optional ถ้ามี docker)**

Run: `docker build -t donate-overlay .`
Expected: build ผ่าน (COPY lib/vendor ไม่ล้มเหลว) — ถ้าไม่มี docker ข้ามได้

- [ ] **Step 5: Commit**

```bash
git add Dockerfile deploy/DEPLOY.md vendor/.gitkeep
git commit -m "docs(deploy): linux deploy guide + dockerfile for OCR and ElevenLabs"
```

---

## Self-Review (ผู้เขียนแผนตรวจเองแล้ว)

- **Spec coverage:** ครบทุกส่วน — A.1 flow (Task 3), A.2 modules (Task 1,2,3), A.3 data model (Task 3), A.4 UI (Task 4,5), A.5 deploy (Task 10); B.1-B.4 (Task 6,7,8,9), B.5 ความปลอดภัย/แคช (Task 6,7,10). เทสต์ (Task 1,2,3,6,7)
- **Placeholder scan:** ไม่มี TBD/TODO; ทุกขั้นมีโค้ด/คำสั่ง/ผลคาดหวังจริง
- **Type consistency:** ชื่อฟังก์ชัน/คีย์ตรงกันข้าม task — `verifyOcrText`/`runOcr`/`getOrSynthesize`/`cachePathFor`, settings `verifyEnabled/expectedName/ttsProvider/ttsVoiceId`, `donation.verify.{status,nameFound,slipLike,text,at}`, `publicDonation.verify.{status,nameFound}` ใช้สอดคล้องกันทุกที่

## หมายเหตุ git

โฟลเดอร์นี้ยังไม่ใช่ git repository — ขั้น `git commit` ในแต่ละ task จะใช้ได้ต่อเมื่อ `git init` ก่อน (เสนอทำให้ตอนเริ่ม execute)
