// ─── KYC DIRECT app.js ────────────────────────────────────────────────────────

const DB_KEY      = 'kycdirect_v2_docs';
const SIG_KEY     = 'kycdirect_v2_sig';
const LOG_KEY     = 'kycdirect_v2_log';

const IDS = [
  { id: 'pan',      name: 'PAN Card',        sides: ['Front'] },
  { id: 'aadhaar',  name: 'Aadhaar Card',    sides: ['Front', 'Back'] },
  { id: 'dl',       name: 'Driving License', sides: ['Front', 'Back'] },
  { id: 'passport', name: 'Passport',        sides: ['Front'] },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {
  docs: {},
  currentDoc: null,
  currentSide: 0,
  sigData: null,          // drawn signature data URL
  sigImageData: null,     // uploaded signature image data URL
  selectedShareId: null,
  includeStamp: true,
  includeSig: true,
  shareLog: [],           // [{ docName, recipient, date }]
  docZoom: {},            // { [docId]: number 50–200 } per-document zoom %
};

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────
function loadState() {
  try {
    const d = localStorage.getItem(DB_KEY);
    if (d) state.docs = JSON.parse(d);
    const s = localStorage.getItem(SIG_KEY);
    if (s) { const p = JSON.parse(s); state.sigData = p.drawn || null; state.sigImageData = p.image || null; }
    const l = localStorage.getItem(LOG_KEY);
    if (l) state.shareLog = JSON.parse(l);
  } catch(e) {}
}

function saveState() {
  setTimeout(() => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(state.docs)); } catch(e) { toast('Storage full', 'error'); }
  }, 0);
}

function saveSig() {
  try { localStorage.setItem(SIG_KEY, JSON.stringify({ drawn: state.sigData, image: state.sigImageData })); } catch(e) {}
}

function saveLog() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(state.shareLog.slice(0, 50))); } catch(e) {}
}

function addLogEntry(docName, recipient) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase();
  state.shareLog.unshift({ docName, recipient: recipient || '—', date: dateStr });
  saveLog();
  renderShareLog();
}

// ─── DOM HELPERS ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = $(`screen-${name}`);
  if (s) s.classList.add('active');
}

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderVault();
  renderShareList();
  renderShareLog();
  setupNav();
  setupCrop();
  setupSig();
  setupShare();
  setupSigUpload();
  setupBackup();
  setupPrivacyToggle();
  updateStorageBar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

// ─── NAV ──────────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const s = tab.dataset.screen;
      if (s === 'vault') { showScreen('vault'); renderVault(); }
      else if (s === 'share') { showScreen('share'); renderShareList(); renderShareLog(); updateA4Preview(); }
    });
  });
}

// ─── VAULT SCREEN ─────────────────────────────────────────────────────────────
function renderVault() {
  const grid = $('idGrid');
  grid.innerHTML = '';
  IDS.forEach(id => {
    const hasFront = !!state.docs[`${id.id}_${id.sides[0]}`];
    const card = document.createElement('div');
    card.className = `id-card ${hasFront ? 'has-data' : ''}`;

    const vis = document.createElement('div');
    vis.className = `id-card-visual${hasFront ? ' has-img' : ''}`;
    if (hasFront) {
      const img = document.createElement('img');
      img.className = 'preview-img';
      img.src = state.docs[`${id.id}_${id.sides[0]}`];
      img.alt = '';
      vis.appendChild(img);
    }

    const info = document.createElement('div');
    info.className = 'id-card-info';
    info.innerHTML = `
      <div class="id-card-name">${id.name}</div>
      <div class="id-card-status">${hasFront ? '✓ stored' : 'tap to add'}</div>`;

    card.appendChild(vis);
    card.appendChild(info);
    card.addEventListener('click', () => openDocDetail(id));
    grid.appendChild(card);
  });

  // Render sig upload area
  const area = $('sigUploadArea');
  const activeSig = state.sigImageData || state.sigData;
  if (activeSig) {
    area.innerHTML = `<img src="${activeSig}" alt="signature">`;
  } else {
    area.innerHTML = `<span class="sig-upload-txt">tap to upload signature image</span>`;
  }
}

