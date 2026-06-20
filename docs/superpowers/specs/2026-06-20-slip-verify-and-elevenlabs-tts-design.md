# สเปก: ตรวจสลิป OCR + เสียง ElevenLabs

วันที่: 2026-06-20
โปรเจกต์: Donate Overlay (Express + Socket.IO, Node 16+) — **deploy บน Linux** (Docker / systemd / pm2)

เอกสารนี้ครอบคลุม 2 ฟีเจอร์ที่อยู่ในแอปเดียวกัน:

- **ฟีเจอร์ A — ตรวจสลิปด้วย OCR**: กันรูปมั่วไม่ให้ผ่าน + เช็คว่าโอนเข้าชื่อ "ธีรภัทร ปิ่นพรม"
- **ฟีเจอร์ B — เสียงแจ้งเตือนด้วย ElevenLabs**: แทนเสียงสังเคราะห์ของเบราว์เซอร์

---

## บริบทเดิม (ก่อนแก้)

- ผู้บริจาคกรอกชื่อ/ยอด/ข้อความ → `POST /api/donate` สร้างรายการ `pending` + QR พร้อมเพย์
- ผู้บริจาคอัปโหลดสลิป → `POST /api/donations/:id/slip` → **ยืนยันทันทีโดยไม่ตรวจอะไรเลย** (รับรูปอะไรก็ผ่าน) แล้ว `io.emit('donation')` ขึ้น overlay
- overlay (`public/js/overlay.js`) พูดด้วย `window.speechSynthesis` ของเบราว์เซอร์
- ที่เก็บข้อมูล: ไฟล์ JSON ใน `data/` (`donations.json`, `settings.json`, สลิปใน `data/slips/`)
- การตั้งค่า overlay อยู่ใน `DEFAULT_SETTINGS` (server.js) ปรับผ่าน `POST /api/settings` (ป้องกันด้วย `ADMIN_KEY` ถ้าตั้งไว้)

---

# ฟีเจอร์ A — ตรวจสลิปด้วย OCR

## A.1 พฤติกรรมที่ต้องการ (Flow ใหม่: ตรวจก่อนผ่าน)

ผู้บริจาคกดยืนยัน → หน้าเว็บแสดง "⏳ กำลังตรวจสลิป..." → เซิร์ฟเวอร์รัน OCR (มี timeout) แล้วตัดสินตามตาราง:

| เงื่อนไขผล OCR | การกระทำ | สถานะ (`verify.status`) |
|---|---|---|
| ไม่ใช่สลิป (เจอคำบ่งชี้สลิปน้อยกว่าเกณฑ์) | **บล็อก** ไม่ยืนยัน ไม่ขึ้น overlay + ลบไฟล์ที่อัปโหลดทิ้ง รายการคงสถานะ `pending` ให้ผู้โอนแนบใหม่ได้ | (ปฏิเสธ — ไม่บันทึก verify) |
| เป็นสลิป + เจอชื่อ "ธีรภัทร ปิ่นพรม" | ยืนยัน + ขึ้น overlay | `verified` ✅ |
| เป็นสลิป + ไม่เจอชื่อ | ยืนยัน + ขึ้น overlay **แต่ติดธง** | `unverified` ⚠️ |
| OCR ล้มเหลว/หมดเวลา (timeout) | **fail-open**: ยืนยัน + ขึ้น overlay + ติดธง (ไม่ลงโทษผู้โอนจริงเพราะระบบเราเอง) | `error` 🔁 |

หลักการ: **บล็อกเฉพาะ "ไม่ใช่สลิป"** เท่านั้น ส่วนกรณีชื่อไม่ตรง/ตรวจไม่ได้ ให้ผ่านแต่ติดธงเพื่อให้สตรีมเมอร์ตรวจเอง

ถ้า `verifyEnabled = false` → ข้ามการตรวจทั้งหมด กลับไปเป็นโหมดเชื่อใจเดิม (ยืนยันทันที, `verify.status = 'skipped'`)

## A.2 โครงโค้ด (แยกหน้าที่ให้เทสต์ได้)

