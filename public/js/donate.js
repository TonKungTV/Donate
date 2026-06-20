// หน้าบริจาค: ขั้นที่ 1 กรอกข้อมูล -> ขั้นที่ 2 QR พร้อมเพย์ + อัปโหลดสลิป -> ขั้นที่ 3 สำเร็จ
(function () {
  const $ = (id) => document.getElementById(id);

  const stepForm = $('step-form');
  const stepPay = $('step-pay');
  const stepDone = $('step-done');

  const form = $('donate-form');
  const amountInput = $('amount');
  const submitBtn = $('submit-btn');
  const toast = $('toast');
  const toast2 = $('toast2');

  let currentId = null; // id ของรายการบริจาคที่กำลังดำเนินการ

  // ปุ่มเลือกจำนวนเงินด่วน
  const chips = document.querySelectorAll('.chip');
  function syncChips() {
    chips.forEach((c) => c.classList.toggle('selected', c.dataset.amount === amountInput.value));
  }
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      amountInput.value = chip.dataset.amount;
      syncChips();
      amountInput.focus();
    });
  });
  amountInput.addEventListener('input', syncChips);

  function showToast(el, message, kind) {
    el.textContent = message;
    el.className = 'toast show ' + kind;
  }
  function show(step) {
    stepForm.style.display = step === 'form' ? '' : 'none';
    stepPay.style.display = step === 'pay' ? '' : 'none';
    stepDone.style.display = step === 'done' ? '' : 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- ขั้นที่ 1: สร้าง QR ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    const message = $('message').value.trim();
    const amount = Number(amountInput.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast(toast, 'กรุณากรอกจำนวนเงินให้ถูกต้อง', 'err');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังสร้าง QR...';
    try {
      const res = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, amount, message }),
      });
      const data = await res.json();
      if (!data.ok) {
        showToast(toast, data.error || 'เกิดข้อผิดพลาด', 'err');
        return;
      }
      currentId = data.donation.id;
      $('qr-img').src = data.qr || '';
      $('pay-amount').textContent = Number(data.donation.amount).toLocaleString('th-TH');
      $('pp-id').textContent = data.promptpayId || '-';
      // รีเซ็ตฟอร์มอัปโหลดสลิป
      $('slip').value = '';
      $('slip-preview').style.display = 'none';
      toast2.className = 'toast';
      show('pay');
    } catch (err) {
      showToast(toast, 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'สร้าง QR พร้อมเพย์ 📱';
    }
  });

  // ---- พรีวิวสลิปก่อนอัปโหลด ----
  $('slip').addEventListener('change', () => {
    const file = $('slip').files[0];
    const preview = $('slip-preview');
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  });

  // ---- ขั้นที่ 2: อัปโหลดสลิป (ตรวจ OCR ก่อนยืนยัน) ----
  $('confirm-btn').addEventListener('click', async () => {
    const file = $('slip').files[0];
    if (!file) {
      showToast(toast2, 'กรุณาแนบสลิปการโอนก่อน', 'err');
      return;
    }
    const confirmBtn = $('confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ กำลังตรวจสลิป...';
    try {
      const fd = new FormData();
      fd.append('slip', file);
      const res = await fetch('/api/donations/' + currentId + '/slip', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        show('done');
      } else if (data.reason === 'not_a_slip') {
        showToast(toast2, '❌ ไม่ใช่สลิป หรืออ่านไม่ออก แนบสลิปที่ชัดเจน', 'err');
      } else if (data.reason === 'duplicate') {
        showToast(toast2, '❌ สลิปนี้ถูกใช้ไปแล้ว กรุณาใช้สลิปการโอนจริงครั้งใหม่', 'err');
      } else {
        showToast(toast2, data.error || 'อัปโหลดไม่สำเร็จ', 'err');
      }
    } catch (err) {
      showToast(toast2, 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', 'err');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'ยืนยันการโอน ✓';
    }
  });

  $('back-btn').addEventListener('click', () => show('form'));
  $('again-btn').addEventListener('click', () => {
    form.reset();
    toast.className = 'toast';
    show('form');
  });
})();