// ─── SIGNATURE IMAGE UPLOAD (vault) ──────────────────────────────────────────
function setupSigUpload() {
  $('sigUploadArea').addEventListener('click', () => $('sigImageInput').click());
  $('sigImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      state.sigImageData = ev.target.result;
      saveSig();
      renderVault();
      toast('Signature saved', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

// ─── DOC DETAIL ───────────────────────────────────────────────────────────────
function openDocDetail(idDef) {
  state.currentDoc = idDef;
  state.currentSide = 0;
  $('docTitle').textContent = idDef.name;
  renderSideTabs();
  renderDocSide();
  showScreen('doc');
  $('btnBack').onclick = () => showScreen('vault');
}

function renderSideTabs() {
  const container = $('sideTabs');
  container.innerHTML = '';
  state.currentDoc.sides.forEach((side, i) => {
    const btn = document.createElement('button');
    btn.className = `side-tab ${i === state.currentSide ? 'active' : ''}`;
    btn.textContent = side;
    btn.onclick = () => { state.currentSide = i; renderSideTabs(); renderDocSide(); };
    container.appendChild(btn);
  });
}

function renderDocSide() {
  const idDef = state.currentDoc;
  const side  = idDef.sides[state.currentSide];
  const key   = `${idDef.id}_${side}`;
  const img   = state.docs[key];
  const slot  = $('imageSlot');

  if (img) {
    slot.innerHTML = `<img class="slot-img-preview" src="${img}" alt="">`;
    slot.classList.add('has-image');
    $('btnRemove').style.display = '';
  } else {
    slot.innerHTML = `<span class="slot-text">tap to capture or upload</span>
      <span class="slot-hint">${side} · ${idDef.name}</span>`;
    slot.classList.remove('has-image');
    $('btnRemove').style.display = 'none';
  }

  slot.onclick = () => openImagePicker(key);
  $('btnCamera').onclick = () => triggerCamera(key);
  $('btnUpload').onclick  = () => openImagePicker(key);
  $('btnRemove').onclick  = () => { delete state.docs[key]; saveState(); renderDocSide(); renderVault(); toast('Removed', 'success'); };
}

// ─── IMAGE INPUT ──────────────────────────────────────────────────────────────
function openImagePicker(key) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = e => handleImageFile(e.target.files[0], key);
  inp.click();
}

function triggerCamera(key) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
  inp.onchange = e => handleImageFile(e.target.files[0], key);
  inp.click();
}

function handleImageFile(file, key) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) toast('Loading image…', '');
  const reader = new FileReader();
  reader.onload = e => {
    // Downsample to max 1200px before crop modal — keeps crop canvas fast on mobile
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      if (img.width <= MAX && img.height <= MAX) {
        openCropModal(e.target.result, key);
        return;
      }
      const ratio  = Math.min(MAX / img.width, MAX / img.height);
      const oc     = document.createElement('canvas');
      oc.width     = Math.round(img.width  * ratio);
      oc.height    = Math.round(img.height * ratio);
      oc.getContext('2d').drawImage(img, 0, 0, oc.width, oc.height);
      openCropModal(oc.toDataURL('image/jpeg', 0.92), key);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ─── CROP / ENHANCE ───────────────────────────────────────────────────────────
let cropState = { rotation: 0, brightness: 100, sharpness: 0, flipH: false, flipV: false, srcImg: null,
                  cropX: 0.05, cropY: 0.05, cropW: 0.9, cropH: 0.9, dragging: false, resizing: false };
let cropTargetKey = null;

function openCropModal(src, key) {
  cropTargetKey = key;
  Object.assign(cropState, { rotation: 0, brightness: 100, sharpness: 0, flipH: false, flipV: false,
                              cropX: 0.05, cropY: 0.05, cropW: 0.9, cropH: 0.9 });
  $('brightnessVal').textContent = '100';
  $('sharpnessVal').textContent  = '0';
  $('rangeBrightness').value = 100;
  $('rangeSharpness').value  = 0;
  const img = new Image();
  img.onload = () => { cropState.srcImg = img; drawCropCanvas(); };
  img.src = src;
  $('cropModal').classList.add('active');
}

function setupCrop() {
  const canvas = $('cropCanvas');

  $('rangeBrightness').addEventListener('input', e => { cropState.brightness = +e.target.value; $('brightnessVal').textContent = e.target.value; drawCropCanvas(); });
  $('rangeSharpness').addEventListener('input',  e => { cropState.sharpness  = +e.target.value; $('sharpnessVal').textContent  = e.target.value; drawCropCanvas(); });

  $('btnRotateL').onclick   = () => { cropState.rotation -= 90; drawCropCanvas(); };
  $('btnRotateR').onclick   = () => { cropState.rotation += 90; drawCropCanvas(); };
  $('btnRotate180').onclick = () => { cropState.rotation += 180; drawCropCanvas(); };
  $('btnFlipH').onclick     = () => { cropState.flipH = !cropState.flipH; drawCropCanvas(); };
  $('btnFlipV').onclick     = () => { cropState.flipV = !cropState.flipV; drawCropCanvas(); };

  $('btnCancelCrop').onclick = () => $('cropModal').classList.remove('active');
  $('btnApplyCrop').onclick  = applyCrop;

  // Touch/mouse drag for crop handles
  let dragStartX, dragStartY, dragType, origCrop;

  const getPos = e => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx / rect.width, y: cy / rect.height };
  };

  const onStart = e => {
    e.preventDefault();
    const p = getPos(e);
    origCrop = { ...cropState };
    dragStartX = p.x; dragStartY = p.y;
    const ex = cropState.cropX + cropState.cropW, ey = cropState.cropY + cropState.cropH;
    const near = (a, b) => Math.abs(a - b) < 0.06;
    if (near(p.x, ex) && near(p.y, ey)) dragType = 'br';
    else if (near(p.x, cropState.cropX) && near(p.y, cropState.cropY)) dragType = 'tl';
    else if (p.x > cropState.cropX && p.x < ex && p.y > cropState.cropY && p.y < ey) dragType = 'move';
    else dragType = null;
  };

  const onMove = e => {
    if (!dragType) return;
    e.preventDefault();
    const p = getPos(e);
    const dx = p.x - dragStartX, dy = p.y - dragStartY;
    if (dragType === 'move') {
      cropState.cropX = Math.max(0, Math.min(1 - origCrop.cropW, origCrop.cropX + dx));
      cropState.cropY = Math.max(0, Math.min(1 - origCrop.cropH, origCrop.cropY + dy));
    } else if (dragType === 'br') {
      cropState.cropW = Math.max(0.1, Math.min(1 - origCrop.cropX, origCrop.cropW + dx));
      cropState.cropH = Math.max(0.1, Math.min(1 - origCrop.cropY, origCrop.cropH + dy));
    } else if (dragType === 'tl') {
      const nw = origCrop.cropW - dx, nh = origCrop.cropH - dy;
      if (nw > 0.1) { cropState.cropX = origCrop.cropX + dx; cropState.cropW = nw; }
      if (nh > 0.1) { cropState.cropY = origCrop.cropY + dy; cropState.cropH = nh; }
    }
    drawCropCanvas();
  };

  const onEnd = () => { dragType = null; };

  canvas.addEventListener('mousedown',  onStart);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onEnd);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove',  onMove,  { passive: false });
  canvas.addEventListener('touchend',   onEnd);
}

