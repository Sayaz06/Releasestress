// ═══════════════════════════════════════════════════════════
// MESIN IMEJ — xAI Imagine API (per-user key)
// ═══════════════════════════════════════════════════════════
let mesinImejState = {
  running: false,
  paused: false,
  stopRequested: false,
  queue: [], // { id, title, status: pending|generating|done|failed|skipped, error }
  currentIndex: 0,
  total: 0
};

function getXaiKeyStorageKey() {
  return currentUser ? `xaiApiKey_${currentUser.uid}` : null;
}

async function loadXaiApiKey() {
  if (!currentUser) return '';
  // 1) localStorage cache
  const lsKey = getXaiKeyStorageKey();
  let key = lsKey ? (localStorage.getItem(lsKey) || '') : '';
  // 2) Firestore settings
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "settings", "xaiApiKey"));
    if (snap.exists() && snap.data().key) {
      key = snap.data().key;
      if (lsKey) localStorage.setItem(lsKey, key);
    }
  } catch (e) {
    console.warn('loadXaiApiKey firestore', e);
  }
  return key || '';
}

async function saveXaiApiKey(key) {
  if (!currentUser) throw new Error('Belum login');
  const trimmed = (key || '').trim();
  await setDoc(doc(db, "users", currentUser.uid, "settings", "xaiApiKey"), {
    key: trimmed,
    updatedAt: Date.now()
  }, { merge: true });
  const lsKey = getXaiKeyStorageKey();
  if (lsKey) {
    if (trimmed) localStorage.setItem(lsKey, trimmed);
    else localStorage.removeItem(lsKey);
  }
}

async function deleteXaiApiKey() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid, "settings", "xaiApiKey"), {
      key: '',
      updatedAt: Date.now()
    }, { merge: true });
  } catch (e) {}
  const lsKey = getXaiKeyStorageKey();
  if (lsKey) localStorage.removeItem(lsKey);
}

async function refreshXaiKeyStatus() {
  const statusEl = document.getElementById('xai-key-status');
  const inputEl = document.getElementById('xai-api-key-input');
  if (!statusEl) return;
  if (!currentUser) {
    statusEl.textContent = 'Status: belum login';
    statusEl.style.color = 'var(--subtext)';
    return;
  }
  const key = await loadXaiApiKey();
  if (key) {
    statusEl.textContent = 'Status: ✅ Key ada';
    statusEl.style.color = '#22c55e';
    if (inputEl && !inputEl.value) inputEl.placeholder = '•••••••• (key tersimpan)';
  } else {
    statusEl.textContent = 'Status: ❌ Tiada key';
    statusEl.style.color = '#f87171';
  }
}

function initXaiApiKeyUI() {
  const btnSimpan = document.getElementById('btn-simpan-xai-key');
  const btnPadam = document.getElementById('btn-padam-xai-key');
  if (!btnSimpan || btnSimpan._mesinBound) return;
  btnSimpan._mesinBound = true;
  btnSimpan.addEventListener('click', async () => {
    const input = document.getElementById('xai-api-key-input');
    const val = (input?.value || '').trim();
    if (!val) { showToast('Sila tampal xAI API key.'); return; }
    try {
      await saveXaiApiKey(val);
      if (input) input.value = '';
      await refreshXaiKeyStatus();
      showToast('✅ API key disimpan (per akaun anda).');
    } catch (e) {
      showToast('❌ Gagal simpan key: ' + e.message);
    }
  });
  btnPadam.addEventListener('click', async () => {
    if (!confirm('Padam xAI API key dari akaun ini?')) return;
    await deleteXaiApiKey();
    const input = document.getElementById('xai-api-key-input');
    if (input) input.value = '';
    await refreshXaiKeyStatus();
    showToast('🗑️ Key dipadam.');
  });
  refreshXaiKeyStatus();
}

async function loadArahanImejForCurrentPerkataan() {
  const ta = document.getElementById('arahan-imej-textarea');
  const delayEl = document.getElementById('mesin-imej-delay');
  const modelEl = document.getElementById('mesin-imej-model');
  const aspectEl = document.getElementById('mesin-imej-aspect');
  if (!ta || !currentPerkataanId || !currentUser) return;
  const p = allBahasaPerkataan.find(x => x.id === currentPerkataanId);
  if (p) {
    ta.value = p.arahanImej || '';
    if (delayEl && p.delaySec != null) delayEl.value = p.delaySec;
    if (modelEl && p.imageModel) modelEl.value = p.imageModel;
    if (aspectEl && p.imageAspect) aspectEl.value = p.imageAspect;
  } else {
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid, "bahasa_perkataan", currentPerkataanId));
      if (snap.exists()) {
        const d = snap.data();
        ta.value = d.arahanImej || '';
        if (delayEl && d.delaySec != null) delayEl.value = d.delaySec;
        if (modelEl && d.imageModel) modelEl.value = d.imageModel;
        if (aspectEl && d.imageAspect) aspectEl.value = d.imageAspect;
      }
    } catch (e) {}
  }
}

