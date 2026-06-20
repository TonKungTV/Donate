'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

// ใช้โฟลเดอร์ชั่วคราว unique ต่อรอบรัน — กันข้อมูล (ref) ค้างจากรอบก่อนมาทำให้เจอ "duplicate" ผิด ๆ
// (saveDonations มี debounce 300ms ที่อาจเขียนไฟล์หลัง cleanup; การใช้ชื่อ unique จึงตัดปัญหานี้ทิ้ง)
const DATA_DIR = path.join(os.tmpdir(), `donate-dedup-${process.pid}-${Date.now()}`);
process.env.DATA_DIR_OVERRIDE = DATA_DIR;
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
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});