let _cropRafPending = false;
function drawCropCanvas() {
  if (_cropRafPending) return;
  _cropRafPending = true;
  requestAnimationFrame(() => {
    _cropRafPending = false;
    _drawCropCanvasNow();
  });
}
function _drawCropCanvasNow() {
  const canvas = $('cropCanvas');
  const img = cropState.srcImg;
  if (!img) return;

  const dispW = canvas.parentElement.clientWidth || 300;
  const aspect = img.width / img.height;
  canvas.width  = dispW;
  canvas.height = dispW / aspect;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw image with rotation/flip/brightness
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((cropState.rotation * Math.PI) / 180);
  ctx.scale(cropState.flipH ? -1 : 1, cropState.flipV ? -1 : 1);
  const br = cropState.brightness / 100;
  ctx.filter = `brightness(${br})`;
  ctx.drawImage(img, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.filter = 'none';
  ctx.restore();

  // Dim outside crop
  const cx = cropState.cropX * canvas.width, cy = cropState.cropY * canvas.height;
  const cw = cropState.cropW * canvas.width, ch = cropState.cropH * canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, canvas.width, cy);
  ctx.fillRect(0, cy + ch, canvas.width, canvas.height - cy - ch);
  ctx.fillRect(0, cy, cx, ch);
  ctx.fillRect(cx + cw, cy, canvas.width - cx - cw, ch);

  // Crop border
  ctx.strokeStyle = 'rgba(160,120,80,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx, cy, cw, ch);

  // Corner handles
  const hs = 8;
  ctx.fillStyle = 'rgba(160,120,80,0.9)';
  [[cx, cy], [cx + cw - hs, cy], [cx, cy + ch - hs], [cx + cw - hs, cy + ch - hs]].forEach(([x, y]) => ctx.fillRect(x, y, hs, hs));
}

