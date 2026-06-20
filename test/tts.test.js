'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { cachePathFor, getOrSynthesize } = require('../lib/tts');

test('cachePathFor: แฮชเสถียร และเปลี่ยนตาม voice/model', () => {
  const dir = '/tmp/x';
  const a = cachePathFor('สวัสดี', 'v1', 'm1', dir);
  const b = cachePathFor('สวัสดี', 'v1', 'm1', dir);
  const c = cachePathFor('สวัสดี', 'v2', 'm1', dir);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.ok(a.endsWith('.mp3'));
});

test('getOrSynthesize: cache miss -> เรียก fetch แล้วเขียนไฟล์', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, arrayBuffer: async () => Buffer.from('AUDIO').buffer }; };
  const r1 = await getOrSynthesize('ทดสอบ', { voiceId: 'v', model: 'm', apiKey: 'k', cacheDir, fetchImpl });
  assert.strictEqual(r1.cached, false);
  assert.strictEqual(calls, 1);
  // ครั้งที่สอง = cache hit ไม่เรียก fetch
  const r2 = await getOrSynthesize('ทดสอบ', { voiceId: 'v', model: 'm', apiKey: 'k', cacheDir, fetchImpl });
  assert.strictEqual(r2.cached, true);
  assert.strictEqual(calls, 1);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('synthesize ผ่าน getOrSynthesize: โยน error เมื่อ response ไม่ ok', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(() => getOrSynthesize('x', { voiceId: 'v', model: 'm', apiKey: 'bad', cacheDir, fetchImpl }), /401/);
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

test('getOrSynthesize ส่ง request ถูก endpoint/headers/body', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, arrayBuffer: async () => Buffer.from('AUDIO').buffer };
  };
  await getOrSynthesize('สวัสดี', { voiceId: 'VOICE123', model: 'eleven_multilingual_v2', apiKey: 'KEY', cacheDir, fetchImpl });
  assert.strictEqual(captured.url, 'https://api.elevenlabs.io/v1/text-to-speech/VOICE123');
  assert.strictEqual(captured.opts.method, 'POST');
  assert.strictEqual(captured.opts.headers['xi-api-key'], 'KEY');
  assert.match(captured.opts.headers['Content-Type'], /application\/json/);
  const body = JSON.parse(captured.opts.body);
  assert.strictEqual(body.text, 'สวัสดี');
  assert.strictEqual(body.model_id, 'eleven_multilingual_v2');
  assert.ok(body.voice_settings && typeof body.voice_settings.stability === 'number');
  fs.rmSync(cacheDir, { recursive: true, force: true });
});