### `lib/slip-verify.js` (ตรรกะล้วน — ไม่มี I/O, เทสต์ง่าย)
ฟังก์ชันที่ export:

- `normalizeThai(s)` → string
  - NFC normalize, ตัดช่องว่าง/อักขระศูนย์ความกว้าง, แปลงอังกฤษเป็นตัวพิมพ์เล็ก, คงพยัญชนะ/สระ/วรรณยุกต์ไทย+ตัวเลข+a-z
- `levenshtein(a, b)` → number (ระยะแก้ไข ใช้เทียบแบบยอมพลาด)
- `fuzzyContains(haystack, needle, maxDist)` → boolean
  - เลื่อนหน้าต่างความยาวเท่า needle ทั่ว haystack คืน true ถ้ามีหน้าต่างที่ระยะ ≤ maxDist (รองรับ OCR อ่านวรรณยุกต์/สระเพี้ยน)
- `looksLikeSlip(text, keywords?)` → `{ slipLike: boolean, hits: string[] }`
  - นับจำนวนคำบ่งชี้สลิปที่เจอ (เทียบแบบ normalize) `slipLike = hits.length >= SLIP_KEYWORD_MIN`
  - ค่าเริ่มต้น `SLIP_KEYWORD_MIN = 2`
  - keyword เริ่มต้น (ตัด normalize แล้วเทียบ): `โอนเงินสำเร็จ, จำนวนเงิน, จำนวน, บาท, ค่าธรรมเนียม, รหัสอ้างอิง, เลขที่รายการ, ธนาคาร, พร้อมเพย์, promptpay, baht, scan` + ชื่อธนาคารยอดนิยม (`กสิกร, ไทยพาณิชย์, กรุงเทพ, กรุงไทย, กรุงศรี, ทหารไทย, ออมสิน, ttb`)
- `matchName(text, expectedName)` → `{ nameFound, firstNameMatch, lastNameMatch }`
  - แยก `expectedName` ด้วยช่องว่างเป็น firstName/lastName
  - `firstNameMatch = fuzzyContains(norm(text), norm(firstName), maxDist)` โดย `maxDist = max(1, floor(len(firstName) * 0.2))`
  - `lastNameMatch` เทียบ "คำนำหน้านามสกุล" (3-4 อักขระแรกของนามสกุล) เพื่อรองรับสลิปที่ปิดนามสกุล เช่น "ธีรภัทร ป."
  - **`nameFound = firstNameMatch`** (ยึดชื่อต้นเป็นหลัก เพราะหลายธนาคารปิดนามสกุล — ถ้าบังคับนามสกุลจะติดธงผิดบ่อย) `lastNameMatch` เก็บไว้เป็นข้อมูลความมั่นใจเพิ่ม
- `verifyOcrText(text, opts)` → `{ status, nameFound, slipLike, hits }`
  - opts: `{ expectedName, keywords, slipKeywordMin }`
  - รวมตรรกะ: ถ้าไม่ slipLike → `status = 'not_a_slip'`; ถ้า slipLike + nameFound → `verified`; ถ้า slipLike + ไม่ nameFound → `unverified`

### `lib/ocr.js` (หุ้ม Tesseract.js — มี I/O)
- `runOcr(imagePath, opts)` → `Promise<string>` (ข้อความที่อ่านได้)
  - ใช้ภาษา `tha+eng`
  - **ใช้ worker ตัวเดียวร่วมกัน** (สร้างครั้งแรกแล้ว reuse) เพื่อความเร็ว — หุ้มด้วย lazy singleton
  - timeout: ถ้าเกิน `OCR_TIMEOUT_MS` (ดีฟอลต์ 20000) ให้ reject เพื่อให้ฝั่ง server ตัดสินเป็น `error`
  - langPath: ถ้ามีโฟลเดอร์ `vendor/tessdata/` ให้ใช้แบบ offline; ถ้าไม่มี ปล่อยให้ tesseract.js โหลดจาก CDN ครั้งแรกแล้วแคชเอง
  - (ออปชัน ช่วยความเร็ว/แม่นยำ) ถ้ารูปกว้างเกิน ~1500px ค่อยพิจารณาย่อ — บน Linux เพิ่ม `sharp` ได้ถ้าต้องการ แต่ v1 ข้ามไปก่อน (ยังไม่จำเป็น)