async function simpanArahanImej() {
  if (!currentUser || !currentPerkataanId) {
    showToast('Tiada perkataan aktif.');
    return;
  }
  const arahan = (document.getElementById('arahan-imej-textarea')?.value || '').trim();
  const delaySec = parseInt(document.getElementById('mesin-imej-delay')?.value || '8', 10) || 8;
  const imageModel = document.getElementById('mesin-imej-model')?.value || 'grok-imagine-image';
  const imageAspect = document.getElementById('mesin-imej-aspect')?.value || '16:9';
  await setDoc(doc(db, "users", currentUser.uid, "bahasa_perkataan", currentPerkataanId), {
    arahanImej: arahan,
    delaySec,
    imageModel,
    imageAspect,
    updatedAt: Date.now()
  }, { merge: true });
  const p = allBahasaPerkataan.find(x => x.id === currentPerkataanId);
  if (p) {
    p.arahanImej = arahan;
    p.delaySec = delaySec;
    p.imageModel = imageModel;
    p.imageAspect = imageAspect;
  }
  showToast('✅ Arahan imej disimpan.');
}

function buildPromptForDrawer(arahanImej, drawer) {
  const title = (drawer.title || '').trim();
  const notes = (drawer.notes || '').trim();
  let body = title;
  if (notes) body += (body ? '\n\n' : '') + notes;
  const lines = notes.split('\n').map(l => l.trim()).filter(Boolean);
  const sample = lines.slice(0, 6).join('; ');
  const arahan = (arahanImej || '').trim() || 'Gaya ilustrasi sinematik, cahaya keemasan, tiada teks pada imej.';
  return `${arahan}\n\nSubjek / konteks: ${title || 'ilustrasi bahasa'}${sample ? '\nNota: ' + sample : ''}`.trim();
}

function aspectToRatioWH(aspect) {
  const map = {
    '16:9': [16, 9],
    '9:16': [9, 16],
    '4:3': [4, 3],
    '3:2': [3, 2],
    '1:1': [1, 1],
    'auto': [16, 9]
  };
  return map[aspect] || [16, 9];
}

async function callXaiImagine(prompt, { model, aspect_ratio, apiKey }) {
  const bodyBase = {
    model: model || 'grok-imagine-image',
    prompt,
    n: 1,
    aspect_ratio: aspect_ratio || '16:9'
  };
  let res = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({ ...bodyBase, response_format: 'b64_json' })
  });
  if (!res.ok) {
    res = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({ ...bodyBase, response_format: 'url' })
    });
  }
  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch (_) {}
    throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const item = json?.data?.[0];
  if (!item) throw new Error('Tiada data imej dalam respons API');
  if (item.b64_json) {
    const byteChars = atob(item.b64_json);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: item.mime_type || 'image/jpeg' });
  }
  if (item.url) {
    try {
      const imgRes = await fetch(item.url);
      if (imgRes.ok) return await imgRes.blob();
    } catch (_) {}
    const blob = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 1024;
          c.height = img.naturalHeight || 576;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob gagal')), 'image/jpeg', 0.92);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Gagal muat imej dari URL (CORS?)'));
      img.src = item.url;
    });
    return blob;
  }
  throw new Error('Tiada b64_json atau url dalam respons API');
}

async function downloadImageAsBlob(urlOrBlob) {
  if (urlOrBlob instanceof Blob) return urlOrBlob;
  const res = await fetch(urlOrBlob);
  if (!res.ok) throw new Error('Gagal muat turun imej: ' + res.status);
  return await res.blob();
}

async function uploadBlobToBahasaDrawer(drawerId, blob, ratioW, ratioH) {
  const storageRefPath = ref(storage, `users/${currentUser.uid}/bahasa_images/${drawerId}.jpg`);
  const uploadTask = uploadBytesResumable(storageRefPath, blob);
  await new Promise((resolve, reject) => {
    uploadTask.on('state_changed', null, reject, resolve);
  });
  const url = await getDownloadURL(uploadTask.snapshot.ref);
  await setDoc(doc(db, "users", currentUser.uid, "bahasa_drawers", drawerId), {
    imageUrl: url,
    imgRatioW: ratioW,
    imgRatioH: ratioH,
    updatedAt: Date.now()
  }, { merge: true });
  const d = allBahasaDrawers.find(x => x.id === drawerId);
  if (d) {
    d.imageUrl = url;
    d.imgRatioW = ratioW;
    d.imgRatioH = ratioH;
  }
  return url;
}

