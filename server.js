'use strict';

/**
 * Donate Overlay — เซิร์ฟเวอร์หลัก
 * Express + Socket.IO ทำงานร่วมกันเพื่อรับการบริจาคและส่งแจ้งเตือนแบบ real-time
 *
 * ขั้นตอนการบริจาค (PromptPay + สลิป):
 *   1) ผู้บริจาคกรอกชื่อ/จำนวนเงิน/ข้อความ -> สร้างรายการสถานะ "pending" + QR พร้อมเพย์
 *   2) ผู้บริจาคโอนเงินแล้วอัปโหลดสลิป -> ยืนยันอัตโนมัติ (สถานะ "confirmed")
 *      และยิงแจ้งเตือนขึ้น overlay + นับสถิติทันที (ไม่ต้องรอสตรีมเมอร์อนุมัติ)
 */

// โหลดตัวแปรจากไฟล์ .env ถ้ามี (ไม่บังคับ — ไม่ crash ถ้าไม่มี dotenv)
try { require('dotenv').config(); } catch (e) { /* dotenv ไม่ได้ติดตั้งก็ข้าม */ }

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const multer = require('multer');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');
const { verifyOcrText } = require('./lib/slip-verify');
const ocr = require('./lib/ocr'); // ใช้ ocr.runOcr เพื่อให้ mock ได้ตอนเทสต์

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // ถ้าตั้งค่าไว้ จะต้องใช้คีย์นี้สำหรับงานฝั่งแอดมิน
const CURRENCY = process.env.CURRENCY || '฿';
const PROMPTPAY_ID = process.env.PROMPTPAY_ID || '0634284604'; // เบอร์/เลขบัตรพร้อมเพย์ของสตรีมเมอร์

// ----- ที่เก็บข้อมูล -----
const DATA_DIR = process.env.DATA_DIR_OVERRIDE || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'donations.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SLIP_DIR = path.join(DATA_DIR, 'slips');
const TTS_DIR = path.join(DATA_DIR, 'tts');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** @type {Array<object>} */
let donations = [];

// ค่าตั้งต้นของ overlay (ปรับได้จากหน้า Control Panel)
const DEFAULT_SETTINGS = {
  duration: 8000,
  soundEnabled: true,
  volume: 0.6,
  ttsEnabled: true,
  ttsLang: 'th-TH',
  speakAmount: true,
  minTts: 0,
  confettiEnabled: true,
  accentColor: '#7c5cff',
  accentColor2: '#ffb454',
  textColor: '#ffffff',
  position: 'top', // top | center
  headlineTemplate: '{name} บริจาค {amount}',
  currency: CURRENCY,
  // ---- ตรวจสลิป (OCR) ----
  verifyEnabled: true,
  expectedName: 'ธีรภัทร ปิ่นพรม',
  // ---- เสียง ElevenLabs (ใช้ใน Task 7) ----
  ttsProvider: 'elevenlabs', // 'elevenlabs' | 'browser'
  ttsVoiceId: 'cgSgspJ2msm6clMCkdW9',
};
let settings = { ...DEFAULT_SETTINGS };

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('อ่านไฟล์ไม่สำเร็จ:', file, err.message);
  }
  return fallback;
}

function loadData() {
  const d = loadJSON(DATA_FILE, []);
  donations = Array.isArray(d) ? d : [];
  const s = loadJSON(SETTINGS_FILE, {});
  settings = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

let saveTimer = null;
function saveDonations() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      ensureDir(DATA_DIR);
      fs.writeFileSync(DATA_FILE, JSON.stringify(donations, null, 2), 'utf8');
    } catch (err) {
      console.error('บันทึกข้อมูลบริจาคไม่สำเร็จ:', err.message);
    }
  }, 300);
}

function saveSettings() {
  try {
    ensureDir(DATA_DIR);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('บันทึกการตั้งค่าไม่สำเร็จ:', err.message);
  }
}

loadData();

// ----- ฟังก์ชันช่วยเหลือ -----
function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  // กรองอักขระควบคุม (code < 32 หรือ = 127) ออก แล้วจำกัดความยาว
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.trim().slice(0, maxLen);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const confirmed = () => donations.filter((d) => d.status === 'confirmed');

