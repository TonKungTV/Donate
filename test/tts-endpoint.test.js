'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR_OVERRIDE = path.join(__dirname, '..', 'data-test-tts');
process.env.ELEVENLABS_API_KEY = 'test-key';
const tts = require('../lib/tts');
const request = require('supertest');
const { app } = require('../server');

test('GET /api/tts ไม่มี text -> 400', async () => {
  const res = await request(app).get('/api/tts');
  assert.strictEqual(res.status, 400);
});

test('GET /api/tts -> คืน audio/mpeg', async () => {
  tts.getOrSynthesize = async () => ({ buffer: Buffer.from('AUDIO'), cached: false });
  const res = await request(app).get('/api/tts').query({ text: 'สวัสดี' });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['content-type'], /audio\/mpeg/);
});

test('GET /api/tts -> 502 เมื่อ ElevenLabs ล้มเหลว (ให้ overlay fallback)', async () => {
  tts.getOrSynthesize = async () => { throw new Error('boom'); };
  const res = await request(app).get('/api/tts').query({ text: 'x' });
  assert.strictEqual(res.status, 502);
});

test.after(() => {
  fs.rmSync(path.join(__dirname, '..', 'data-test-tts'), { recursive: true, force: true });
});
