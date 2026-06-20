# 💸 Donate Overlay

ระบบแจ้งเตือนการบริจาคแบบ **real-time** สำหรับสตรีมเมอร์ ใช้เป็น Browser Source ใน OBS ได้ทันที
รับเงินผ่าน **PromptPay QR** + **อัปโหลดสลิปยืนยัน** มาพร้อม **เสียง + อนิเมชัน**, **อ่านข้อความ (TTS)**,
**Dashboard**, **Leaderboard** และ **Control Panel** สำหรับปรับแต่ง overlay สด ๆ

---

## ✨ ฟีเจอร์

- 📱 **PromptPay QR** สร้าง QR ตามจำนวนเงินอัตโนมัติ (เบอร์พร้อมเพย์ตั้งค่าได้)
- 🧾 **อัปโหลดสลิป** — ผู้บริจาคแนบสลิปแล้ว **ระบบแจ้งเตือนขึ้นจอทันที** (ไม่ต้องรออนุมัติ)
- 🔔 **แจ้งเตือนเรียลไทม์** ผ่าน Socket.IO
- 🎉 **อนิเมชัน + คอนเฟตติ + เสียง** (สังเคราะห์ด้วย Web Audio ไม่ต้องมีไฟล์เสียง)
- 🗣️ **อ่านข้อความ (TTS)** รองรับไทย/อังกฤษ/ญี่ปุ่น ผ่าน Web Speech API
- 🎛️ **Control Panel** ปรับสี/เวลา/เสียง/TTS/ตำแหน่ง/ข้อความ พร้อมพรีวิวสด — บันทึกแล้ว overlay อัปเดตทันที
- 📊 **Dashboard** ดูสถิติ ทดสอบยิงแจ้งเตือน ดูสลิป และคัดลอกลิงก์ OBS
- 🏆 **Leaderboard** จัดอันดับผู้บริจาคสูงสุด
- 💾 บันทึกข้อมูลลงไฟล์ JSON (อยู่รอดแม้รีสตาร์ท)

---

## 🚀 เริ่มใช้งาน

```bash
npm install
npm start
```

เปิด `http://localhost:3000`

| หน้า | URL | ใช้ทำอะไร |
|------|-----|-----------|
| หน้าบริจาค | `/` | ผู้ชมกรอกข้อมูล → สแกน QR → แนบสลิป |
| **Overlay (OBS)** | `/overlay.html` | ใส่ใน Browser Source ของ OBS |
| **Control Panel** | `/control.html` | ปรับแต่ง overlay สด ๆ |
| Dashboard | `/dashboard.html` | สถิติ + ทดสอบ + ดูสลิป |
| Leaderboard | `/leaderboard.html` | อันดับผู้บริจาค |

---

## 🔄 ขั้นตอนการบริจาค

1. ผู้บริจาคกรอกชื่อ / จำนวนเงิน / ข้อความ → ระบบสร้าง **QR พร้อมเพย์** ตามจำนวนเงิน
2. ผู้บริจาคสแกนโอนเงินด้วยแอปธนาคาร แล้ว **แนบสลิป**
3. เมื่อแนบสลิป → **แจ้งเตือนเด้งขึ้น overlay ทันที** พร้อมนับเข้าสถิติ/leaderboard

> สลิปจะถูกเก็บไว้ให้สตรีมเมอร์เปิดดูเป็นหลักฐานได้ในหน้า Dashboard
> ระบบ **ไม่ได้ตรวจสอบยอดเงินในสลิปอัตโนมัติ** (เป็นโหมดเชื่อใจ) — หากต้องการตรวจสอบสลิปจริงกับธนาคาร
> สามารถต่อบริการอย่าง SlipOK / EasySlip ที่จุดอัปโหลดสลิปได้ภายหลัง

---

## 🎥 ตั้งค่าใน OBS

1. เพิ่ม **Source → Browser**
2. วาง URL: `http://localhost:3000/overlay.html`
3. ตั้งขนาดเท่ากับ canvas (เช่น 1920 × 1080) — พื้นหลังโปร่งใสอยู่แล้ว
4. ปรับแต่งหน้าตาได้ที่ **Control Panel** หรือทดสอบจาก **Dashboard**

### ปรับแต่งผ่าน Control Panel (แนะนำ)