/** สรุปสถิติรวม (เฉพาะรายการที่ยืนยันแล้ว) */
function buildStats() {
  const list = confirmed();
  const total = list.reduce((sum, d) => sum + d.amount, 0);
  const count = list.length;
  const top = list.reduce(
    (best, d) => (d.amount > (best ? best.amount : -1) ? d : best),
    null
  );
  return {
    total,
    count,
    average: count ? Math.round((total / count) * 100) / 100 : 0,
    top: top ? { name: top.name, amount: top.amount } : null,
    currency: settings.currency || CURRENCY,
  };
}

/** จัดอันดับผู้บริจาค โดยรวมยอดของชื่อเดียวกัน (เฉพาะที่ยืนยันแล้ว) */
function buildLeaderboard(limit = 10) {
  const map = new Map();
  for (const d of confirmed()) {
    const key = d.name.toLowerCase();
    const entry = map.get(key) || { name: d.name, total: 0, count: 0, lastAt: 0 };
    entry.total += d.amount;
    entry.count += 1;
    if (d.createdAt > entry.lastAt) {
      entry.lastAt = d.createdAt;
      entry.name = d.name;
    }
    map.set(key, entry);
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** รูปแบบรายการสำหรับส่งออก (แนบ URL สลิป) */
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

function broadcastUpdates() {
  io.emit('stats', buildStats());
  io.emit('leaderboard', buildLeaderboard());
}

// ----- การตรวจสอบ admin key (บังคับเฉพาะเมื่อมีการตั้งค่า ADMIN_KEY) -----
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return next();
  const key = req.get('x-admin-key') || req.query.key;
  if (key !== ADMIN_KEY) return res.status(403).json({ ok: false, error: 'ต้องใช้ admin key' });
  next();
}

// ----- การอัปโหลดสลิป (multer) -----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(SLIP_DIR);
    cb(null, SLIP_DIR);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.jpg')
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 5) || '.jpg';
    cb(null, makeId() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ'));
  },
});

// ----- Middleware -----
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// เสิร์ฟไฟล์สลิป (ชื่อไฟล์สุ่มเดายาก) — สตรีมเมอร์เปิดดูเพื่อเก็บหลักฐานได้
app.use('/slips', express.static(SLIP_DIR));

// ===== REST API =====

// สร้าง QR พร้อมเพย์ตามจำนวนเงิน (ไม่สร้างรายการบริจาค) — ใช้แสดงตัวอย่าง
app.get('/api/promptpay', async (req, res) => {
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'จำนวนเงินไม่ถูกต้อง' });
  }
  try {
    const payload = generatePayload(PROMPTPAY_ID, { amount });
    const qr = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
    res.json({ ok: true, qr, payload, promptpayId: PROMPTPAY_ID, amount });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'สร้าง QR ไม่สำเร็จ' });
  }
});

// ขั้นที่ 1: สร้างรายการบริจาค (pending) + คืน QR พร้อมเพย์
app.post('/api/donate', async (req, res) => {
  const name = sanitizeText(req.body.name, 40) || 'ผู้ไม่ประสงค์ออกนาม';
  const message = sanitizeText(req.body.message, 200);
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'จำนวนเงินไม่ถูกต้อง' });
  }
  if (amount > 1000000) {
    return res.status(400).json({ ok: false, error: 'จำนวนเงินสูงเกินไป' });
  }

  const donation = {
    id: makeId(),
    name,
    amount: Math.round(amount * 100) / 100,
    message,
    status: 'pending',
    slip: null,
    slipAt: null,
    confirmedAt: null,
    createdAt: Date.now(),
  };
  donations.push(donation);
  saveDonations();

  try {
    const payload = generatePayload(PROMPTPAY_ID, { amount: donation.amount });
    const qr = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
    res.json({ ok: true, donation: publicDonation(donation), qr, payload, promptpayId: PROMPTPAY_ID });
  } catch (err) {
    res.json({ ok: true, donation: publicDonation(donation), qr: null, error: 'สร้าง QR ไม่สำเร็จ' });
  }
});

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

