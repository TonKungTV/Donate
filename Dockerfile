# ---- Donate Overlay : production image ----
# ใช้ได้บน Linux VPS หรือ Windows Server 2016+ (ที่รองรับ Docker)
# หมายเหตุ: Windows Server 2012 ไม่รองรับ Docker — ดูวิธีรันแบบ native ใน deploy/DEPLOY.md
FROM node:18-alpine

ENV NODE_ENV=production
WORKDIR /app

# ติดตั้ง dependencies ก่อน (cache layer) — ข้าม optional (node-windows ใช้เฉพาะ Windows)
COPY package*.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund

# คัดลอกซอร์ส
COPY server.js ./
COPY lib ./lib
COPY public ./public
# traineddata แบบ offline (ถ้ามีโฟลเดอร์ vendor/tessdata จะถูกใช้; ถ้าไม่มี tesseract.js โหลดจาก CDN เอง)
COPY vendor* ./vendor

# เก็บข้อมูล (สลิป/สถิติ/ตั้งค่า) ไว้ใน volume
RUN mkdir -p /app/data && addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "server.js"]
