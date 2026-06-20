# 🚀 คู่มือ Deploy — Donate Overlay บน VPS

มี public IP บนเครื่องอยู่แล้ว แค่ต้อง (1) รันเซิร์ฟเวอร์ให้ค้างไว้ (2) เปิดพอร์ตที่ไฟร์วอลล์
เอกสารนี้เน้นการ deploy บน **Linux** (Docker / pm2) เป็นหลัก → ข้ามไปหัวข้อ **[🐧 รันบน Linux (แนะนำ)](#-รันบน-linux-แนะนำ)** ด้านล่าง
ส่วนวิธีรันบน **Windows Server 2012 (legacy)** ยังเก็บไว้ถัดไปสำหรับใครที่ยังใช้เครื่องเดิม

---

## ⚠️ เรื่อง Docker บน Windows Server 2012

**Docker ใช้ไม่ได้บน Windows Server 2012 / 2012 R2** — Windows containers ต้องใช้ Server 2016 ขึ้นไป
ส่วน Docker Desktop ต้องใช้ Windows 10/11 Pro ดังนั้นบนเครื่อง 2012 ให้ใช้วิธี **รันแบบ native (Node + Windows Service)** ด้านล่างนี้

> ไฟล์ `Dockerfile` / `docker-compose.yml` ที่ให้มา ใช้ได้ถ้าย้ายไป **Linux VPS** หรือ **Windows Server 2016+** ในอนาคต

---

## 🪟 (Legacy) Windows Server 2012 — รันแบบ Native + Windows Service

### 1) ติดตั้ง Node.js

ดาวน์โหลด **Node.js LTS** จาก https://nodejs.org

> 💡 เครื่อง Windows Server 2012 แนะนำ **Node.js 16.x** (เช่น 16.20.2) เพื่อความเข้ากันได้สูงสุด
> (Node เวอร์ชันใหม่มากอาจไม่รองรับ Windows รุ่นเก่า) — แอปนี้รันได้ตั้งแต่ Node 16 ขึ้นไป

ตรวจสอบ: เปิด PowerShell แล้วพิมพ์ `node -v`

### 2) วางโปรเจกต์ + ตั้งค่า

```powershell
# ไปที่โฟลเดอร์โปรเจกต์ (เช่น C:\apps\Donate)
cd C:\apps\Donate

# ติดตั้ง dependencies
npm install

# สร้างไฟล์ตั้งค่าจากตัวอย่าง แล้วแก้ค่า
copy .env.example .env
notepad .env
```

แก้ใน `.env` อย่างน้อย:
```
PORT=3000
PROMPTPAY_ID=0634284604
ADMIN_KEY=ตั้งรหัสลับสักอัน   # สำคัญเมื่อเปิดให้คนนอกเข้าถึง! กันคนแก้ตั้งค่า/ล้างข้อมูล
```

### 3) ทดสอบรันก่อน

```powershell
npm start
```
เปิด `http://localhost:3000` ดูว่าทำงานไหม แล้วกด `Ctrl+C` เพื่อหยุด

### 4) ติดตั้งเป็น Windows Service (รันค้าง + เปิดเครื่องมาก็สตาร์ทเอง)

```powershell
# รัน PowerShell แบบ Run as Administrator
npm run service:install
```
- จะได้ service ชื่อ **DonateOverlay** (ดูได้ใน `services.msc`)
- ถอนออก: `npm run service:uninstall`

> ถ้าติดปัญหา node-windows ดูหัวข้อ "ทางเลือก: PM2" ด้านล่าง

### 5) เปิดพอร์ตที่ Windows Firewall

```powershell
# รัน PowerShell แบบ Run as Administrator
.\deploy\open-firewall.ps1 -Port 3000
```

### 6) เข้าใช้งานจากภายนอก

```
http://<PUBLIC_IP>:3000/             ← หน้าบริจาค (ส่งให้ผู้ชม)
http://<PUBLIC_IP>:3000/overlay.html ← ใส่ใน OBS Browser Source
http://<PUBLIC_IP>:3000/control.html ← ปรับแต่ง overlay
```

> ถ้า VPS อยู่หลัง NAT/มี cloud firewall (เช่น AWS Security Group, GCP firewall)
> อย่าลืมเปิดพอร์ต 3000 ที่แผงควบคุมของผู้ให้บริการด้วย

---

## 🌐 (แนะนำเพิ่ม) ทำให้เป็น HTTPS + โดเมนสวย ๆ

เปิดผ่าน IP:พอร์ต ใช้ได้เลย แต่ถ้าอยากได้ `https://donate.yourdomain.com`:

1. ชี้ A record ของโดเมนมาที่ public IP
2. ติดตั้ง **Caddy** (ง่ายสุด ออก SSL ให้อัตโนมัติ) แล้วตั้ง reverse proxy:
   ```
   donate.yourdomain.com {
       reverse_proxy localhost:3000
   }
   ```
   Caddy จะขอใบรับรอง Let's Encrypt ให้เอง

> ข้อดีของ HTTPS: หน้า OBS/เบราว์เซอร์บางตัวต้องใช้ https สำหรับฟีเจอร์เสียง/ไมค์
> และดูน่าเชื่อถือกว่าเวลาส่งให้ผู้ชมโอนเงิน

---

## 🔁 ทางเลือก: PM2 (แทน Windows Service)

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start server.js --name donate-overlay
pm2 save
pm2-startup install      # ให้สตาร์ทเองตอนเปิดเครื่อง
```
คำสั่งที่ใช้บ่อย: `pm2 logs` , `pm2 restart donate-overlay` , `pm2 stop donate-overlay`

---

## 🐳 ทางเลือก: Docker (เฉพาะ Linux VPS หรือ Windows Server 2016+)

```bash
cp .env.example .env      # แก้ค่าให้เรียบร้อย
docker compose up -d      # build + รันแบบ background
docker compose logs -f    # ดู log
docker compose down       # หยุด
```
ข้อมูล (สลิป/สถิติ/ตั้งค่า) ถูกเก็บไว้ใน `./data` ผ่าน volume

---

## 🔧 แก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|-------|---------|
| เข้าจากภายนอกไม่ได้ | เปิดพอร์ตที่ Windows Firewall **และ** cloud firewall ของผู้ให้บริการ |
| `npm install` ค้าง/พัง | ใช้ Node 16.x, รัน `npm cache clean --force` แล้วลองใหม่ |
| service ติดตั้งไม่ได้ | รัน PowerShell แบบ Administrator; หรือใช้ PM2 แทน |
| คนนอกแก้ตั้งค่า overlay ได้ | ตั้ง `ADMIN_KEY` ใน `.env` แล้วรีสตาร์ท |
| เปลี่ยนพอร์ต | แก้ `PORT` ใน `.env` + เปิดพอร์ตใหม่ที่ไฟร์วอลล์ |

---

## 🐧 รันบน Linux (แนะนำ)

### ตัวเลือก A — Docker
```bash
cp .env.example .env   # ใส่ ELEVENLABS_API_KEY และค่าอื่น ๆ
docker compose up -d
docker compose logs -f
```
ข้อมูล (สลิป/สถิติ/ตั้งค่า/แคชเสียง) เก็บใน `./data` ผ่าน volume

### ตัวเลือก B — Native + pm2
```bash
npm install
cp .env.example .env && nano .env
npm install -g pm2
pm2 start server.js --name donate-overlay
pm2 save && pm2 startup
```

## 🧾 OCR (ตรวจสลิป)
- ใช้ `tesseract.js` — ครั้งแรกจะดาวน์โหลดไฟล์ภาษา `tha`/`eng` จาก CDN แล้วแคชไว้
- แบบ offline: ดาวน์โหลด `tha.traineddata` + `eng.traineddata` จาก
  https://github.com/tesseract-ocr/tessdata_fast วางใน `vendor/tessdata/`
  แล้วตั้ง `TESSDATA_PATH=/app/vendor/tessdata` ใน `.env`
- ปรับ timeout ได้ที่ `OCR_TIMEOUT_MS` (ดีฟอลต์ 20000)
- เปิด/ปิดการตรวจ และตั้งชื่อผู้รับได้จากหน้า Control Panel

## 🗣️ เสียง ElevenLabs
- ใส่ `ELEVENLABS_API_KEY` ใน `.env` (เว้นว่าง = ใช้เสียงเบราว์เซอร์อัตโนมัติ)
- เลือกเสียง/แหล่งเสียงได้จากหน้า Control Panel
- คิดเงินตามจำนวนตัวอักษร — ระบบแคชไฟล์เสียงข้อความซ้ำใน `data/tts/`
- ⚠️ ถ้าคีย์เคยถูกแชร์ในที่สาธารณะ ให้ revoke แล้วออกใหม่
