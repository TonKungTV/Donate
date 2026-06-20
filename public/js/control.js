// ===== Control Panel: ปรับแต่ง overlay พร้อมพรีวิวสด + บันทึกผ่าน API =====
(function () {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const toast = $('toast');

  // ฟิลด์ทั้งหมดที่ผูกกับ settings
  const FIELDS = {
    headlineTemplate: 'text',
    accentColor: 'text',
    accentColor2: 'text',
    textColor: 'text',
    position: 'text',
    currency: 'text',
    ttsLang: 'text',
    duration: 'number',
    minTts: 'number',
    volume: 'number',
    soundEnabled: 'bool',
    ttsEnabled: 'bool',
    speakAmount: 'bool',
    confettiEnabled: 'bool',
  };

  let settings = {};

  // ---- โหลดค่าปัจจุบันจากเซิร์ฟเวอร์ ----
  socket.on('settings', (s) => {
    settings = s || {};
    fillForm();
    updatePreview();
  });

  function fillForm() {
    for (const key in FIELDS) {
      const el = $(key);
      if (!el) continue;
      if (FIELDS[key] === 'bool') el.checked = !!settings[key];
      else el.value = settings[key];
    }
    $('duration-val').textContent = (Number(settings.duration) / 1000).toFixed(1) + 's';
    $('volume-val').textContent = Math.round(Number(settings.volume) * 100) + '%';
  }

  // ---- อ่านค่าจากฟอร์ม ----
  function readForm() {
    const out = {};
    for (const key in FIELDS) {
      const el = $(key);
      if (!el) continue;
      if (FIELDS[key] === 'bool') out[key] = el.checked;
      else if (FIELDS[key] === 'number') out[key] = Number(el.value);
      else out[key] = el.value;
    }
    return out;
  }

  // ---- พรีวิว ----
  function updatePreview() {
    const v = readForm();
    const root = $('preview-alert').style;
    root.setProperty('--pv-acc1', v.accentColor);
    root.setProperty('--pv-acc2', v.accentColor2);
    root.setProperty('--pv-txt', v.textColor);

    const sample = { name: 'น้องเมย์', amount: 250, message: 'ขอบคุณสำหรับสตรีมดี ๆ ครับ!' };
    $('p-headline').innerHTML = '';
    $('p-headline').append(renderHeadline(v.headlineTemplate || '{name} บริจาค {amount}', sample, v.currency || '฿'));
    $('p-message').textContent = '“' + sample.message + '”';

    $('duration-val').textContent = (Number(v.duration) / 1000).toFixed(1) + 's';
    $('volume-val').textContent = Math.round(Number(v.volume) * 100) + '%';
  }

  function renderHeadline(template, d, currency) {
    const frag = document.createDocumentFragment();
    const regex = /\{(name|amount|currency)\}/g;
    let last = 0;
    let m;
    while ((m = regex.exec(template)) !== null) {
      if (m.index > last) frag.append(document.createTextNode(template.slice(last, m.index)));
      if (m[1] === 'name') {
        const s = document.createElement('span');
        s.className = 'donor';
        s.textContent = d.name;
        frag.append(s);
      } else if (m[1] === 'amount') {
        const s = document.createElement('span');
        s.className = 'amount';
        s.textContent = currency + Number(d.amount).toLocaleString('th-TH');
        frag.append(s);
      } else {
        frag.append(document.createTextNode(currency));
      }
      last = m.index + m[0].length;
    }
    if (last < template.length) frag.append(document.createTextNode(template.slice(last)));
    return frag;
  }

  // อัปเดตพรีวิวทุกครั้งที่แก้ฟอร์ม
  document.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  });

  // ---- admin key (ใช้เมื่อเซิร์ฟเวอร์ตั้ง ADMIN_KEY) ----
  function adminHeaders() {
    const key = localStorage.getItem('adminKey');
    return key ? { 'X-Admin-Key': key } : {};
  }

  async function postJSON(url, body) {
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(body || {}),
    });
    if (res.status === 403) {
      const key = prompt('ใส่ Admin Key:');
      if (key) {
        localStorage.setItem('adminKey', key);
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify(body || {}),
        });
      }
    }
    return res.json();
  }

  function showToast(msg, kind) {
    toast.textContent = msg;
    toast.className = 'toast show ' + kind;
    setTimeout(() => (toast.className = 'toast'), 2500);
  }

  // ---- บันทึก ----
  $('save-btn').addEventListener('click', async () => {
    try {
      const data = await postJSON('/api/settings', readForm());
      if (data.ok) showToast('บันทึกแล้ว — overlay อัปเดตทันที ✓', 'ok');
      else showToast(data.error || 'บันทึกไม่สำเร็จ', 'err');
    } catch (e) {
      showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'err');
    }
  });

  // ---- คืนค่าเริ่มต้น ----
  $('reset-btn').addEventListener('click', async () => {
    if (!confirm('คืนค่าการตั้งค่า overlay ทั้งหมดเป็นค่าเริ่มต้น?')) return;
    try {
      const data = await postJSON('/api/settings/reset', {});
      if (data.ok) { settings = data.settings; fillForm(); updatePreview(); showToast('คืนค่าเริ่มต้นแล้ว', 'ok'); }
      else showToast(data.error || 'ไม่สำเร็จ', 'err');
    } catch (e) {
      showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'err');
    }
  });

  // ---- ทดสอบบน overlay จริง ----
  $('test-btn').addEventListener('click', () => {
    socket.emit('test-alert', { name: 'น้องเมย์', amount: 250, message: 'ทดสอบจาก Control Panel 🎉' });
    showToast('ส่งทดสอบไปที่ overlay แล้ว', 'ok');
  });

  // ลิงก์ OBS
  $('obs-url').textContent = location.origin + '/overlay.html';
})();
