# สเปก: กันส่งสลิปซ้ำ (เลขอ้างอิง + สตางค์สุ่ม)

วันที่: 2026-06-21
โปรเจกต์: Donate Overlay (ต่อยอดจากระบบตรวจสลิป OCR ที่ทำไปแล้ว)

## ปัญหา
ตอนนี้ตรวจว่า "เป็นสลิปจริง + โอนเข้าชื่อ ธีรภัทร ปิ่นพรม" แล้ว แต่ยัง **เอาสลิปใบเดิมมาส่งซ้ำได้** (โอนจริงครั้งเดียว แต่ใช้สลิปนั้นยิงโดเนทหลายครั้ง)

## เป้าหมาย
กันการใช้สลิปซ้ำ ด้วย 2 ชั้น:
1. **เลขอ้างอิงรายการ (ref) ซ้ำ → บล็อก** (กันได้จริง 100% เพราะทุกการโอนมีเลขนี้ไม่ซ้ำ)
2. **สตางค์สุ่มในยอดโอน + เช็คยอดในสลิป** (ยืนยันว่าจ่ายยอดที่ unique จริง — เป็นชั้นสำรองเมื่ออ่าน ref ไม่ได้)

ปรัชญาเดิมคงไว้: **บล็อกเฉพาะกรณีที่ชัวร์** (ref ซ้ำ) ส่วนที่อาจ OCR เพี้ยน (ยอดไม่ตรง) = ผ่านแต่ติดธง

---

## ส่วนที่ 1 — สตางค์สุ่ม (ตอนสร้างรายการ)

ที่ `POST /api/donate` (server.js): หลังตรวจ amount ถูกต้อง ถ้า `settings.verifyEnabled === true`:
- `base = Math.floor(amount)`
- `satang = สุ่ม 1..99` (ไม่ใช้ 0 เพราะไม่เพิ่ม entropy)
- `donation.amount = Math.round((base * 100 + satang)) / 100`  → เช่น `50.37`

ผลลัพธ์: QR ฝัง 50.37 (สแกนแล้วเด้งยอดอัตโนมัติ), หน้าเว็บโชว์ "โอน 50.37 บาท", stats/overlay ใช้ยอดนี้
ถ้า `verifyEnabled === false` (โหมดเชื่อใจ) → ไม่เติมสตางค์ (ใช้ยอดเต็มเดิม)

> หมายเหตุ UX: ผู้บริจาคพิมพ์ยอดเต็ม (step=1) ระบบเป็นคนเติมสตางค์ให้ ผู้บริจาคไม่ต้องพิมพ์เอง

---

## ส่วนที่ 2 — ตรรกะดึงข้อมูลจากสลิป (`lib/slip-verify.js`, pure)

เพิ่มฟังก์ชัน (เทสต์ได้โดยไม่ยิง OCR จริง):

- `normalizeRef(s) => string` — uppercase + ตัดอักขระที่ไม่ใช่ `A-Z0-9`
- `extractRef(text) => string | null` — คืนเลขอ้างอิงที่ normalize แล้ว หรือ null
  - ขั้นที่ 1: หาโทเค็น `[A-Za-z0-9]` (ยาว ≥ 8) ที่อยู่หลังคำชี้: `รหัสอ้างอิง`, `เลขที่รายการ`, `หมายเลขอ้างอิง`, `เลขอ้างอิง`, `ref`, `reference`
  - ขั้นที่ 2 (fallback): ถ้าไม่เจอตามคำชี้ ใช้โทเค็น `[A-Za-z0-9]` ที่**ยาวที่สุดและ ≥ 12 ตัว** ในข้อความ (เลข ref มักยาวสุดในสลิป)
  - ถ้าไม่มีอะไรเข้าเกณฑ์ → null
- `amountMatches(text, expected) => true | false | null`
  - normalize: ตัดช่องว่างและ `,` ออกจาก text
  - `expectedStr = Number(expected).toFixed(2)` (เช่น `"50.37"`)
  - ถ้า text มี `expectedStr` → `true`
  - ไม่งั้น ถ้า text มีรูปแบบจำนวนเงิน `\d+\.\d{2}` อย่างน้อยหนึ่งตัว → `false` (เจอยอดแต่ไม่ตรง)
  - ถ้าไม่เจอจำนวนเงินเลย → `null` (อ่านยอดไม่ได้ — ไม่ลงโทษ)

`verifyOcrText` เดิม **ไม่เปลี่ยน** (ยังคืน slip+name verdict) — การ dedup/amount ทำที่ server เพราะต้องใช้ state ของ `donations[]`

---

## ส่วนที่ 3 — เช็คตอนอัปสลิป (`server.js` `/api/donations/:id/slip`)

