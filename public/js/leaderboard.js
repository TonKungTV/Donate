// ===== Leaderboard: แสดงอันดับผู้บริจาคสูงสุดแบบเรียลไทม์ =====
(function () {
  const socket = io();
  const listEl = document.getElementById('leaderboard');
  let currency = '฿';

  socket.on('stats', (s) => { currency = s.currency || '฿'; });

  socket.on('leaderboard', (rows) => render(rows));

  function render(rows) {
    if (!rows || !rows.length) {
      listEl.innerHTML = '<li class="empty">ยังไม่มีผู้บริจาค — มาเป็นคนแรกกันเถอะ!</li>';
      return;
    }
    listEl.innerHTML = '';
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'lb-item';

      const rank = document.createElement('div');
      rank.className = 'lb-rank' + (i === 0 ? ' gold' : i === 1 ? ' silver' : i === 2 ? ' bronze' : '');
      rank.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : (i + 1);

      const nameWrap = document.createElement('div');
      nameWrap.className = 'lb-name';
      nameWrap.textContent = r.name;
      const meta = document.createElement('span');
      meta.className = 'lb-meta';
      meta.textContent = '  ·  ' + r.count + ' ครั้ง';
      nameWrap.append(meta);

      const amount = document.createElement('div');
      amount.className = 'lb-amount';
      amount.textContent = currency + Number(r.total).toLocaleString('th-TH', { maximumFractionDigits: 2 });

      li.append(rank, nameWrap, amount);
      listEl.append(li);
    });
  }

  // เผื่อ socket ยังไม่ส่งทันที ดึงผ่าน REST ครั้งแรกด้วย
  fetch('/api/leaderboard').then((r) => r.json()).then((d) => {
    if (d.ok) render(d.leaderboard);
  }).catch(() => {});
})();
