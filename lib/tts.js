'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function cachePathFor(text, voiceId, model, dir) {
  const hash = crypto.createHash('sha1').update(`${text}|${voiceId}|${model}`).digest('hex');
  return path.join(dir, hash + '.mp3');
}

// เรียก ElevenLabs TTS -> คืน Buffer (MP3). inject fetchImpl ได้ตอนเทสต์
async function synthesize(text, opts) {
  const { voiceId, model, apiKey } = opts;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`ElevenLabs error ${res.status}: ${detail}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}

async function getOrSynthesize(text, opts) {
  const { voiceId, model, cacheDir } = opts;
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = cachePathFor(text, voiceId, model, cacheDir);
  if (fs.existsSync(file)) {
    return { buffer: fs.readFileSync(file), cached: true };
  }
  const buffer = await synthesize(text, opts);
  fs.writeFileSync(file, buffer);
  return { buffer, cached: false };
}

module.exports = { cachePathFor, synthesize, getOrSynthesize };
