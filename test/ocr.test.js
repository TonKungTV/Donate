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
