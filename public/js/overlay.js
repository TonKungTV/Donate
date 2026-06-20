// ============================================================
// Overlay logic — แสดงแจ้งเตือนทีละรายการ พร้อมระบบ tier + particle
// ลำดับการตั้งค่า: query string > Control Panel (เซิร์ฟเวอร์) > ค่าเริ่มต้น
// ============================================================
(function () {
  const stage = document.getElementById('stage');
  const flashEl = document.getElementById('flash');
  const socket = io();

  // ---------- อ่าน override จาก query string ----------
  const params = new URLSearchParams(location.search);
  const qpNum = (k) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : undefined);
  const qpBool = (k) => {
    if (!params.has(k)) return undefined;
    const v = params.get(k);
    return v === '1' || v === 'true' || v === 'yes';
  };
  const clean = (o) => { const r = {}; for (const k in o) if (o[k] !== undefined) r[k] = o[k]; return r; };
  const queryOverrides = clean({
    duration: qpNum('duration'),
    soundEnabled: qpBool('sound'),
    ttsEnabled: qpBool('tts'),
    ttsLang: params.get('lang') || undefined,
    speakAmount: qpBool('speakAmount'),
    volume: qpNum('volume'),
    confettiEnabled: qpBool('confetti'),
    minTts: qpNum('minTts'),
    currency: params.get('currency') || undefined,
    position: params.get('position') || undefined,
  });

  let settings = {
    duration: 8000, soundEnabled: true, volume: 0.6,
    ttsEnabled: true, ttsLang: 'th-TH', speakAmount: true, minTts: 0,
    confettiEnabled: true, accentColor: '#b14dff', accentColor2: '#2ce8f5',
    textColor: '#ffffff', position: 'top',
    headlineTemplate: '{name} บริจาค {amount}', currency: '฿',
    ttsProvider: 'elevenlabs', ttsVoiceId: 'cgSgspJ2msm6clMCkdW9',
  };

  function applySettings(next) {
    settings = { ...settings, ...next, ...queryOverrides };
    document.documentElement.style.setProperty('--txt', settings.textColor);
    stage.classList.toggle('pos-center', settings.position === 'center');
  }
  applySettings({});
  socket.on('settings', (s) => applySettings(s || {}));

  // ---------- ระบบ tier ตามยอดบริจาค ----------
  function tierFor(amount) {
    if (amount >= 1000) return { key: 'legendary', label: 'LEGENDARY', emoji: '👑', c1: '#ffd24a', c2: '#ff7a00', particles: 150, flash: true };
    if (amount >= 500)  return { key: 'mega',      label: 'MEGA',      emoji: '🤩', c1: '#ff3ca6', c2: '#b14dff', particles: 90,  flash: false };
    if (amount >= 100)  return { key: 'hype',      label: 'HYPE',      emoji: '🎉', c1: '#2ce8f5', c2: '#7a5cff', particles: 60,  flash: false };
    return { key: 'spark', label: 'SPARK', emoji: '💜', c1: settings.accentColor, c2: settings.accentColor2, particles: 36, flash: false };
  }

  // ---------- คิว ----------
  const queue = [];
  let busy = false;
  socket.on('donation', (d) => { queue.push(d); processQueue(); });
  function processQueue() {
    if (busy || queue.length === 0) return;
    busy = true;
    showAlert(queue.shift());
  }

  // ---------- แสดงการ์ด ----------
  function showAlert(d) {
    const tier = tierFor(d.amount);
    const root = document.documentElement.style;
    root.setProperty('--acc1', tier.c1);
    root.setProperty('--acc2', tier.c2);

    const card = document.createElement('div');
    card.className = 'alert enter tier-' + tier.key;

    const shock = document.createElement('div');
    shock.className = 'shock';

    const badge = document.createElement('div');
    badge.className = 'tier-badge';
    badge.textContent = tier.label;

    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = tier.emoji;

    const headline = document.createElement('div');
    headline.className = 'headline';
    headline.append(renderHeadline(settings.headlineTemplate, d));

    card.append(shock, badge, emoji, headline);

    if (d.message) {
      const msg = document.createElement('div');
      msg.className = 'message';
      msg.textContent = '“' + d.message + '”';
      card.append(msg);
    }
    const bar = document.createElement('div');
    bar.className = 'underbar';
    card.append(bar);

    stage.innerHTML = '';
    stage.append(card);

    // เอฟเฟกต์
    if (settings.soundEnabled) playChime(tier);
    if (settings.confettiEnabled) burst(tier);
    if (tier.flash) { flashEl.classList.remove('boom'); void flashEl.offsetWidth; flashEl.classList.add('boom'); }

    let ttsDuration = 0;
    if (settings.ttsEnabled && d.amount >= settings.minTts) ttsDuration = speak(d);

    const visibleFor = Math.max(settings.duration, ttsDuration);
    setTimeout(() => {
      card.classList.remove('enter');
      card.classList.add('leave');
      setTimeout(() => {
        if (card.parentNode) card.parentNode.removeChild(card);
        busy = false;
        processQueue();
      }, 460);
    }, visibleFor);
  }

  // ---------- แปลง template เป็น DOM (กัน XSS ด้วย textContent) ----------
  function renderHeadline(template, d) {
    const frag = document.createDocumentFragment();
    const re = /\{(name|amount|currency|message)\}/g;
    let last = 0, m;
    while ((m = re.exec(template)) !== null) {
      if (m.index > last) frag.append(document.createTextNode(template.slice(last, m.index)));
      const t = m[1];
      if (t === 'name') { const s = document.createElement('span'); s.className = 'donor'; s.textContent = d.name; frag.append(s); }
      else if (t === 'amount') { const s = document.createElement('span'); s.className = 'amount'; s.textContent = settings.currency + fmt(d.amount); frag.append(s); }
      else if (t === 'currency') frag.append(document.createTextNode(settings.currency));
      else if (t === 'message') frag.append(document.createTextNode(d.message || ''));
      last = m.index + m[0].length;
    }
    if (last < template.length) frag.append(document.createTextNode(template.slice(last)));
    return frag;
  }

  // ---------- เสียง (Web Audio) ----------
  // เบราว์เซอร์บล็อกเสียงอัตโนมัติจนกว่าจะมี user interaction; OBS เปิด autoplay ให้อยู่แล้ว
  let audioCtx = null;
  const inOBS = /OBS/i.test(navigator.userAgent || '');

  function getCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // ปลดล็อกเสียงเมื่อผู้ใช้คลิก/กดปุ่ม/แตะครั้งแรก
  function unlockAudio() {
    const ctx = getCtx();
    if ('speechSynthesis' in window) { try { window.speechSynthesis.resume(); } catch (e) {} }
    if (ctx && ctx.state === 'running') hideAudioHint();
  }
  ['pointerdown', 'click', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlockAudio, { passive: true }));

  // ป้าย "คลิกเพื่อเปิดเสียง" — โชว์เฉพาะตอนเปิดในเบราว์เซอร์ที่เสียงยังถูกบล็อก
  let audioHint = null;
  function showAudioHint() {
    if (inOBS || audioHint) return;
    audioHint = document.createElement('div');
    audioHint.id = 'audio-hint';
    audioHint.textContent = '🔊 คลิกที่หน้านี้หนึ่งครั้งเพื่อเปิดเสียง';
    document.body.append(audioHint);
  }
  function hideAudioHint() { if (audioHint) { audioHint.remove(); audioHint = null; } }

  // ตรวจสถานะเสียงตอนโหลด (ไม่ใช่ OBS และยังถูกบล็อก -> โชว์ป้าย)
  if (!inOBS) {
    const probe = getCtx();
    if (!probe || probe.state !== 'running') showAudioHint();
  }

  function playChime(tier) {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === 'running') hideAudioHint();
      const now = ctx.currentTime;
      // tier สูง = โน้ตเยอะ/สูงขึ้น
      const base = [523.25, 659.25, 783.99, 1046.5];
      const extra = tier.key === 'legendary' ? [1318.5, 1567.98] : tier.key === 'mega' ? [1318.5] : [];
      const seq = base.concat(extra);
      seq.forEach((f, i) => {
        const t = i * 0.1;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0, now + t);
        gain.gain.linearRampToValueAtTime(settings.volume, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.45);
      });
    } catch (e) { /* ข้าม */ }
  }

  // ---------- TTS ----------
  // โหลดรายการเสียงไว้ล่วงหน้า (getVoices มักว่างตอนเปิดหน้า แล้วค่อยมาทาง onvoiceschanged)
  let voices = [];
  function loadVoices() {
    if ('speechSynthesis' in window) voices = window.speechSynthesis.getVoices() || [];
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  // เลือกเสียงให้ตรงกับภาษาที่ตั้งไว้ (เช่น th-TH = ภาษาไทย) ถ้าไม่มีค่อยปล่อยให้ระบบเลือกเอง
  function pickVoice(lang) {
    if (!voices.length) loadVoices();
    const want = (lang || 'th-TH').toLowerCase();
    const prefix = want.split('-')[0];
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase() === want) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(prefix)) ||
      null
    );
  }

  // เล่นเสียงเบราว์เซอร์ (fallback)
  function speakBrowser(text) {
    if (!('speechSynthesis' in window)) return 0;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = settings.ttsLang || 'th-TH';
      const voice = pickVoice(u.lang);
      if (voice) u.voice = voice;
      u.rate = 1; u.pitch = 1; u.volume = 1;
      setTimeout(() => window.speechSynthesis.speak(u), 500);
      return Math.max(2000, text.length * 75 + 600);
    } catch (e) { return 0; }
  }

  // เล่นเสียงจาก ElevenLabs (ผ่าน /api/tts); ถ้าพลาด -> fallback เบราว์เซอร์
  function speakElevenLabs(text) {
    try {
      const audio = new Audio('/api/tts?text=' + encodeURIComponent(text));
      audio.volume = Math.min(1, Math.max(0, settings.volume));
      audio.addEventListener('error', () => speakBrowser(text)); // เช่น 502/503 -> fallback
      const p = audio.play();
      if (p && p.catch) p.catch(() => speakBrowser(text));
    } catch (e) { speakBrowser(text); }
  }

  function speak(d) {
    let text = '';
    if (settings.speakAmount) text += d.name + ' บริจาค ' + fmt(d.amount) + ' บาท. ';
    if (d.message) text += d.message;
    if (!text.trim()) return 0;
    if (settings.ttsProvider === 'elevenlabs') speakElevenLabs(text);
    else speakBrowser(text);
    // คืนเวลาประมาณการให้การ์ดค้างพออ่านจบ (ElevenLabs เล่นแบบ async)
    return Math.max(2000, text.length * 75 + 600);
  }

  // ---------- Particle engine (canvas) ----------
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let rafId = null;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  function burst(tier) {
    const cx = window.innerWidth / 2;
    const cy = settings.position === 'center' ? window.innerHeight / 2 : window.innerHeight * 0.26;
    const colors = [tier.c1, tier.c2, '#ffffff', '#ffd24a'];
    const n = tier.particles;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 9;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 3,
        size: 3 + Math.random() * 5,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.22;        // แรงโน้มถ่วง
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > window.innerHeight + 30) { particles.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (particles.length > 0) rafId = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); rafId = null; }
  }

  // ---------- helpers ----------
  function fmt(n) { return Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }

  socket.on('connect', () => console.log('[overlay] เชื่อมต่อเซิร์ฟเวอร์แล้ว'));
  socket.on('disconnect', () => console.log('[overlay] หลุดการเชื่อมต่อ'));

  // ---------- โหมดทดสอบ: /overlay.html?demo=1500 ยิงตัวอย่างแจ้งเตือนตอนโหลด ----------
  if (params.has('demo')) {
    const amt = Number(params.get('demo')) || 250;
    setTimeout(() => {
      queue.push({ name: 'น้องเมย์', amount: amt, message: 'ทดสอบ overlay เฟี้ยว ๆ สุด ๆ! 🎉', createdAt: Date.now() });
      processQueue();
    }, 500);
  }
})();
