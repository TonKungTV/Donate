# Prevent Duplicate Slips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** กันการนำสลิปใบเดิมมาส่งซ้ำ ด้วยการจับเลขอ้างอิงรายการซ้ำ (บล็อก) + เติมสตางค์สุ่มในยอดโอนแล้วเช็คยอดในสลิป (ติดธง)

**Architecture:** เพิ่มฟังก์ชัน pure ใน `lib/slip-verify.js` (`normalizeRef`, `extractRef`, `amountMatches`) แล้วต่อสายใน `server.js` — `/api/donate` เติมสตางค์, `/api/donations/:id/slip` เช็ค ref ซ้ำ (จาก `donations[]`) + เทียบยอด. หน้าเว็บแสดงข้อความ/ป้ายเพิ่ม

**Tech Stack:** Node 16+, Express, `node:test` + `supertest`

## Global Constraints

- สวิตช์ `settings.verifyEnabled` (มีอยู่แล้ว) คุมทั้งสตางค์สุ่ม + เช็ค ref ซ้ำ + เช็คยอด (ปิด = ไม่ทำทั้งหมด)
- เลขอ้างอิง (ref) ซ้ำ → **บล็อก** (`400 { ok:false, reason:'duplicate', error:'สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปการโอนจริงครั้งใหม่' }`) + ลบไฟล์ + donation คงสถานะ `pending`
- ยอดในสลิปไม่ตรง → **ติดธงเท่านั้น ไม่บล็อก** (กัน OCR อ่านเลขเพี้ยน)
- `verify.ref` และ `verify.text` **ห้าม**ออก API สาธารณะ; `verify.amountMatch` เปิดเผยได้
- dedup ดึงจาก `donations[]` ที่ `status==='confirmed'` (เทียบ ref แบบ normalize) — ไม่มีไฟล์ persistence ใหม่
- สตางค์สุ่มช่วง `1..99` (= 0.01–0.99)
- ตรรกะใน `lib/slip-verify.js` ต้อง pure (ไม่มี I/O)
- ตัวรันเทสต์ `npm test` → `node --test`; ชุดเทสต์ปัจจุบัน 24 ผ่าน ต้องคงเขียว

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `lib/slip-verify.js` | เพิ่ม `normalizeRef`, `extractRef`, `amountMatches` | แก้ |
| `test/slip-verify.test.js` | เทสต์ฟังก์ชันใหม่ | แก้ |
| `server.js` | สตางค์ใน `/api/donate`; ref-dup + amount ใน slip endpoint; `verify` fields; `publicDonation`; `isDuplicateRef` | แก้ |
| `test/dedup.test.js` | เทสต์ endpoint (สตางค์/ref ซ้ำ/ยอด/ไม่หลุด ref) | สร้างใหม่ |
| `public/js/donate.js` | ข้อความเมื่อเจอ `reason:'duplicate'` | แก้ |
| `public/js/dashboard.js` | ป้าย "⚠️ ยอดไม่ตรง" เมื่อ `amountMatch===false` | แก้ |

---

## Task 1: `lib/slip-verify.js` — ฟังก์ชันดึง ref + เทียบยอด (pure)

**Files:**
- Modify: `lib/slip-verify.js` (เพิ่มฟังก์ชัน + export)
- Modify: `test/slip-verify.test.js` (เพิ่มเทสต์ + import)

**Interfaces:**
- Consumes: (ไม่มี)
- Produces:
  - `normalizeRef(s: string) => string` — uppercase, คงเฉพาะ `A-Z0-9`
  - `extractRef(text: string) => string | null` — เลขอ้างอิง normalize แล้ว หรือ null
  - `amountMatches(text: string, expected: number) => true | false | null`

- [ ] **Step 1: เขียนเทสต์ที่ยังล้มเหลว** — เพิ่มท้าย `test/slip-verify.test.js`

