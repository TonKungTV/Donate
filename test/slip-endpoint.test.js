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