function applyCrop() {
  const img = cropState.srcImg;
  if (!img) return;

  const off = document.createElement('canvas');
  off.width  = img.width;
  off.height = img.height;
  const ctx = off.getContext('2d');

  ctx.save();
  ctx.translate(off.width / 2, off.height / 2);
  ctx.rotate((cropState.rotation * Math.PI) / 180);
  ctx.scale(cropState.flipH ? -1 : 1, cropState.flipV ? -1 : 1);
  ctx.filter = `brightness(${cropState.brightness / 100})`;
  ctx.drawImage(img, -off.width / 2, -off.height / 2);
  ctx.filter = 'none';
  ctx.restore();

  // Apply sharpness — work on a downscaled copy to keep it fast, then scale back
  if (cropState.sharpness > 0) {
    const SHARP_MAX = 800;
    if (off.width > SHARP_MAX || off.height > SHARP_MAX) {
      const sr   = Math.min(SHARP_MAX / off.width, SHARP_MAX / off.height);
      const small = document.createElement('canvas');
      small.width  = Math.round(off.width  * sr);
      small.height = Math.round(off.height * sr);
      const sctx = small.getContext('2d');
      sctx.drawImage(off, 0, 0, small.width, small.height);
      applySharpness(sctx, small.width, small.height, cropState.sharpness / 100);
      ctx.drawImage(small, 0, 0, off.width, off.height);
    } else {
      applySharpness(ctx, off.width, off.height, cropState.sharpness / 100);
    }
  }

  // Crop
  const cropX = cropState.cropX * off.width,  cropY = cropState.cropY * off.height;
  const cropW = cropState.cropW * off.width,   cropH = cropState.cropH * off.height;
  const final = document.createElement('canvas');
  final.width = cropW; final.height = cropH;
  final.getContext('2d').drawImage(off, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Cap resolution to 1600px wide before optimising — prevents freezing on large phone photos
  const MAX_W = 1600;
  let finalOpt = final;
  if (final.width > MAX_W) {
    const ratio = MAX_W / final.width;
    const scaled = document.createElement('canvas');
    scaled.width  = MAX_W;
    scaled.height = Math.round(final.height * ratio);
    scaled.getContext('2d').drawImage(final, 0, 0, scaled.width, scaled.height);
    finalOpt = scaled;
  }

  // Auto-optimise once at save time — never again on render
  const optimised = autoOptimise(finalOpt);
  const dataURL = optimised.toDataURL('image/jpeg', 0.92);
  state.docs[cropTargetKey] = dataURL;
  saveState();
  renderDocSide();
  renderVault();
  $('cropModal').classList.remove('active');
  toast('Saved', 'success');
  updateStorageBar();
  setTimeout(() => showNudge(), 900);
}

function applySharpness(ctx, w, h, amount) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const kernel = [-1, -1, -1, -1, 8 + (1 / (amount + 0.001)), -1, -1, -1, -1];
  const tmp = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++)
            v += tmp[((y + ky) * w + (x + kx)) * 4 + c] * kernel[(ky + 1) * 3 + (kx + 1)];
        d[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, v));
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─── SIGNATURE PAD ────────────────────────────────────────────────────────────
function setupSig() {
  const canvas = $('sigCanvas');
  const ctx    = canvas.getContext('2d');
  let drawing  = false, lastX = 0, lastY = 0;

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    const p = canvasPos(e); lastX = p.x; lastY = p.y;
    ctx.beginPath(); ctx.moveTo(lastX, lastY);
  }
  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = canvasPos(e);
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = '#8c6844';
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
  }
  function endDraw() { drawing = false; }

  canvas.addEventListener('mousedown',  startDraw);
  canvas.addEventListener('mousemove',  draw);
  canvas.addEventListener('mouseup',    endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove',  draw,      { passive: false });
  canvas.addEventListener('touchend',   endDraw);

  $('btnOpenSigPad').onclick = () => {
    // Set canvas size
    const w = canvas.parentElement.clientWidth - 40 || 300;
    canvas.width = w; canvas.height = 130;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $('sigModal').classList.add('active');
  };

  $('btnClearSig').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

  $('btnCloseSigModal').onclick = () => {
    // Check if anything was drawn
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = imgData.some((v, i) => i % 4 === 3 && v > 0);
    if (hasContent) {
      state.sigData = canvas.toDataURL('image/png');
      // If no image sig, also use drawn one on vault display
      if (!state.sigImageData) {
        const area = $('sigUploadArea');
        area.innerHTML = `<img src="${state.sigData}" alt="signature">`;
      }
      saveSig();
      toast('Signature saved', 'success');
      updateA4Preview();
    }
    $('sigModal').classList.remove('active');
  };
}

// ─── ZOOM HELPERS ─────────────────────────────────────────────────────────────
function getZoom() {
  return state.docZoom[state.selectedShareId] || 100;
}
function setZoom(val) {
  const z = Math.min(200, Math.max(50, Math.round(val)));
  state.docZoom[state.selectedShareId] = z;
  $('zoomInput').value = z;
  updateA4Preview();
}

// ─── SHARE SCREEN ─────────────────────────────────────────────────────────────
function setupShare() {
  $('stampToggle').addEventListener('click', () => {
    state.includeStamp = !state.includeStamp;
    $('stampSwitch').classList.toggle('on', state.includeStamp);
    updateA4Preview();
  });
  $('sigToggle').addEventListener('click', () => {
    state.includeSig = !state.includeSig;
    $('sigSwitch').classList.toggle('on', state.includeSig);
    updateA4Preview();
  });
  $('btnGeneratePDF').addEventListener('click', generatePDF);
  $('btnShareWA').addEventListener('click', shareWhatsApp);
  $('recipientName').addEventListener('input', debounce(updateA4Preview, 300));

  // Zoom controls
  $('btnZoomMinus').addEventListener('click', () => setZoom(getZoom() - 5));
  $('btnZoomPlus').addEventListener('click',  () => setZoom(getZoom() + 5));
  $('zoomInput').addEventListener('change', e => setZoom(parseInt(e.target.value) || 100));
  $('zoomInput').addEventListener('input',  debounce(e => { if (e.target.value.length >= 2) setZoom(parseInt(e.target.value) || 100); }, 300));
  $('btnZoomReset').addEventListener('click', () => setZoom(100));
}

function renderShareList() {
  const list = $('shareIdList');
  list.innerHTML = '';
  IDS.forEach(id => {
    const hasFront = !!state.docs[`${id.id}_${id.sides[0]}`];
    const item = document.createElement('div');
    item.className = `share-id-item${state.selectedShareId === id.id ? ' selected' : ''}`;
    item.innerHTML = `
      <div style="flex:1">
        <div class="share-id-name">${id.name}</div>
        <div class="share-id-sub">${hasFront ? id.sides.filter(s => state.docs[`${id.id}_${s}`]).join(' + ') + ' stored' : 'not stored'}</div>
      </div>
      <div class="share-id-check"></div>`;
    item.addEventListener('click', () => {
      if (!hasFront) { toast('Add this document first', 'error'); return; }
      state.selectedShareId = id.id;
      $('zoomInput').value = getZoom();
      renderShareList();
      updateA4Preview();
    });
    list.appendChild(item);
  });
}

