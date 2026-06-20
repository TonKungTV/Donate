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

test('looksLikeSlip ไม่นับซ้ำจากคำที่เป็น substring กัน', () => {
  // 'จำนวนเงิน' มี 'จำนวน' ซ้อนอยู่ — ต้องนับเป็น 1 สัญญาณ ไม่ใช่ 2
  assert.strictEqual(looksLikeSlip('จำนวนเงิน').slipLike, false);
  assert.strictEqual(verifyOcrText('จำนวนเงิน', { expectedName: 'ธีรภัทร ปิ่นพรม' }).status, 'not_a_slip');
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
