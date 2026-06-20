// ===== Dashboard: สถิติเรียลไทม์ + ทดสอบแจ้งเตือน + จัดการประวัติ =====
(function () {
  const socket = io();
  let currency = '฿';

  const $ = (id) => document.getElementById(id);

  // ---- สถานะการเชื่อมต่อ ----
  const connEl = $('conn');
  function setConn(on) {
    connEl.innerHTML =
      '<span class="status-dot ' + (on ? 'on' : '') + '"></span>' +
      '<span class="muted" style="font-size:.8rem">' + (on ? 'online' : 'offline') + '</span>';
  }
  socket.on('connect', () => setConn(true));
  socket.on('disconnect', () => setConn(false));

  // ---- สถิติ ----
  socket.on('stats', (s) => {
    currency = s.currency || '฿';
    $('st-total').textContent = currency + fmt(s.total);
    $('st-count').textContent = fmt(s.count);
    $('st-avg').textContent = currency + fmt(s.average);
    $('st-top').textContent = s.top ? (s.top.name + ' · ' + currency + fmt(s.top.amount)) : '-';
  });

  // ---- ประวัติ: โหลดครั้งแรก + อัปเดตเมื่อมีบริจาคใหม่ ----
  const historyEl = $('history');
  let history = [];

  async function loadHistory() {
    try {
      const res = await fetch('/api/donations?limit=50');
      const data = await res.json();
      if (data.ok) {
        history = data.donations;
        renderHistory();
      }
    } catch (e) { /* ignore */ }
  }

  function renderHistory() {
    if (!history.length) {
      historyEl.innerHTML = '<li class="empty">ยังไม่มีรายการบริจาค</li>';
      return;
    }
    historyEl.innerHTML = '';
    history.forEach((d) => {
      const li = document.createElement('li');
      li.className = 'history-item';

      // ป้ายสถานะตรวจสลิป
      const V = { verified:  ['v-ok',   '✅ ตรวจแล้ว'],
                  unverified:['v-warn', '⚠️ ชื่อไม่ตรง—ตรวจเอง'],
                  error:     ['v-err',  '🔁 ตรวจไม่ได้'] };
      if (d.verify && V[d.verify.status]) {
        li.classList.add('flagged-' + d.verify.status);
      }

      const left = document.createElement('div');
      left.style.flex = '1';
      const name = document.createElement('span');
      name.className = 'h-name';
      name.textContent = d.name;
      left.append(name);
      if (d.message) {
        const msg = document.createElement('span');
        msg.className = 'h-msg';
        msg.textContent = d.message;
        left.append(msg);
      }

      const amount = document.createElement('span');
      amount.className = 'h-amount';
      amount.textContent = currency + fmt(d.amount);

      const right = document.createElement('div');
      right.style.textAlign = 'right';
      const time = document.createElement('span');
      time.className = 'h-time';
      time.textContent = timeAgo(d.createdAt);
      right.append(time);
      if (d.slip) {
        const link = document.createElement('a');
        link.href = d.slip;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '🧾 ดูสลิป';
        link.style.cssText = 'display:block;font-size:.78rem';
        right.append(link);
      }

      if (d.verify && V[d.verify.status]) {
        const badge = document.createElement('span');
        badge.className = 'verify-badge ' + V[d.verify.status][0];
        badge.textContent = V[d.verify.status][1];
        badge.style.cssText = 'display:block;font-size:.72rem;margin-top:2px';
        right.append(badge);
      }

      li.append(left, amount, right);
      historyEl.append(li);
    });
  }

  socket.on('donation', (d) => {
    if (d.test) return; // ไม่นับรายการทดสอบ
    // โหลดประวัติใหม่เพื่อให้ได้ลิงก์สลิปที่ถูกต้อง
    loadHistory();
  });

  // ---- ทดสอบแจ้งเตือน ----
  $('t-send').addEventListener('click', () => {
    socket.emit('test-alert', {
      name: $('t-name').value.trim(),
      amount: Number($('t-amount').value) || 99,
      message: $('t-message').value.trim(),
    });
    const btn = $('t-send');
    btn.textContent = 'ส่งแล้ว ✓';
    setTimeout(() => (btn.textContent = 'ยิงแจ้งเตือนทดสอบ'), 1200);
  });

  // ---- ล้างข้อมูล ----
  $('clear-btn').addEventListener('click', async () => {
    if (!confirm('ต้องการล้างประวัติการบริจาคทั้งหมด?')) return;
    try {
      const res = await fetch('/api/donations', { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { history = []; renderHistory(); }
      else alert(data.error || 'ล้างข้อมูลไม่สำเร็จ');
    } catch (e) { alert('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'); }
  });

  // ---- ลิงก์ OBS ----
  const obsUrl = location.origin + '/overlay.html';
  $('obs-url').value = obsUrl;
  $('copy-url').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(obsUrl);
      const btn = $('copy-url');
      btn.textContent = 'คัดลอกแล้ว ✓';
      setTimeout(() => (btn.textContent = 'คัดลอก'), 1500);
    } catch (e) {
      $('obs-url').select();
    }
  });

  // ---- helpers ----
  function fmt(n) {
    return Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return Math.floor(s / 60) + ' นาทีก่อน';
    if (s < 86400) return Math.floor(s / 3600) + ' ชม.ก่อน';
    return new Date(ts).toLocaleDateString('th-TH');
  }

  loadHistory();
})();