function updateMesinImejUI() {
  const prog = document.getElementById('mesin-imej-progress');
  const list = document.getElementById('mesin-imej-status-list');
  const btnMula = document.getElementById('btn-mesin-imej-mula');
  const btnJeda = document.getElementById('btn-mesin-imej-jeda');
  const btnSambung = document.getElementById('btn-mesin-imej-sambung');
  const btnHenti = document.getElementById('btn-mesin-imej-henti');
  const btnRetry = document.getElementById('btn-mesin-imej-retry');
  if (!prog || !list) return;

  const done = mesinImejState.queue.filter(q => q.status === 'done' || q.status === 'skipped').length;
  const failed = mesinImejState.queue.filter(q => q.status === 'failed').length;
  const total = mesinImejState.queue.length;
  prog.style.display = total ? 'block' : 'none';
  prog.textContent = total
    ? `Progress: ${done}/${total}` + (failed ? ` · Gagal: ${failed}` : '') + (mesinImejState.paused ? ' · ⏸ Jeda' : '') + (mesinImejState.running ? ' · ⏳ Berjalan...' : '')
    : '';

  list.style.display = total ? 'block' : 'none';
  list.innerHTML = mesinImejState.queue.map(q => {
    const icon = { pending: '⏳', generating: '🎨', done: '✅', failed: '❌', skipped: '⏭' }[q.status] || '•';
    const err = q.error ? ` — ${q.error}` : '';
    return `<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05);">${icon} <b>${(q.title || q.id).slice(0,40)}</b> <span style="color:var(--subtext)">${q.status}${err}</span></div>`;
  }).join('');

  const running = mesinImejState.running;
  if (btnMula) btnMula.style.display = running ? 'none' : '';
  if (btnJeda) btnJeda.style.display = running && !mesinImejState.paused ? '' : 'none';
  if (btnSambung) btnSambung.style.display = running && mesinImejState.paused ? '' : 'none';
  if (btnHenti) btnHenti.style.display = running ? '' : 'none';
  if (btnRetry) btnRetry.style.display = (!running && failed > 0) ? '' : 'none';
}

function sleepMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitWhilePaused() {
  while (mesinImejState.paused && !mesinImejState.stopRequested) {
    await sleepMs(300);
  }
}