function renderShareLog() {
  const el = $('shareLog');
  if (!state.shareLog.length) {
    el.innerHTML = `<div class="log-empty">No shares yet</div>`;
    return;
  }
  el.innerHTML = state.shareLog.map(e => `
    <div class="log-entry">
      <div class="log-entry-top">
        <span class="log-doc">${e.docName}</span>
        <span class="log-date">${e.date}</span>
      </div>
      <div class="log-recipient">Shared with ${e.recipient}</div>
    </div>`).join('');
}

// ─── A4 CANVAS ────────────────────────────────────────────────────────────────
function updateA4Preview() {
  const canvas = $('a4PreviewCanvas');
  if (!state.selectedShareId) {
    canvas.width = 210; canvas.height = 297;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#faf6f1';
    ctx.fillRect(0, 0, 210, 297);
    ctx.fillStyle = '#c0a880';
    ctx.font = '10px DM Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Select a document above', 105, 148);
    return;
  }
  renderA4Canvas(canvas, false);
}

function renderA4Canvas(canvas, highRes = true) {
  return new Promise(resolve => {
    const scale = highRes ? 4 : 1;
    const W = 595 * scale, H = 842 * scale;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const idDef = IDS.find(i => i.id === state.selectedShareId);
    if (!idDef) { resolve(); return; }

    const sides = idDef.sides.filter(s => !!state.docs[`${idDef.id}_${s}`]);
    if (!sides.length) { resolve(); return; }

    const loadImgs = sides.map(s => new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = state.docs[`${idDef.id}_${s}`];
    }));

    Promise.all(loadImgs).then(imgs => {
      const pad      = 40 * scale;
      const areaW    = W - pad * 2;
      const imgCount = imgs.length;
      const gap      = 28 * scale;

      // ── Real ID card physical size ──────────────────────────────────────────
      // A4 = 210mm wide. Canvas W = 595*scale pts. So 1mm = (595*scale/210) pts
      const mmToPx   = (595 * scale) / 210;
      // Standard CR80 card = 85.6mm × 54mm
      const cardW_mm = 85.6;
      const cardH_mm = 54.0;
      const zoom     = (state.docZoom[state.selectedShareId] || 100) / 100;
      const baseCardW = cardW_mm * mmToPx * zoom;
      const baseCardH = cardH_mm * mmToPx * zoom;

      // Cap to available area
      const maxSlotH = imgCount === 1 ? H * 0.56 : H * 0.36;

      const fitted = imgs.map(img => {
        const imgAspect  = img.width / img.height;
        const cardAspect = baseCardW / baseCardH;
        // Use card aspect if image is close to card ratio, else use image's own ratio
        const useAspect  = Math.abs(imgAspect - cardAspect) < 0.4 ? cardAspect : imgAspect;
        let drawW = baseCardW;
        let drawH = drawW / useAspect;
        // Enforce max constraints
        if (drawW > areaW)    { drawW = areaW;    drawH = drawW / useAspect; }
        if (drawH > maxSlotH) { drawH = maxSlotH; drawW = drawH * useAspect; }
        return { drawW, drawH };
      });

      const totalImgH = fitted.reduce((s, f) => s + f.drawH, 0) + gap * (imgCount - 1);
      const availH    = H * 0.78;
      const topPad    = Math.max(pad, (availH - totalImgH) / 2);

      let lastImgBottom = topPad;
      let runY = topPad;

      imgs.forEach((img, i) => {
        const { drawW, drawH } = fitted[i];
        const drawX = (W - drawW) / 2;
        const drawY = runY;

        // Image already auto-optimised at upload time — draw directly
        ctx.shadowColor   = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur    = 8 * scale;
        ctx.shadowOffsetY = 2 * scale;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        lastImgBottom = drawY + drawH;
        runY = lastImgBottom + gap;

        if (imgCount > 1) {
          ctx.fillStyle = '#b8a088';
          ctx.font = `${9 * scale}px DM Mono, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(sides[i].toUpperCase(), W / 2, drawY + drawH + 14 * scale);
        }
      });

      // ── STAMP + SIGNATURE ROW ────────────────────────────────────────────
      const rowY   = lastImgBottom + 18 * scale;
      const stampS = 108 * scale;

      if (state.includeStamp) {
        drawSVGStamp(ctx, pad, rowY, stampS, scale);
      }

      const recipient = ($('recipientName')?.value || '').trim();
      const activeSig = state.sigImageData || state.sigData;

      if (state.includeSig && activeSig) {
        const sigImg = new Image();
        sigImg.onload = () => {
          const sigW = 180 * scale;
          const sigH = 64 * scale;
          const sigX = W - pad - sigW;
          const sigY = rowY + (stampS - sigH) / 2 - 6 * scale;
          ctx.drawImage(sigImg, sigX, sigY, sigW, sigH);
          if (recipient) {
            ctx.fillStyle = '#1a3177';
            ctx.font      = `bold ${14 * scale}px DM Mono, monospace`;
            ctx.textAlign = 'right';
            ctx.fillText(`Shared with ${recipient}`, W - pad, sigY + sigH + 18 * scale);
          }
          finishA4(ctx, W, H, scale, resolve, canvas);
        };
        sigImg.src = activeSig;
      } else {
        if (recipient) {
          ctx.fillStyle = '#1a3177';
          ctx.font      = `bold ${14 * scale}px DM Mono, monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(`Shared with ${recipient}`, W - pad, rowY + 30 * scale);
        }
        finishA4(ctx, W, H, scale, resolve, canvas);
      }
    });
  });
}

