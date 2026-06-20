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

// หาไฟล์ traineddata จริงในโฟลเดอร์ (รองรับทั้ง .traineddata และ .traineddata.gz)
function listTraineddata(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.includes('.traineddata'));
  } catch (e) {
    return []; // ไม่มีโฟลเดอร์ = ถือว่าไม่มีไฟล์ offline
  }
}

// เลือก options ของ tesseract.js:
//  - ถ้ามีไฟล์ traineddata จริง (offline) -> โหลดจากเครื่อง (ตั้ง gzip ตามนามสกุลไฟล์)
//  - ถ้าไม่มี -> โหลดจาก CDN แล้วแคชไว้ที่ data/tesscache
//    (โฟลเดอร์ว่างเปล่าต้องไม่ทำให้ชี้ langPath ไปที่นั่น มิฉะนั้น tesseract.js จะหาไฟล์ไม่เจอแล้ว crash)
function tessOptionsFor(opts) {
  opts = opts || {};
  const offlineDir =
    opts.langPath ||
    process.env.TESSDATA_PATH ||
    path.join(__dirname, '..', 'vendor', 'tessdata');
  const files = listTraineddata(offlineDir);
  if (files.length) {
    return {
      langPath: offlineDir,
      cachePath: offlineDir,
      gzip: files.some((f) => f.endsWith('.gz')),
    };
  }
  // โหมด CDN: แคชไฟล์ที่โหลดมาไว้ใต้ data/ (gitignored) ไม่รก repo และไม่ไปกระตุ้น offline-detection ข้างบน
  const cacheDir = path.join(__dirname, '..', 'data', 'tesscache');
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) { /* สร้างไม่ได้ก็ใช้ค่า default ของ tesseract.js */ }
  return { cachePath: cacheDir };
}

async function getWorker(opts) {
  if (!workerPromise) {
    const langs = (opts && opts.langs) || 'tha+eng';
    const options = tessOptionsFor(opts);
    // กัน tesseract.js โยน error แบบ global (process.nextTick throw) ที่ทำให้ทั้ง process crash —
    // error จะถูกส่งกลับเป็น rejected promise แทน ให้ runOcr/server จับได้ (fail-open)
    options.errorHandler = () => {};
    workerPromise = createWorker(langs, 1, options);
    // ถ้าสร้าง worker ไม่สำเร็จ (เช่น โหลดภาษาไม่ได้) อย่าให้ singleton ค้างเป็นตัวพัง — ล้างเพื่อให้ลองใหม่ได้
    workerPromise.catch(() => { workerPromise = null; });
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

module.exports = { withTimeout, runOcr, terminate, tessOptionsFor };