### `server.js` (ต่อสายเข้า endpoint เดิม)
แก้ `POST /api/donations/:id/slip`:
1. อัปโหลดไฟล์ (multer) เหมือนเดิม
2. ถ้า `settings.verifyEnabled === false` → ทำแบบเดิม (ยืนยันทันที, set `verify = { status:'skipped' }`)
3. ถ้าเปิดตรวจ:
   - เรียก `runOcr(filePath)` (มี timeout)
   - `verifyOcrText(text, { expectedName: settings.expectedName })`
   - ถ้า `status === 'not_a_slip'` → **ลบไฟล์**, รายการคง `pending`, ตอบ `400 { ok:false, error:'นี่ไม่ใช่สลิปการโอน หรืออ่านไม่ออก กรุณาแนบสลิปที่ชัดเจน', reason:'not_a_slip' }`
   - ถ้า OCR throw/timeout → ถือเป็น `status='error'` (fail-open ไปทางยืนยัน)
   - กรณียืนยัน (`verified`/`unverified`/`error`): ตั้ง `slip/slipAt/confirmedAt/status='confirmed'` + บันทึก `verify` → `io.emit('donation', ...)` + `broadcastUpdates()` เหมือนเดิม → ตอบ `{ ok:true, verify: { status, nameFound } }`

## A.3 โครงสร้างข้อมูล (เพิ่มในแต่ละ donation)

```js
donation.verify = {
  status: 'verified' | 'unverified' | 'error' | 'skipped', // ('not_a_slip' = ไม่บันทึก เพราะถูกปฏิเสธ)
  nameFound: true | false | null,
  slipLike: true | false | null,
  text: '<ข้อความ OCR>',   // เก็บฝั่ง server เท่านั้น (มีชื่อผู้โอนจริง = ข้อมูลส่วนบุคคล)
  at: <timestamp> | null,
}
```

`publicDonation(d)` เพิ่มเฉพาะข้อมูลที่ไม่ละเมิดความเป็นส่วนตัว:
```js
verify: d.verify ? { status: d.verify.status, nameFound: d.verify.nameFound } : null
```
**ห้าม** ส่ง `verify.text` (ข้อความ OCR ดิบ) ออกทาง API สาธารณะ เพราะมีชื่อผู้โอนจริง

## A.4 หน้าเว็บ (ฟีเจอร์ A)

- **หน้าบริจาค** (`index.html` + `js/donate.js`):
  - ปุ่มยืนยัน → ข้อความ "⏳ กำลังตรวจสลิป..." ระหว่างรอ; กันกดซ้ำ (ปุ่ม disabled อยู่แล้ว)
  - ถ้าโดนปฏิเสธ (`reason:'not_a_slip'` หรือ 400) → toast "❌ ไม่ใช่สลิป หรืออ่านไม่ออก แนบสลิปที่ชัดเจน" ค้างอยู่หน้าเดิมให้แนบใหม่
  - แก้ข้อความ note บรรทัดล่าง (เดิม "ยังไม่ตรวจสลิปกับธนาคาร") เป็นข้อความที่สื่อว่ามีการตรวจชื่อผู้รับด้วย OCR
- **Dashboard** (`dashboard.html` + `js/dashboard.js`):
  - ประวัติแต่ละรายการเพิ่มป้ายสถานะ: `verified` → ป้ายเขียว "✅ ตรวจแล้ว"; `unverified` → ป้ายส้ม "⚠️ ชื่อไม่ตรง—ตรวจเอง"; `error` → ป้ายเทา "🔁 ตรวจไม่ได้"; `skipped` → ไม่มีป้าย
  - รายการที่ติดธง (`unverified`/`error`) เพิ่มขอบสีซ้าย (CSS) ให้สังเกตง่าย

## A.5 Dependency & Deploy (ฟีเจอร์ A) — Linux

