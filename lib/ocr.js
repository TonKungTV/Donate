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