async function runMesinImejQueue({ retryFailedOnly = false } = {}) {
  if (!currentUser || !currentPerkataanId) {
    showToast('Buka satu perkataan dulu.');
    return;
  }
  const apiKey = await loadXaiApiKey();
  if (!apiKey) {
    showToast('❌ Tiada xAI API key. Simpan key di halaman Laci Bahasa.');
    return;
  }

  await simpanArahanImej();

  const arahan = (document.getElementById('arahan-imej-textarea')?.value || '').trim();
  const delaySec = Math.max(0, parseInt(document.getElementById('mesin-imej-delay')?.value || '8', 10) || 8);
  const model = document.getElementById('mesin-imej-model')?.value || 'grok-imagine-image';
  const aspect = document.getElementById('mesin-imej-aspect')?.value || '16:9';
  const skipExisting = document.getElementById('mesin-imej-skip-existing')?.checked !== false;
  const [rW, rH] = aspectToRatioWH(aspect);

  const drawers = allBahasaDrawers
    .filter(d => d.perkataanId === currentPerkataanId)
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true }));

  if (!drawers.length) {
    showToast('Tiada laci dalam perkataan ini.');
    return;
  }

  if (retryFailedOnly) {
    mesinImejState.queue.forEach(q => {
      if (q.status === 'failed') q.status = 'pending';
    });
  } else {
    let targets = drawers;
    if (skipExisting) {
      targets = drawers.filter(d => !d.imageUrl);
    }
    if (!targets.length) {
      showToast('Semua laci sudah ada gambar (atau tiada laci).');
      return;
    }
    if (targets.length > 12) {
      if (!confirm(`Akan jana ${targets.length} imej.\nIni mungkin guna kuota API anda.\nTeruskan?`)) return;
    }
    mesinImejState.queue = targets.map(d => ({
      id: d.id,
      title: d.title || d.id,
      status: 'pending',
      error: null
    }));
  }

  mesinImejState.running = true;
  mesinImejState.paused = false;
  mesinImejState.stopRequested = false;
  updateMesinImejUI();

  const beforeUnload = (e) => {
    if (mesinImejState.running) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);

  try {
    for (let i = 0; i < mesinImejState.queue.length; i++) {
      if (mesinImejState.stopRequested) break;
      await waitWhilePaused();
      if (mesinImejState.stopRequested) break;

      const item = mesinImejState.queue[i];
      if (item.status === 'done' || item.status === 'skipped') continue;

      const drawer = allBahasaDrawers.find(d => d.id === item.id);
      if (!drawer) {
        item.status = 'failed';
        item.error = 'Laci tidak dijumpai';
        updateMesinImejUI();
        continue;
      }
      if (skipExisting && drawer.imageUrl && !retryFailedOnly) {
        item.status = 'skipped';
        updateMesinImejUI();
        continue;
      }

      item.status = 'generating';
      updateMesinImejUI();

      try {
        const prompt = buildPromptForDrawer(arahan, drawer);
        const imgBlob = await callXaiImagine(prompt, { model, aspect_ratio: aspect, apiKey });
        const blob = await downloadImageAsBlob(imgBlob);
        await uploadBlobToBahasaDrawer(drawer.id, blob, rW, rH);
        item.status = 'done';
        item.error = null;
      } catch (err) {
        item.status = 'failed';
        item.error = (err && err.message) ? err.message.slice(0, 120) : String(err);
        console.error('Mesin Imej gagal', item.id, err);
      }
      updateMesinImejUI();

      if (i < mesinImejState.queue.length - 1 && delaySec > 0 && !mesinImejState.stopRequested) {
        const end = Date.now() + delaySec * 1000;
        while (Date.now() < end) {
          if (mesinImejState.stopRequested) break;
          await waitWhilePaused();
          if (mesinImejState.stopRequested) break;
          await sleepMs(200);
        }
      }
    }
  } finally {
    mesinImejState.running = false;
    mesinImejState.paused = false;
    window.removeEventListener('beforeunload', beforeUnload);
    updateMesinImejUI();
    try { await renderBahasaDrawers(); } catch (_) {}
    const failed = mesinImejState.queue.filter(q => q.status === 'failed').length;
    const done = mesinImejState.queue.filter(q => q.status === 'done').length;
    showToast(failed ? `Selesai: ${done} ok, ${failed} gagal.` : `✅ Selesai jana ${done} imej.`);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Mesin Imej', { body: `Selesai: ${done} ok` + (failed ? `, ${failed} gagal` : '') });
      } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } catch (_) {}
  }
}

function initMesinImejUI() {
  const btnSimpan = document.getElementById('btn-simpan-arahan-imej');
  const btnMula = document.getElementById('btn-mesin-imej-mula');
  const btnJeda = document.getElementById('btn-mesin-imej-jeda');
  const btnSambung = document.getElementById('btn-mesin-imej-sambung');
  const btnHenti = document.getElementById('btn-mesin-imej-henti');
  const btnRetry = document.getElementById('btn-mesin-imej-retry');
  const btnToggle = document.getElementById('btn-toggle-mesin-imej');
  if (!btnMula || btnMula._mesinBound) return;
  btnMula._mesinBound = true;

  btnSimpan?.addEventListener('click', () => simpanArahanImej());
  btnMula.addEventListener('click', () => runMesinImejQueue());
  btnJeda?.addEventListener('click', () => {
    mesinImejState.paused = true;
    updateMesinImejUI();
  });
  btnSambung?.addEventListener('click', () => {
    mesinImejState.paused = false;
    updateMesinImejUI();
  });
  btnHenti?.addEventListener('click', () => {
    mesinImejState.stopRequested = true;
    mesinImejState.paused = false;
    showToast('Menghentikan selepas item semasa...');
  });
  btnRetry?.addEventListener('click', () => runMesinImejQueue({ retryFailedOnly: true }));
  btnToggle?.addEventListener('click', () => {
    const body = document.getElementById('mesin-imej-body');
    if (!body) return;
    const hide = body.style.display !== 'none';
    body.style.display = hide ? 'none' : '';
    btnToggle.textContent = hide ? 'Buka' : 'Tutup';
  });
}

(function () {
  const _rb = renderBahasaDrawers;
  renderBahasaDrawers = async function () {
    const ret = await _rb.apply(this, arguments);
    try {
      initMesinImejUI();
      await loadArahanImejForCurrentPerkataan();
    } catch (e) { console.warn('mesin imej hook', e); }
    return ret;
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  try { initXaiApiKeyUI(); } catch (e) {}
});