- เพิ่ม `tesseract.js` ใน dependencies (JS/wasm ล้วน ไม่ต้องลง system package — พกพาง่ายทั้งใน Docker และ VPS ตรง ๆ)
- ไฟล์ภาษา `tha.traineddata` + `eng.traineddata`:
  - แบบมีเน็ต: ปล่อยให้ tesseract.js โหลดจาก CDN ครั้งแรกแล้วแคช
  - แบบ offline / ใน Docker image: วางไว้ใน `vendor/tessdata/` แล้วชี้ langPath (กันต้องโหลดใหม่ทุกครั้งที่ container restart) — เขียนวิธีใน `deploy/DEPLOY.md`
- **Docker**: ตรวจ `Dockerfile`/`docker-compose.yml` ให้ติดตั้ง dependency ครบ, mount `./data` เป็น volume (สลิป/แคช TTS/traineddata cache อยู่ที่นี่), และ COPY `vendor/tessdata/` เข้า image ถ้าใช้แบบ offline
- ปรับ `deploy/DEPLOY.md` ให้เน้น Linux: รันด้วย `docker compose up -d` หรือ native (`pm2`/systemd), เปิดพอร์ตด้วย ufw/cloud firewall, และเพิ่มหัวข้อ traineddata + env ใหม่ (ตัด/ลดส่วน Windows Server 2012)

---

# ฟีเจอร์ B — เสียงแจ้งเตือนด้วย ElevenLabs

## B.1 สถาปัตยกรรม

- สร้างเสียงที่ **ฝั่งเซิร์ฟเวอร์เท่านั้น** (API key ห้ามหลุดไปเบราว์เซอร์)
- เพิ่ม endpoint `GET /api/tts?text=...` (จำกัดความยาว text, sanitize):
  - เรียก ElevenLabs `POST /v1/text-to-speech/{voiceId}` (header `xi-api-key`), body `{ text, model_id, voice_settings }`
  - โมเดลเริ่มต้น `eleven_multilingual_v2` (รองรับภาษาไทย)
  - voiceId เริ่มต้น = Jessica `cgSgspJ2msm6clMCkdW9`
  - คืน `audio/mpeg` (MP3) กลับไป
- **แคชด้วยแฮช** `sha1(text + voiceId + model)` → ไฟล์ `data/tts/<hash>.mp3`; ถ้ามีแคชแล้วเสิร์ฟจากไฟล์ ไม่เรียก API ใหม่ (ประหยัดเครดิต)
- `public/js/overlay.js`: แทน `speak(d)` เดิม → ประกอบข้อความเดียวกัน ("{name} บริจาค {amount} บาท. {message}") แล้ว `new Audio('/api/tts?text=' + encodeURIComponent(text))` เล่นเสียง โดยใช้ระบบ unlock-audio/volume เดิม

## B.2 กันพัง (graceful fallback)

ถ้า provider เป็น `browser`, หรือ `ELEVENLABS_API_KEY` ว่าง, หรือ `/api/tts` ตอบ error/ไม่สำเร็จ → overlay **ตกกลับไปใช้ `window.speechSynthesis` เดิมอัตโนมัติ** (ไม่มีวันเงียบหรือพัง)

ฝั่ง server: ถ้า ElevenLabs ตอบ error (เครดิตหมด/key ผิด) → `/api/tts` ตอบสถานะ error ชัดเจน เพื่อให้ overlay รู้ว่าต้อง fallback

## B.3 โครงโค้ด

### `lib/tts.js` (หุ้มการเรียก ElevenLabs + แคช)
- `synthesize(text, { voiceId, model, apiKey })` → `Promise<Buffer>` (MP3) — แยก network call ออกมาให้ mock ได้ตอนเทสต์
- `cachePathFor(text, voiceId, model)` → string (path ในแคช)
- `getOrSynthesize(text, opts)` → อ่านแคชถ้ามี ไม่งั้นเรียก `synthesize` แล้วเขียนแคช

### `server.js`
- อ่าน `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` จาก env
- เพิ่ม route `GET /api/tts` ต่อสายเข้า `lib/tts.js` (ใช้ `settings.ttsVoiceId`/`settings.ttsProvider`)

## B.4 ตั้งค่าได้

