@echo off
REM เริ่ม Donate Overlay แบบเร็ว (สำหรับทดสอบ/รันชั่วคราว)
REM ดับเบิลคลิกไฟล์นี้ได้เลย — ปิดหน้าต่างเพื่อหยุดเซิร์ฟเวอร์
cd /d "%~dp0.."

if not exist node_modules (
  echo [setup] ติดตั้ง dependencies ครั้งแรก...
  call npm install
)

echo.
echo ====================================================
echo   Donate Overlay - http://localhost:3000
echo   ปิดหน้าต่างนี้เพื่อหยุดเซิร์ฟเวอร์
echo ====================================================
echo.
node server.js
pause