ลำดับใหม่ (เมื่อ `verifyEnabled` และ OCR สำเร็จ):
1. `verifyOcrText(text)` เดิม → ถ้า `not_a_slip` → **บล็อก 400** (เหมือนเดิม)
2. **เช็ค ref ซ้ำ (ใหม่):** `ref = extractRef(text)`
   - ถ้า `ref` ไม่ null และตรงกับ `verify.ref` ของ donation ที่ `status==='confirmed'` ใบใดใบหนึ่ง (เทียบแบบ normalize) → **บล็อก**: ลบไฟล์, donation คงสถานะ `pending`, ตอบ `400 { ok:false, reason:'duplicate', error:'สลิปนี้ถูกใช้ไปแล้ว' }`
3. **เช็คยอด (ใหม่):** `amountMatch = amountMatches(text, donation.amount)`
4. ยืนยันรายการ (เหมือนเดิม) โดยบันทึกใน `donation.verify` เพิ่ม: `ref`, `amountMatch`
   - status ยัง = `verified`/`unverified` ตามชื่อ (เดิม); `amountMatch===false` = ธงเพิ่มอีกใบ (ไม่เปลี่ยน status)
   - OCR ล้มเหลว/timeout → `error` (fail-open เดิม; ไม่มี ref/amount → ข้ามเช็คซ้ำ)

### โครงสร้าง `donation.verify` (เพิ่มฟิลด์)
```js
verify = {
  status, nameFound, slipLike,      // เดิม
  ref: '<normalized ref>' | null,   // ใหม่ (เก็บ server-side เพื่อ dedup)
  amountMatch: true | false | null, // ใหม่
  text, at,                          // เดิม (text เก็บ server-side เท่านั้น)
}
```

### dedup store
ไม่สร้างไฟล์ใหม่ — เทียบ `ref` กับ `donations[]` ที่ confirmed อยู่แล้ว (แต่ละใบมี `verify.ref`)
- ฟังก์ชันช่วย `isDuplicateRef(ref)` ใน server: วน `donations` หา confirmed ที่ `verify.ref` ตรงกัน (normalize ทั้งคู่)
- กด "ล้างข้อมูล" → refs รีเซ็ตด้วย (ยอมรับได้)

### publicDonation
เพิ่ม `amountMatch` ใน projection สาธารณะ: `verify: { status, nameFound, amountMatch }`
**ห้าม**ส่ง `verify.ref` และ `verify.text` ออก API สาธารณะ (เป็นข้อมูลธุรกรรม)

---

## ส่วนที่ 4 — หน้าเว็บ

- **หน้าบริจาค** (`donate.js`): จัดการ response `reason:'duplicate'` → toast "❌ สลิปนี้ถูกใช้ไปแล้ว ใช้สลิปการโอนจริงครั้งใหม่"
- **Dashboard** (`dashboard.js` + `site.css`): เพิ่มป้าย "⚠️ ยอดไม่ตรง" เมื่อ `verify.amountMatch === false` (แสดงคู่กับป้ายชื่อเดิมได้) · `amountMatch===null`/`true` ไม่ต้องโชว์ป้ายยอด

---

## ส่วนที่ 5 — เทสต์

ใช้ `node:test` (เดิม)
- `lib/slip-verify.js`:
  - `normalizeRef`: ตัดช่องว่าง/ตัวพิมพ์ → uppercase ถูกต้อง
  - `extractRef`: เจอหลังคำชี้ (`รหัสอ้างอิง: ABC123456`), เจอแบบ fallback (string ยาวสุด ≥12), คืน null เมื่อไม่มี, normalize ผลลัพธ์
  - `amountMatches`: ตรง → true, มียอดอื่นแต่ไม่ตรง → false, ไม่มียอด → null, ทน comma/space
- `server` (supertest, mock `ocr.runOcr`):
  - `/api/donate` เติมสตางค์เมื่อ verifyEnabled (ยอดลงท้าย .01-.99) และไม่เติมเมื่อปิด
  - อัปสลิปที่ ref ซ้ำกับรายการก่อนหน้า → `400 reason:'duplicate'` + ไม่ยืนยัน
  - อัปสลิป ref ใหม่ + ยอดตรง → ยืนยัน, `verify.ref` ถูกบันทึก, `amountMatch:true`
  - อัปสลิป ยอดไม่ตรง → ยืนยัน (ไม่บล็อก) + `amountMatch:false`
  - publicDonation ไม่หลุด `verify.ref`/`verify.text`

---

## ขอบเขตที่ไม่ทำ (YAGNI)
- ไม่แยก setting ใหม่ — ใช้สวิตช์ `verifyEnabled` เดิมคุมทั้ง dedup/สตางค์/เช็คยอด
- ไม่ทำ persistent ref store แยก (ดึงจาก donations[])
- ไม่ hard-block กรณียอดไม่ตรง (กัน OCR อ่านเลขเพี้ยน) — ติดธงเท่านั้น
- ไม่เทียบ ref ข้ามรอบ "ล้างข้อมูล"
