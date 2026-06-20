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
  const spans = []; // ช่วง [start, end) ของ keyword ที่นับแล้ว
  const hits = [];
  // เรียงคำยาวก่อน เพื่อให้คำยาวจับช่วงก่อนคำที่เป็น substring ของมัน
  const sorted = list.slice().sort((a, b) => normalizeThai(b).length - normalizeThai(a).length);
  for (const kw of sorted) {
    const n = normalizeThai(kw);
    if (!n) continue;
    const idx = H.indexOf(n);
    if (idx === -1) continue;
    const start = idx, end = idx + n.length;
    // ข้ามถ้าทับกับ keyword ที่นับไปแล้ว (กันนับซ้ำจากคำที่เป็น substring กัน)
    if (spans.some(([s, e]) => start < e && end > s)) continue;
    spans.push([start, end]);
    hits.push(kw);
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

module.exports = {
  normalizeThai, levenshtein, fuzzyContains,
  looksLikeSlip, matchName, verifyOcrText,
  normalizeRef, extractRef, amountMatches,
  SLIP_KEYWORDS, SLIP_KEYWORD_MIN,
};