- `.env`: `ELEVENLABS_API_KEY=<key>`, `ELEVENLABS_MODEL=eleven_multilingual_v2`
- `DEFAULT_SETTINGS` เพิ่ม: `ttsProvider: 'elevenlabs'`, `ttsVoiceId: 'cgSgspJ2msm6clMCkdW9'` (คงของเดิม `ttsEnabled/speakAmount/minTts/volume`)
- `applySettings()` รองรับ `ttsProvider` (`'elevenlabs'|'browser'`) และ `ttsVoiceId` (sanitize)
- หน้า Control (`control.html` + `js/control.js`): เพิ่ม dropdown เลือกเสียง (รายชื่อ 21 เสียง premade) + สวิตช์เลือก provider (ElevenLabs/เบราว์เซอร์)

## B.5 ข้อควรรู้ / ความเป็นส่วนตัว

- ElevenLabs คิดเงินตามจำนวนตัวอักษร — การแคชช่วยลดได้มากเมื่อข้อความซ้ำ ฟรีทรี ~10,000 ตัวอักษร/เดือน ควรเฝ้าโควต้า
- **ความปลอดภัยของ key**: key ที่ให้มาถูกแชร์ในแชต = ถือว่าหลุด ควร revoke/regenerate ตัวเดิมทิ้งหลังพัฒนาเสร็จ แล้วใส่ตัวใหม่ใน `.env` (ซึ่ง gitignore + dockerignore ครอบคลุมแล้ว ไม่ถูก commit/ใส่ image)

---

# เทสต์ (รวมทั้งสองฟีเจอร์)

ใช้ `node:test` + `node:assert` (รันได้บน Node 16.17+; ตัวแอปเองรัน Node 16+ ได้)

- `lib/slip-verify.js`:
  - `normalizeThai`: ตัดช่องว่าง/normalize ถูกต้อง
  - `fuzzyContains`: เจอเมื่อพลาดในเกณฑ์, ไม่เจอเมื่อพลาดเกิน
  - `looksLikeSlip`: ข้อความสลิปตัวอย่าง → true; ข้อความสุ่ม/ว่าง → false
  - `matchName`: เจอชื่อเต็ม, เจอเมื่อมีช่องว่างคั่นแปลก ๆ, เจอเมื่อนามสกุลถูกปิด ("ธีรภัทร ป."), เจอเมื่อ OCR พิมพ์วรรณยุกต์เพี้ยน 1 ตัว, ไม่เจอเมื่อเป็นชื่ออื่น
  - `verifyOcrText`: ครบทุกสถานะ (`not_a_slip`/`verified`/`unverified`)
- `lib/tts.js`:
  - `cachePathFor`: แฮชเสถียร, เปลี่ยน voice/model → path เปลี่ยน
  - `getOrSynthesize`: เจอแคช → ไม่เรียก synthesize (mock); ไม่เจอ → เรียก synthesize แล้วเขียนไฟล์
- **ไม่ยิง OCR/ElevenLabs จริงในชุดเทสต์อัตโนมัติ** (ใช้ข้อความ/ mock); การทดสอบกับรูปสลิปจริงและเสียงจริง = ทดสอบมือ/optional

---

# ขอบเขตที่ "ไม่ทำ" ใน v1 (YAGNI)

- ไม่เทียบ "ยอดเงิน" ในสลิปกับยอดที่กรอก (ผู้ใช้ขอเฉพาะชื่อ) — เป็นงานต่อยอดได้
- ไม่ตรวจ QR ในสลิปกับธนาคารจริง (ผู้ใช้เลือก OCR ไม่ใช้ API)
- ไม่ทำระบบอนุมัติ/คิวรอแอดมิน (เลือกโหมด "ผ่านแต่ติดธง")
- ไม่ย่อ/preprocess รูปก่อน OCR ใน v1 (ยังไม่จำเป็น — บน Linux เพิ่ม `sharp` ทีหลังได้ถ้าต้องการความเร็ว/แม่นยำ)

---

# หมายเหตุ git

โฟลเดอร์นี้ยังไม่ใช่ git repository — เอกสารนี้จึงยังไม่ได้ commit ถ้าต้องการ ผม`git init` ให้แล้ว commit สเปก + โค้ดเป็นขั้น ๆ ได้