// ─── AUTO IMAGE OPTIMISATION ──────────────────────────────────────────────────
// Applies auto-levels, white balance correction, contrast stretch and sharpening
function autoOptimise(img) {
  const oc  = document.createElement('canvas');
  oc.width  = img.width;
  oc.height = img.height;
  const ctx = oc.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, oc.width, oc.height);
  const d = imageData.data;
  const len = d.length;

  // ── Step 1: Build per-channel histograms ──────────────────────────────────
  const histR = new Int32Array(256), histG = new Int32Array(256), histB = new Int32Array(256);
  for (let i = 0; i < len; i += 4) {
    histR[d[i]]++;  histG[d[i+1]]++;  histB[d[i+2]]++;
  }

  // ── Step 2: Find 1%–99% percentile clip points per channel ───────────────
  const pixels  = (len / 4);
  const clipLow  = pixels * 0.01;
  const clipHigh = pixels * 0.99;

  function percentile(hist, lo, hi) {
    let cum = 0, low = 0, high = 255;
    for (let i = 0; i < 256; i++) { cum += hist[i]; if (cum >= lo && low === 0) low = i; }
    cum = 0;
    for (let i = 255; i >= 0; i--) { cum += hist[i]; if (cum >= (pixels - hi) && high === 255) high = i; }
    return [low, high];
  }

  const [rLo, rHi] = percentile(histR, clipLow, clipHigh);
  const [gLo, gHi] = percentile(histG, clipLow, clipHigh);
  const [bLo, bHi] = percentile(histB, clipLow, clipHigh);

  // ── Step 3: Build LUT (look-up table) per channel ─────────────────────────
  function makeLUT(lo, hi) {
    const lut = new Uint8ClampedArray(256);
    const range = hi - lo || 1;
    for (let i = 0; i < 256; i++) lut[i] = Math.min(255, Math.max(0, Math.round((i - lo) * 255 / range)));
    return lut;
  }
  const lutR = makeLUT(rLo, rHi);
  const lutG = makeLUT(gLo, gHi);
  const lutB = makeLUT(bLo, bHi);

  // ── Step 4: Apply LUTs ────────────────────────────────────────────────────
  for (let i = 0; i < len; i += 4) {
    d[i]   = lutR[d[i]];
    d[i+1] = lutG[d[i+1]];
    d[i+2] = lutB[d[i+2]];
  }

  // ── Step 5: Mild unsharp mask — skip if canvas is large (already sharp enough after LUT)
  const w = oc.width, h = oc.height;
  if (w <= 900 && h <= 900) {
    const tmp = new Uint8ClampedArray(d);
    const amount = 0.35;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = tmp[idx + c];
          const neighbors = tmp[((y-1)*w+x)*4+c] + tmp[((y+1)*w+x)*4+c] +
                            tmp[(y*w+x-1)*4+c]   + tmp[(y*w+x+1)*4+c];
          const blurred = neighbors / 4;
          d[idx + c] = Math.min(255, Math.max(0, Math.round(center + amount * (center - blurred))));
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return oc;
}

