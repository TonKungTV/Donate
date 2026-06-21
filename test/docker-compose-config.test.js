'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('docker compose passes ElevenLabs configuration from .env into the app container', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');

  assert.match(compose, /ELEVENLABS_API_KEY=\$\{ELEVENLABS_API_KEY:-\}/);
  assert.match(compose, /ELEVENLABS_MODEL=\$\{ELEVENLABS_MODEL:-eleven_v3\}/);
});
