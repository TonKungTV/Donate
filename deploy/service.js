'use strict';

/**
 * ติดตั้ง Donate Overlay เป็น Windows Service (รันค้างไว้ + เปิดเครื่องมาก็สตาร์ทเอง)
 * ใช้แพ็กเกจ node-windows
 *
 *   npm install            # ติดตั้ง dependencies (รวม node-windows บน Windows)
 *   node deploy/service.js install
 *   node deploy/service.js uninstall
 *
 * ตัวเซิร์ฟเวอร์จะอ่านค่าจากไฟล์ .env ในโฟลเดอร์โปรเจกต์โดยอัตโนมัติ
 */

const path = require('path');

let Service;
try {
  ({ Service } = require('node-windows'));
} catch (e) {
  console.error('ไม่พบ node-windows — รัน `npm install` ก่อน (ต้องรันบน Windows)');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');

const svc = new Service({
  name: 'DonateOverlay',
  description: 'Donate Overlay — เซิร์ฟเวอร์แจ้งเตือนการบริจาคสำหรับสตรีมเมอร์',
  script: path.join(projectRoot, 'server.js'),
  workingDirectory: projectRoot,
  // ให้เซิร์ฟเวอร์รีสตาร์ทเองถ้าล่ม
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on('install', () => {
  console.log('✓ ติดตั้ง service "DonateOverlay" แล้ว กำลังเริ่ม...');
  svc.start();
});
svc.on('alreadyinstalled', () => console.log('• service ติดตั้งอยู่แล้ว'));
svc.on('start', () => console.log('✓ service เริ่มทำงานแล้ว — เปิด http://localhost:3000'));
svc.on('uninstall', () => console.log('✓ ถอน service เรียบร้อย'));
svc.on('error', (err) => console.error('เกิดข้อผิดพลาด:', err));

const action = (process.argv[2] || '').toLowerCase();
if (action === 'install') {
  svc.install();
} else if (action === 'uninstall') {
  svc.uninstall();
} else {
  console.log('ใช้งาน: node deploy/service.js [install|uninstall]');
}