แก้บรรทัด import บนสุดของไฟล์ ให้ดึงฟังก์ชันใหม่เพิ่ม (ของเดิมมี `normalizeThai, levenshtein, fuzzyContains, looksLikeSlip, matchName, verifyOcrText`):

```js
const {
  normalizeThai, levenshtein, fuzzyContains,
  looksLikeSlip, matchName, verifyOcrText,
  normalizeRef, extractRef, amountMatches,
} = require('../lib/slip-verify');
```

เพิ่มเทสต์ต่อท้ายไฟล์:

```js
test('normalizeRef: uppercase + ตัดอักขระอื่น', () => {
  assert.strictEqual(normalizeRef(' ab-12 cd '), 'AB12CD');
  assert.strictEqual(normalizeRef(null), '');
});

test('extractRef: หลังคำชี้ / fallback / ไม่มี', () => {
  assert.strictEqual(extractRef('รหัสอ้างอิง: 0150ABC7890'), '0150ABC7890');
  assert.strictEqual(extractRef('เลขที่รายการ 202406211234XYZ'), '202406211234XYZ');
  assert.strictEqual(extractRef('โอนเงิน abc 0123456789012345 บาท'), '0123456789012345');
  assert.strictEqual(extractRef('โอนเงินสำเร็จ 50 บาท'), null);
});

test('amountMatches: ตรง / ไม่ตรง / ไม่มียอด / ทน comma / กัน substring', () => {
  assert.strictEqual(amountMatches('จำนวนเงิน 50.37 บาท', 50.37), true);
  assert.strictEqual(amountMatches('จำนวนเงิน 1,050.37 บาท', 1050.37), true);
  assert.strictEqual(amountMatches('จำนวน 99.00 บาท', 50.37), false);
  assert.strictEqual(amountMatches('โอนสำเร็จ ขอบคุณครับ', 50.37), null);
  assert.strictEqual(amountMatches('ยอด 150.37 บาท', 50.37), false);
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `node --test test/slip-verify.test.js`
Expected: FAIL — `normalizeRef`/`extractRef`/`amountMatches` is not a function (undefined)

- [ ] **Step 3: เขียน implementation** — เพิ่มใน `lib/slip-verify.js` (ก่อนบรรทัด `module.exports`)

```js
function normalizeRef(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ดึงเลขอ้างอิงรายการจากข้อความ OCR (normalize แล้ว) หรือ null ถ้าหาไม่ได้
function extractRef(text) {
  if (typeof text !== 'string' || !text) return null;
  const labels = ['รหัสอ้างอิง', 'เลขที่รายการ', 'หมายเลขอ้างอิง', 'เลขอ้างอิง', 'reference', 'ref'];
  const lower = text.toLowerCase();
  for (const label of labels) {
    const idx = lower.indexOf(label.toLowerCase());
    if (idx === -1) continue;
    const after = text.slice(idx + label.length);
    const m = after.match(/[A-Za-z0-9]{8,}/);
    if (m) return normalizeRef(m[0]);
  }
  // fallback: โทเค็น [A-Za-z0-9] ที่ยาวที่สุดและ >= 12 ตัว (เลข ref มักยาวสุดในสลิป)
  const tokens = text.match(/[A-Za-z0-9]{12,}/g) || [];
  if (tokens.length) {
    const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a));
    return normalizeRef(longest);
  }
  return null;
}