function finishA4(ctx, W, H, scale, resolve, canvas) {
  ctx.fillStyle = '#c8b090';
  ctx.font      = `${8 * scale}px DM Mono, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(
    `Generated by KYC direct · ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}`,
    W / 2, H - 12 * scale
  );
  resolve(canvas);
}

// ─── STAMP (drawn on canvas, matching the approved SVG design) ────────────────
function drawSVGStamp(ctx, x, y, size, scale) {
  const cx = x + size / 2;
  const cy = y + size / 2;

  // White backing circle
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  const navy   = '#1a3177';
  const red    = '#dc2626';
  const sw     = size * 0.038;
  const outerR = size * 0.44;
  const innerR = size * 0.30;
  const bandMid = (outerR + innerR) / 2;   // exact centre of the band
  const bandH   = outerR - innerR;         // height of the band
  const fs      = bandH * 0.68;            // font fills ~68% of band height

  // Outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = navy; ctx.lineWidth = sw; ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = navy; ctx.lineWidth = sw * 0.65; ctx.stroke();

  // Stars at 3 and 9 o'clock on band centre
  ctx.font = `${size * 0.09}px serif`;
  ctx.fillStyle = navy; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★', cx + bandMid, cy);
  ctx.fillText('★', cx - bandMid, cy);

  // ── PHOTOCOPY top arc — text centred on bandMid ───────────────────────────
  const topText  = 'PHOTOCOPY';
  const topSpan  = Math.PI * 0.76;
  const topStart = -Math.PI / 2 - topSpan / 2;
  const topStep  = topSpan / (topText.length - 1);
  ctx.font = `bold ${fs}px Arial, sans-serif`;
  ctx.fillStyle = navy;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < topText.length; i++) {
    const a = topStart + i * topStep;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * bandMid, cy + Math.sin(a) * bandMid);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(topText[i], 0, 0);
    ctx.restore();
  }

  // ── SELF ATTESTED bottom arc — text centred on bandMid ───────────────────
  const botText  = 'SELF ATTESTED';
  const botSpan  = Math.PI * 0.76;
  const botStart = Math.PI / 2 + botSpan / 2;
  const botStep  = -botSpan / (botText.length - 1);
  ctx.font = `bold ${fs * 0.86}px Arial, sans-serif`;
  ctx.fillStyle = navy;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < botText.length; i++) {
    const a = botStart + i * botStep;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * bandMid, cy + Math.sin(a) * bandMid);
    ctx.rotate(a - Math.PI / 2);
    ctx.fillText(botText[i], 0, 0);
    ctx.restore();
  }

  // ── Date in centre ────────────────────────────────────────────────────────
  const today  = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dateStr = `${String(today.getDate()).padStart(2,'0')} ${months[today.getMonth()]} ${String(today.getFullYear()).slice(2)}`;
  ctx.font = `bold ${size * 0.08}px Arial, sans-serif`;
  ctx.fillStyle = red; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(dateStr, cx, cy);
}

// ─── PDF GENERATION ───────────────────────────────────────────────────────────
async function generatePDF() {
  if (!state.selectedShareId) { toast('Select a document first', 'error'); return; }
  const btn = $('btnGeneratePDF');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    const offCanvas = document.createElement('canvas');
    await renderA4Canvas(offCanvas, true);
    const imgData = offCanvas.toDataURL('image/jpeg', 0.93);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

    const idName   = IDS.find(i => i.id === state.selectedShareId)?.name.replace(/\s+/g, '_') || 'KYC';
    const filename = `KYC_direct_${idName}_${new Date().toISOString().slice(0,10)}.pdf`;
    pdf.save(filename);

    const recipient = ($('recipientName')?.value || '').trim();
    addLogEntry(IDS.find(i => i.id === state.selectedShareId)?.name, recipient || '—');
    toast('PDF downloaded!', 'success');
  } catch(e) {
    toast('Error generating PDF', 'error');
    console.error(e);
  } finally {
    btn.textContent = 'Download PDF';
    btn.disabled = false;
  }
}

async function shareWhatsApp() {
  if (!state.selectedShareId) { toast('Select a document first', 'error'); return; }
  const btn = $('btnShareWA');
  btn.disabled = true;

  try {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    const offCanvas = document.createElement('canvas');
    await renderA4Canvas(offCanvas, true);
    const imgData = offCanvas.toDataURL('image/jpeg', 0.93);

    const { jsPDF } = window.jspdf;
    const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

    const idName = IDS.find(i => i.id === state.selectedShareId)?.name || 'KYC';
    const blob   = pdf.output('blob');
    const file   = new File([blob], `KYC_direct_${idName}.pdf`, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `KYC direct — ${idName}`, text: 'Please find my KYC document attached.' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      setTimeout(() => window.open('https://web.whatsapp.com', '_blank'), 800);
    }

    const recipient = ($('recipientName')?.value || '').trim();
    addLogEntry(idName, recipient || '—');
    toast('Shared!', 'success');
  } catch(e) {
    if (e.name !== 'AbortError') toast('Share failed', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── DEBOUNCE UTILITY ────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ─── STORAGE INDICATOR ────────────────────────────────────────────────────────
function updateStorageBar() {
  try {
    let total = 0;
    for (const key of [DB_KEY, SIG_KEY, LOG_KEY]) {
      const v = localStorage.getItem(key);
      if (v) total += v.length * 2; // UTF-16: 2 bytes per char
    }
    const maxBytes = 5 * 1024 * 1024;
    const pct = Math.min(100, (total / maxBytes) * 100);
    const fill = $('storageFill');
    const used = $('storageUsed');
    if (!fill || !used) return;
    fill.style.width = pct + '%';
    fill.className = 'storage-bar-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : '');
    const kb = total / 1024;
    used.textContent = kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB used' : Math.round(kb) + ' KB used';
  } catch(e) {}
}

// ─── PRIVACY TOGGLE ───────────────────────────────────────────────────────────
function setupPrivacyToggle() {
  $('privacyToggle').addEventListener('click', () => {
    const card    = $('privacyCard');
    const chevron = $('privacyChevron');
    const open    = card.style.display === 'none';
    card.style.display = open ? 'block' : 'none';
    chevron.classList.toggle('open', open);
  });
}

// ─── BACKUP — PIN STATE ───────────────────────────────────────────────────────
let pinBuffer   = '';
let pinMode     = null; // 'export-set' | 'export-confirm' | 'import'
let pinFirst    = '';
let pinCallback = null;

function openPinModal(title, sub, callback) {
  pinBuffer = ''; pinFirst = ''; pinMode = 'custom';
  pinCallback = callback;
  $('pinModalTitle').textContent = title;
  $('pinModalSub').textContent   = sub;
  updatePinDots();
  $('pinModal').classList.add('active');
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    $('pd' + i).classList.toggle('filled', i < pinBuffer.length);
  }
}

function setupBackup() {
  // PIN pad keys
  document.querySelectorAll('.pin-key[data-n]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pinBuffer.length >= 4) return;
      pinBuffer += btn.dataset.n;
      updatePinDots();
      if (pinBuffer.length === 4) setTimeout(handlePinComplete, 200);
    });
  });
  $('pinDel').addEventListener('click', () => {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
  });
  $('pinSkip').addEventListener('click', () => {
    $('pinModal').classList.remove('active');
    if (pinCallback) pinCallback(null);
  });

  // Export backup
  $('btnExportBackup').addEventListener('click', () => {
    const hasData = Object.keys(state.docs).length > 0;
    if (!hasData) { toast('Nothing to backup yet', 'error'); return; }
    pinFirst = '';
    openPinModal('Set Backup PIN', 'Enter a 4-digit PIN to protect your backup. Tap Skip for no PIN.', null);
    pinMode = 'export-set';
  });

  // Import backup
  $('btnImportBackup').addEventListener('click', () => $('backupFileInput').click());
  $('backupFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target.result);
        if (raw.protected) {
          openPinModal('Enter Backup PIN', 'This backup is PIN protected.', pin => {
            if (pin === null) { toast('Import cancelled', ''); return; }
            const dec = xorDecrypt(raw.data, pin);
            try {
              const payload = JSON.parse(dec);
              restoreBackup(payload);
            } catch(e) {
              toast('Wrong PIN', 'error');
            }
          });
          pinMode = 'import-custom';
        } else {
          restoreBackup(raw.data);
        }
      } catch(e) {
        toast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Nudge modal
  $('btnNudgeLater').addEventListener('click',  () => $('nudgeModal').classList.remove('active'));
  $('btnNudgeBackup').addEventListener('click', () => {
    $('nudgeModal').classList.remove('active');
    $('btnExportBackup').click();
  });
}

function handlePinComplete() {
  if (pinMode === 'export-set') {
    pinFirst  = pinBuffer;
    pinBuffer = '';
    updatePinDots();
    $('pinModalTitle').textContent = 'Confirm PIN';
    $('pinModalSub').textContent   = 'Re-enter your 4-digit PIN to confirm';
    pinMode = 'export-confirm';
  } else if (pinMode === 'export-confirm') {
    if (pinBuffer !== pinFirst) {
      toast('PINs do not match', 'error');
      pinBuffer = ''; pinFirst = '';
      updatePinDots();
      $('pinModalTitle').textContent = 'Set Backup PIN';
      $('pinModalSub').textContent   = 'PINs did not match. Try again.';
      pinMode = 'export-set';
      return;
    }
    const pin = pinBuffer;
    $('pinModal').classList.remove('active');
    doExportBackup(pin);
  } else if (pinMode === 'import-custom') {
    const pin = pinBuffer;
    $('pinModal').classList.remove('active');
    if (pinCallback) pinCallback(pin);
  }
}

function doExportBackup(pin) {
  const payload = {
    version: 2,
    exported: new Date().toISOString(),
    docs: state.docs,
    sig: { drawn: state.sigData, image: state.sigImageData },
    log: state.shareLog,
  };
  const date = new Date().toISOString().slice(0, 10);
  let fileContent, filename;

  if (pin) {
    const encrypted = xorEncrypt(JSON.stringify(payload), pin);
    fileContent = JSON.stringify({ protected: true, data: encrypted });
    filename = `kycdirect-backup-${date}.json`;
  } else {
    fileContent = JSON.stringify({ protected: false, data: payload });
    filename = `kycdirect-backup-${date}.json`;
  }

  const blob = new Blob([fileContent], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup exported!', 'success');
}

function restoreBackup(payload) {
  try {
    if (payload.docs)  { state.docs = payload.docs; saveState(); }
    if (payload.sig)   { state.sigData = payload.sig.drawn || null; state.sigImageData = payload.sig.image || null; saveSig(); }
    if (payload.log)   { state.shareLog = payload.log; saveLog(); }
    renderVault();
    renderShareList();
    renderShareLog();
    updateStorageBar();
    toast('Backup restored!', 'success');
  } catch(e) {
    toast('Restore failed', 'error');
  }
}

// Simple XOR cipher with PIN as key — sufficient for local backup protection
function xorEncrypt(str, pin) {
  const key = pin.split('').map(Number);
  return btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (key[i % key.length] + 47))).join(''));
}
function xorDecrypt(encoded, pin) {
  const key = pin.split('').map(Number);
  const str = atob(encoded);
  return str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (key[i % key.length] + 47))).join('');
}

// ─── NUDGE ────────────────────────────────────────────────────────────────────
function showNudge() {
  const docCount = Object.keys(state.docs).length;
  if (docCount > 0) $('nudgeModal').classList.add('active');
}