// ประวัติ (ค่าเริ่มต้น = เฉพาะที่ยืนยันแล้ว)
app.get('/api/donations', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const status = req.query.status || 'confirmed';
  let list = status === 'all' ? donations : donations.filter((d) => d.status === status);
  list = list.slice(-limit).reverse().map(publicDonation);
  res.json({ ok: true, donations: list });
});

// สถิติ / leaderboard
app.get('/api/stats', (req, res) => res.json({ ok: true, stats: buildStats() }));
app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  res.json({ ok: true, leaderboard: buildLeaderboard(limit) });
});

// ----- การตั้งค่า overlay -----
function applySettings(input) {
  const s = { ...settings };
  const num = (v, min, max, def) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  };
  if (input.duration !== undefined) s.duration = num(input.duration, 1000, 60000, s.duration);
  if (input.volume !== undefined) s.volume = num(input.volume, 0, 1, s.volume);
  if (input.minTts !== undefined) s.minTts = num(input.minTts, 0, 1000000, s.minTts);
  if (input.soundEnabled !== undefined) s.soundEnabled = !!input.soundEnabled;
  if (input.ttsEnabled !== undefined) s.ttsEnabled = !!input.ttsEnabled;
  if (input.speakAmount !== undefined) s.speakAmount = !!input.speakAmount;
  if (input.confettiEnabled !== undefined) s.confettiEnabled = !!input.confettiEnabled;
  if (typeof input.ttsLang === 'string') s.ttsLang = sanitizeText(input.ttsLang, 12) || s.ttsLang;
  if (typeof input.position === 'string') s.position = input.position === 'center' ? 'center' : 'top';
  if (typeof input.headlineTemplate === 'string') s.headlineTemplate = sanitizeText(input.headlineTemplate, 120) || s.headlineTemplate;
  if (typeof input.currency === 'string') s.currency = sanitizeText(input.currency, 6) || s.currency;
  const hex = (v, def) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : def);
  if (input.accentColor !== undefined) s.accentColor = hex(input.accentColor, s.accentColor);
  if (input.accentColor2 !== undefined) s.accentColor2 = hex(input.accentColor2, s.accentColor2);
  if (input.textColor !== undefined) s.textColor = hex(input.textColor, s.textColor);
  if (input.verifyEnabled !== undefined) s.verifyEnabled = !!input.verifyEnabled;
  if (typeof input.expectedName === 'string') s.expectedName = sanitizeText(input.expectedName, 60) || s.expectedName;
  if (typeof input.ttsProvider === 'string') s.ttsProvider = input.ttsProvider === 'browser' ? 'browser' : 'elevenlabs';
  if (typeof input.ttsVoiceId === 'string') s.ttsVoiceId = sanitizeText(input.ttsVoiceId, 40) || s.ttsVoiceId;
  return s;
}

app.get('/api/settings', (req, res) => res.json({ ok: true, settings }));

app.post('/api/settings', requireAdmin, (req, res) => {
  settings = applySettings(req.body || {});
  saveSettings();
  io.emit('settings', settings);
  res.json({ ok: true, settings });
});

// คืนค่าเริ่มต้น
app.post('/api/settings/reset', requireAdmin, (req, res) => {
  settings = { ...DEFAULT_SETTINGS };
  saveSettings();
  io.emit('settings', settings);
  res.json({ ok: true, settings });
});

// ล้างประวัติทั้งหมด
app.delete('/api/donations', requireAdmin, (req, res) => {
  donations = [];
  saveDonations();
  broadcastUpdates();
  res.json({ ok: true });
});

// ----- Socket.IO -----
io.on('connection', (socket) => {
  socket.emit('settings', settings);
  socket.emit('stats', buildStats());
  socket.emit('leaderboard', buildLeaderboard());

  // ยิงแจ้งเตือนทดสอบ (ไม่บันทึกลงสถิติ)
  socket.on('test-alert', (payload = {}) => {
    io.emit('donation', {
      id: makeId(),
      name: sanitizeText(payload.name, 40) || 'ผู้ทดสอบ',
      amount: Math.max(1, Number(payload.amount) || 99),
      message: sanitizeText(payload.message, 200) || 'นี่คือข้อความทดสอบ ขอบคุณครับ! 🎉',
      createdAt: Date.now(),
      test: true,
    });
  });
});

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