// เทียบยอดในสลิปกับยอดที่ต้องโอน: true=ตรง, false=เจอยอดอื่นแต่ไม่ตรง, null=อ่านยอดไม่ได้
function amountMatches(text, expected) {
  if (typeof text !== 'string') return null;
  const norm = text.replace(/[\s,]/g, '');
  const expectedStr = Number(expected).toFixed(2);
  const re = new RegExp('(?<![\\d.])' + expectedStr.replace(/\./g, '\\.') + '(?!\\d)');
  if (re.test(norm)) return true;
  if (/\d+\.\d{2}/.test(norm)) return false;
  return null;
}
```

แก้ `module.exports` ให้รวมฟังก์ชันใหม่ (ของเดิม export `normalizeThai, levenshtein, fuzzyContains, looksLikeSlip, matchName, verifyOcrText, SLIP_KEYWORDS, SLIP_KEYWORD_MIN`):

```js
module.exports = {
  normalizeThai, levenshtein, fuzzyContains,
  looksLikeSlip, matchName, verifyOcrText,
  normalizeRef, extractRef, amountMatches,
  SLIP_KEYWORDS, SLIP_KEYWORD_MIN,
};
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้งหมด (24 เดิม + 3 ใหม่ = 27)

- [ ] **Step 5: Commit**

```bash
git add lib/slip-verify.js test/slip-verify.test.js
git commit -m "feat(verify): add ref extraction and slip-amount matching helpers"
```

---

## Task 2: `server.js` — สตางค์สุ่ม + เช็ค ref ซ้ำ + เทียบยอด

**Files:**
- Modify: `server.js` (import, `/api/donate`, slip endpoint, `publicDonation`, `confirmAndBroadcast`, `isDuplicateRef`)
- Create: `test/dedup.test.js`

**Interfaces:**
- Consumes: `extractRef`, `amountMatches`, `normalizeRef` (Task 1); `verifyOcrText`, `ocr.runOcr` (เดิม)
- Produces:
  - `donation.amount` มีสตางค์สุ่มเมื่อ `verifyEnabled`
  - `donation.verify` เพิ่ม `ref: string|null`, `amountMatch: true|false|null`
  - `publicDonation(d).verify = { status, nameFound, amountMatch }` (ไม่มี `ref`/`text`)
  - response slip endpoint เพิ่ม `reason:'duplicate'` (400) เมื่อ ref ซ้ำ