เปิด `/control.html` แล้วปรับได้ทันที: ข้อความหัวเรื่อง, สี, ตำแหน่ง, เวลาแสดงผล, เสียง/ระดับเสียง,
TTS (ภาษา + ยอดขั้นต่ำ), คอนเฟตติ — กด **บันทึก** แล้ว overlay ทุกหน้าจะอัปเดตทันทีผ่าน Socket.IO

### หรือ override ผ่าน query string (ทับค่าจาก Control Panel)

```
/overlay.html?duration=10000&tts=0&volume=0.8&position=center
```

| พารามิเตอร์ | คำอธิบาย |
|-------------|-----------|
| `duration`  | เวลาที่การ์ดค้างอยู่ (ms) |
| `sound` / `tts` / `confetti` / `speakAmount` | เปิด/ปิด (`0`/`1`) |
| `lang` | ภาษา TTS (เช่น `en-US`) |
| `volume` | ระดับเสียง (0–1) |
| `minTts` | อ่าน TTS เฉพาะยอด ≥ ค่านี้ |
| `position` | `top` หรือ `center` |

---

## 🔌 API

| Method | Endpoint | คำอธิบาย |
|--------|----------|-----------|
| `POST` | `/api/donate` | สร้างรายการ (pending) + คืน QR `{ name, amount, message }` |
| `POST` | `/api/donations/:id/slip` | อัปโหลดสลิป (multipart field `slip`) → ยืนยันอัตโนมัติ + ยิงแจ้งเตือน |
| `GET`  | `/api/promptpay?amount=100` | สร้าง QR พร้อมเพย์ (พรีวิว) |
| `GET`  | `/api/donations?limit=50&status=confirmed` | ประวัติ |
| `GET`  | `/api/stats` · `/api/leaderboard` | สถิติ / อันดับ |
| `GET`/`POST` | `/api/settings` · `/api/settings/reset` | อ่าน/บันทึก/รีเซ็ตการตั้งค่า overlay |
| `DELETE` | `/api/donations` | ล้างข้อมูลทั้งหมด |

งานฝั่งแอดมิน (`settings`, `reset`, `DELETE`) จะบังคับ header `x-admin-key` เฉพาะเมื่อมีการตั้งค่า `ADMIN_KEY`

**Socket.IO events (server → client):** `donation`, `stats`, `leaderboard`, `settings`

---

## ⚙️ ตัวแปรสภาพแวดล้อม

| ENV | ค่าเริ่มต้น | คำอธิบาย |
|-----|-----------|-----------|
| `PORT` | `3000` | พอร์ตเซิร์ฟเวอร์ |
| `PROMPTPAY_ID` | `0634284604` | เบอร์/เลขบัตรประชาชนพร้อมเพย์ของสตรีมเมอร์ |
| `CURRENCY` | `฿` | สัญลักษณ์สกุลเงิน |
| `ADMIN_KEY` | _(ว่าง)_ | ถ้าตั้งค่า จะต้องใช้คีย์นี้สำหรับงานแอดมิน |

ตัวอย่างบน Windows PowerShell:

```powershell
$env:PROMPTPAY_ID = "0634284604"; npm start
```

---

## 🚀 Deploy ขึ้น VPS

ดูคู่มือเต็มที่ [deploy/DEPLOY.md](deploy/DEPLOY.md) — ครอบคลุม:

- **Windows Server 2012** (แนะนำ): รันแบบ native + ติดตั้งเป็น Windows Service
  ```powershell
  copy .env.example .env   # แก้ค่า PROMPTPAY_ID / ADMIN_KEY
  npm install
  npm run service:install          # ติดตั้งเป็น service (Run as Administrator)
  .\deploy\open-firewall.ps1 -Port 3000
  ```
- **Linux VPS / Windows Server 2016+**: ใช้ Docker — `docker compose up -d`
- ทางเลือก HTTPS + โดเมน ด้วย Caddy reverse proxy

> ⚠️ Docker **ใช้ไม่ได้** บน Windows Server 2012/2012 R2 — ใช้วิธี native service แทน
> 🔒 เมื่อเปิดให้คนนอกเข้าถึง ควรตั้ง `ADMIN_KEY` ใน `.env` เพื่อกันการแก้ตั้งค่า/ล้างข้อมูล

## 🧰 เทคโนโลยี

Node.js · Express · Socket.IO · dotenv · [promptpay-qr](https://www.npmjs.com/package/promptpay-qr) · [qrcode](https://www.npmjs.com/package/qrcode) · [multer](https://www.npmjs.com/package/multer)

## 📄 License

MIT
