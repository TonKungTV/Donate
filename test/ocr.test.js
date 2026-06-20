'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { withTimeout, tessOptionsFor } = require('../lib/ocr');

test('withTimeout: resolve ทันถ้าเสร็จก่อนเวลา', async () => {
  const r = await withTimeout(Promise.resolve('ok'), 1000);
  assert.strictEqual(r, 'ok');
});

test('withTimeout: reject เมื่อเกินเวลา', async () => {
  const slow = new Promise((res) => setTimeout(() => res('late'), 50));
  await assert.rejects(() => withTimeout(slow, 5, 'หมดเวลา OCR'), /หมดเวลา OCR/);
});

test('tessOptionsFor: โฟลเดอร์ traineddata ว่าง -> โหมด CDN (ไม่ตั้ง langPath)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tess-'));
  const o = tessOptionsFor({ langPath: dir });
  assert.strictEqual(o.langPath, undefined); // ต้องไม่ชี้ไปโฟลเดอร์ว่าง (กัน crash)
  assert.ok(o.cachePath); // มีที่แคชสำหรับโหลดจาก CDN
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tessOptionsFor: มีไฟล์ .traineddata.gz -> offline + gzip true', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tess-'));
  fs.writeFileSync(path.join(dir, 'eng.traineddata.gz'), 'x');
  const o = tessOptionsFor({ langPath: dir });
  assert.strictEqual(o.langPath, dir);
  assert.strictEqual(o.gzip, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tessOptionsFor: มีไฟล์ .traineddata (ไม่บีบอัด) -> offline + gzip false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tess-'));
  fs.writeFileSync(path.join(dir, 'tha.traineddata'), 'x');
  const o = tessOptionsFor({ langPath: dir });
  assert.strictEqual(o.langPath, dir);
  assert.strictEqual(o.gzip, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