- [ ] **Step 1: เขียนเทสต์ที่ยังล้มเหลว** — สร้าง `test/dedup.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const request = require('supertest');

process.env.DATA_DIR_OVERRIDE = path.join(__dirname, '..', 'data-test-dedup');
const ocr = require('../lib/ocr');
const { app } = require('../server');

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

async function createDonation(amount) {
  const res = await request(app).post('/api/donate').send({ name: 'tester', amount, message: '' });
  return res.body.donation; // { id, amount, ... }
}

test('/api/donate เติมสตางค์เมื่อ verifyEnabled (ยอดลงท้าย .01-.99)', async () => {
  const d = await createDonation(50);
  const satang = Math.round((d.amount - Math.floor(d.amount)) * 100);
  assert.ok(satang >= 1 && satang <= 99, 'satang should be 1..99, got ' + satang);
});

test('ref ใหม่ + ยอดตรง -> ยืนยัน + amountMatch true', async () => {
  const d = await createDonation(50);
  ocr.runOcr = async () => `โอนเงินสำเร็จ จำนวนเงิน ${d.amount.toFixed(2)} บาท พร้อมเพย์ ไปยัง ธีรภัทร ปิ่นพรม รหัสอ้างอิง REFAAA11122233`;
  const res = await request(app).post('/api/donations/' + d.id + '/slip').attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.verify.amountMatch, true);
});

test('ref ซ้ำกับรายการก่อนหน้า -> 400 duplicate + ไม่ยืนยัน', async () => {
  const d1 = await createDonation(50);
  ocr.runOcr = async () => `โอนเงินสำเร็จ ${d1.amount.toFixed(2)} บาท ธีรภัทร ปิ่นพรม รหัสอ้างอิง DUP999000111`;
  await request(app).post('/api/donations/' + d1.id + '/slip').attach('slip', PNG_1x1, 'x.png');

  const d2 = await createDonation(70);
  ocr.runOcr = async () => `โอนเงินสำเร็จ ${d2.amount.toFixed(2)} บาท ธีรภัทร ปิ่นพรม รหัสอ้างอิง DUP999000111`;
  const res = await request(app).post('/api/donations/' + d2.id + '/slip').attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.reason, 'duplicate');
});

test('ยอดไม่ตรง -> ยืนยัน (ไม่บล็อก) + amountMatch false', async () => {
  const d = await createDonation(50);
  ocr.runOcr = async () => `โอนเงินสำเร็จ จำนวนเงิน 999.00 บาท ธีรภัทร ปิ่นพรม รหัสอ้างอิง NEWREF55566677`;
  const res = await request(app).post('/api/donations/' + d.id + '/slip').attach('slip', PNG_1x1, 'x.png');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.verify.amountMatch, false);
});

test('publicDonation ไม่หลุด verify.ref / verify.text', async () => {
  const d = await createDonation(50);
  ocr.runOcr = async () => `โอนเงินสำเร็จ ${d.amount.toFixed(2)} บาท ธีรภัทร ปิ่นพรม รหัสอ้างอิง SECRET12345678`;
  await request(app).post('/api/donations/' + d.id + '/slip').attach('slip', PNG_1x1, 'x.png');
  const list = await request(app).get('/api/donations?status=all');
  const item = list.body.donations.find((x) => x.id === d.id);
  assert.ok(item.verify);
  assert.strictEqual(item.verify.ref, undefined);
  assert.strictEqual(item.verify.text, undefined);
  assert.strictEqual(item.verify.amountMatch, true);
});

test.after(async () => {
  await ocr.terminate().catch(() => {});
  fs.rmSync(path.join(__dirname, '..', 'data-test-dedup'), { recursive: true, force: true });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้มเหลว**

Run: `node --test test/dedup.test.js`
Expected: FAIL (ยังไม่มีสตางค์/dup/amountMatch — เช่น satang test เจอ 0, amountMatch undefined, duplicate ไม่ใช่ 400)

- [ ] **Step 3: แก้ import ใน `server.js`**

แก้บรรทัด (เดิม `server.js:24`):

```js
const { verifyOcrText } = require('./lib/slip-verify');
```

เป็น:

```js
const { verifyOcrText, extractRef, amountMatches, normalizeRef } = require('./lib/slip-verify');
```

- [ ] **Step 4: เติมสตางค์สุ่มใน `/api/donate`**

ในบล็อกสร้าง `donation` (เดิม `server.js:260-270`) แทนที่บรรทัด `amount: Math.round(amount * 100) / 100,` ด้วยการคำนวณ `finalAmount` ก่อนสร้างออบเจกต์ — แก้ช่วงนี้:

```js
  const donation = {
    id: makeId(),
    name,
    amount: Math.round(amount * 100) / 100,
    message,
```

ให้เป็น:

```js
  // เติมสตางค์สุ่ม 0.01-0.99 เพื่อให้ยอด unique (กันสลิปซ้ำ) — เฉพาะเมื่อเปิดตรวจสลิป
  let finalAmount = Math.round(amount * 100) / 100;
  if (settings.verifyEnabled) {
    const satang = Math.floor(Math.random() * 99) + 1; // 1..99
    finalAmount = Math.round(Math.floor(amount) * 100 + satang) / 100;
  }

  const donation = {
    id: makeId(),
    name,
    amount: finalAmount,
    message,
```

- [ ] **Step 5: เพิ่ม `isDuplicateRef` helper**

วางฟังก์ชันนี้เหนือ handler slip endpoint (เช่น เหนือบรรทัด `// ขั้นที่ 2: อัปโหลดสลิป` เดิม `server.js:283`):

```js
// มีสลิปที่เลขอ้างอิงนี้ถูกยืนยันไปแล้วหรือยัง (กันส่งซ้ำ)
function isDuplicateRef(ref) {
  const target = normalizeRef(ref);
  if (!target) return false;
  return donations.some((d) =>
    d.status === 'confirmed' && d.verify && normalizeRef(d.verify.ref) === target);
}
```

- [ ] **Step 6: เพิ่มเช็ค ref ซ้ำ + amountMatch ในการ slip endpoint**

ในแฮนเดิล (เดิม `server.js:312-329`) แทนที่ตั้งแต่บล็อก `// ไม่ใช่สลิป` จนถึงก่อน `return confirmAndBroadcast(...)` ด้วย:

```js
    // ไม่ใช่สลิป -> ปฏิเสธ + ลบไฟล์ทิ้ง
    if (result.status === 'not_a_slip') {
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      return res.status(400).json({
        ok: false, reason: 'not_a_slip',
        error: 'นี่ไม่ใช่สลิปการโอน หรืออ่านไม่ออก กรุณาแนบสลิปที่ชัดเจน',
      });
    }

    // เช็คเลขอ้างอิงซ้ำ -> บล็อก (เฉพาะเมื่อ OCR ไม่ error และอ่าน ref ได้)
    const ref = result.status === 'error' ? null : extractRef(ocrText);
    if (ref && isDuplicateRef(ref)) {
      try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
      return res.status(400).json({
        ok: false, reason: 'duplicate',
        error: 'สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปการโอนจริงครั้งใหม่',
      });
    }

    // เทียบยอดในสลิปกับยอดที่ต้องโอน (มีสตางค์สุ่ม) — ไม่ตรง = ติดธง ไม่บล็อก
    const amountMatch = result.status === 'error' ? null : amountMatches(ocrText, donation.amount);

    // verified / unverified / error -> ยืนยัน + ติดธงตามผล
    donation.verify = {
      status: result.status,
      nameFound: result.nameFound !== undefined ? result.nameFound : null,
      slipLike: result.slipLike !== undefined ? result.slipLike : null,
      ref: ref || null,
      amountMatch,
      text: ocrText,
      at: Date.now(),
    };
    return confirmAndBroadcast(donation, req.file.filename, res);
```

- [ ] **Step 7: เปิดเผย `amountMatch` ใน `publicDonation` + response**

แก้บรรทัด `verify` ใน `publicDonation` (เดิม `server.js:181`):

```js
    verify: d.verify ? { status: d.verify.status, nameFound: d.verify.nameFound } : null,
```

เป็น:

```js
    verify: d.verify ? { status: d.verify.status, nameFound: d.verify.nameFound, amountMatch: d.verify.amountMatch != null ? d.verify.amountMatch : null } : null,
```

แก้บรรทัด response ใน `confirmAndBroadcast` (เดิม `server.js:348`):

```js
  res.json({ ok: true, verify: donation.verify ? { status: donation.verify.status, nameFound: donation.verify.nameFound } : null });
```

เป็น:

```js
  res.json({ ok: true, verify: donation.verify ? { status: donation.verify.status, nameFound: donation.verify.nameFound, amountMatch: donation.verify.amountMatch != null ? donation.verify.amountMatch : null } : null });
```

- [ ] **Step 8: รันชุดเทสต์ทั้งหมดให้ผ่าน**

Run: `npm test`
Expected: PASS ทั้งหมด (27 จาก Task 1 + 5 ใหม่ใน dedup = 32) และ slip-endpoint เดิมยังเขียว (ref สั้น "1" → extractRef คืน null จึงไม่ทริกเกอร์ duplicate)

- [ ] **Step 9: Commit**

```bash
git add server.js test/dedup.test.js
git commit -m "feat(verify): block duplicate slip refs and verify unique satang amount"
```

---

## Task 3: หน้าเว็บ — ข้อความสลิปซ้ำ + ป้ายยอดไม่ตรง

**Files:**
- Modify: `public/js/donate.js` (เพิ่มสาขา `reason:'duplicate'`)
- Modify: `public/js/dashboard.js` (ป้าย "⚠️ ยอดไม่ตรง")

**Interfaces:**
- Consumes: response `reason:'duplicate'` (Task 2); `d.verify.amountMatch` จาก `/api/donations` (Task 2)
- Produces: (UX เท่านั้น)

- [ ] **Step 1: เพิ่มสาขา duplicate ใน `public/js/donate.js`**

ในแฮนเดิลปุ่มยืนยัน หาส่วนจัดการ response (มีสาขา `data.reason === 'not_a_slip'` อยู่แล้ว) เพิ่มสาขา `duplicate` ต่อจากนั้น — แทนที่:

```js
      } else if (data.reason === 'not_a_slip') {
        showToast(toast2, '❌ ไม่ใช่สลิป หรืออ่านไม่ออก แนบสลิปที่ชัดเจน', 'err');
      } else {
```

ด้วย:

```js
      } else if (data.reason === 'not_a_slip') {
        showToast(toast2, '❌ ไม่ใช่สลิป หรืออ่านไม่ออก แนบสลิปที่ชัดเจน', 'err');
      } else if (data.reason === 'duplicate') {
        showToast(toast2, '❌ สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปการโอนจริงครั้งใหม่', 'err');
      } else {
```

- [ ] **Step 2: เพิ่มป้าย "ยอดไม่ตรง" ใน `public/js/dashboard.js`**

ในฟังก์ชัน `renderHistory()` หาบล็อกที่ append `verify-badge` (ป้ายสถานะชื่อ) ที่ลงท้ายด้วย `right.append(badge);` แล้วปิดด้วย `}` — เพิ่มบล็อกนี้ต่อท้ายทันที (ก่อน `li.append(left, amount, right);`):

```js
      if (d.verify && d.verify.amountMatch === false) {
        const ab = document.createElement('span');
        ab.className = 'verify-badge v-warn';
        ab.textContent = '⚠️ ยอดไม่ตรง';
        ab.style.cssText = 'display:block;font-size:.72rem;margin-top:2px';
        right.append(ab);
        li.classList.add('flagged-unverified');
      }
```

(ใช้คลาส `v-warn` และ `flagged-unverified` ที่มีอยู่แล้วใน `site.css` — ไม่ต้องเพิ่ม CSS)

- [ ] **Step 3: ตรวจ syntax**

Run: `node --check public/js/donate.js && node --check public/js/dashboard.js && echo OK`
Expected: `OK`

- [ ] **Step 4: ตรวจด้วยมือ (manual)**

Run: `npm start` → เปิด `/`; บริจาคด้วยสลิปที่มีเลขอ้างอิงเดียวกับที่เคยส่งสำเร็จ → ขึ้น "❌ สลิปนี้ถูกใช้ไปแล้ว"; ลองสลิปยอดไม่ตรง → ผ่านแต่ใน `/dashboard.html` ขึ้นป้าย "⚠️ ยอดไม่ตรง"

- [ ] **Step 5: Commit**

```bash
git add public/js/donate.js public/js/dashboard.js
git commit -m "feat(verify): show duplicate-slip message and amount-mismatch badge"
```

---

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

- **Spec coverage:** ส่วนที่ 1 สตางค์ (Task 2 Step 4); ส่วนที่ 2 ฟังก์ชัน pure (Task 1); ส่วนที่ 3 เช็คตอนอัปสลิป + verify fields + dedup (Task 2); ส่วนที่ 4 หน้าเว็บ (Task 3); ส่วนที่ 5 เทสต์ (Task 1+2). ครบ
- **Placeholder scan:** ไม่มี TBD/TODO; ทุกขั้นมีโค้ด/คำสั่ง/ผลคาดหวังจริง
- **Type consistency:** `normalizeRef/extractRef/amountMatches` ใช้ชื่อ/พารามิเตอร์ตรงกันทั้ง Task 1 (นิยาม) และ Task 2 (เรียก); `verify.{ref,amountMatch}` และ `reason:'duplicate'` สอดคล้องกันระหว่าง server, เทสต์, และหน้าเว็บ
