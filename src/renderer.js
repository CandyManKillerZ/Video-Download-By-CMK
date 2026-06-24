// Video Download by CMK — renderer UI logic (Phase 2: queue + history + clipboard watch).
const $ = (id) => document.getElementById(id);

const MAX_CONCURRENT = 1;   // sequential queue; bump to run more at once (jobs are id-keyed in main.js)
const LS = {
  folder: 'vd_folder', quality: 'vd_quality', clipwatch: 'vd_clipwatch', history: 'vd_history',
  subfolders: 'vd_subfolders',
  lock: 'vd_lock', lockHash: 'vd_lockhash', panic: 'vd_panic', panicKey: 'vd_panickey',
  incognito: 'vd_incognito', discreet: 'vd_discreet', discreetName: 'vd_discreetname'
};

const els = {
  url: $('url'), addBtn: $('addBtn'),
  quality: $('quality'), folder: $('folder'), browseBtn: $('browseBtn'),
  clipwatch: $('clipwatch'),
  status: $('status'),
  tabQueue: $('tab-queue'), tabHistory: $('tab-history'),
  qCount: $('qCount'), hCount: $('hCount'),
  queueList: $('queueList'), historyList: $('historyList'),
  downloadAllBtn: $('downloadAllBtn'), clearHistoryBtn: $('clearHistoryBtn'),
  log: $('log'), binWarn: $('binWarn'), binDetail: $('binDetail'),
  // settings / privacy
  settingsBtn: $('settingsBtn'), settingsModal: $('settingsModal'), settingsClose: $('settingsClose'),
  setLock: $('set-lock'), setPasscode: $('set-passcode'),
  setPanic: $('set-panic'), setPanicKey: $('set-panic-key'), panicKeyLabel: $('panicKeyLabel'),
  setIncognito: $('set-incognito'), setDiscreet: $('set-discreet'), setDiscreetName: $('set-discreet-name'),
  setSubfolders: $('set-subfolders'),
  setUpdate: $('set-update'), ytdlpVer: $('ytdlpVer'), updateResult: $('updateResult'),
  lockScreen: $('lockScreen'), lockInput: $('lockInput'), lockUnlock: $('lockUnlock'), lockErr: $('lockErr'),
  promptModal: $('promptModal'), promptTitle: $('promptTitle'), promptInput: $('promptInput'),
  promptOk: $('promptOk'), promptCancel: $('promptCancel')
};

let panicKey = 'CommandOrControl+Shift+H';
let recordingHotkey = false;

let items = [];        // active queue: { id, url, title, thumb, duration, filesize, quality, folder, state, pct, speed, eta, downloaded, total, error }
let history = [];      // completed: { url, title, thumb, quality, folder, finishedAt }
let binsOk = false;
let running = false;   // true once the user presses Download; drains the queue until empty
let tab = 'queue';
let idSeq = 1;
const genId = () => 'i' + (idSeq++) + Date.now().toString(36);

// ---------- formatting ----------
function fmtBytes(b) {
  if (b == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function fmtDur(s) {
  if (s == null) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function fmtEta(s) {
  if (s == null) return '';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const qLabel = (q) => q === 'best' ? 'Best' : q + 'p';

// ---------- persistence ----------
function saveSettings() {
  localStorage.setItem(LS.folder, els.folder.value);
  localStorage.setItem(LS.quality, els.quality.value);
  localStorage.setItem(LS.clipwatch, els.clipwatch.checked ? '1' : '0');
}
function saveHistory() { localStorage.setItem(LS.history, JSON.stringify(history.slice(0, 100))); }

function setStatus(msg, kind) { els.status.textContent = msg || ''; els.status.className = kind || ''; }
function appendLog(line) { els.log.textContent += line + '\n'; els.log.scrollTop = els.log.scrollHeight; }

// ---------- queue engine ----------
function activeCount() { return items.filter(i => i.state === 'downloading' || i.state === 'paused').length; }
function queuedCount() { return items.filter(i => i.state === 'queued').length; }

// Adding a URL only enqueues it. Nothing downloads until the user presses Download
// (startQueue), which sets `running` and drains the queue; pump() advances it.
function startQueue() {
  if (!queuedCount()) return;
  running = true;
  pump();
}

function pump() {
  if (running) {
    while (activeCount() < MAX_CONCURRENT) {
      const next = items.find(i => i.state === 'queued');
      if (!next) break;
      startItem(next);
    }
    if (activeCount() === 0 && !queuedCount()) running = false;   // drain complete
  }
  updateDownloadBtn();
}

function updateDownloadBtn() {
  const n = queuedCount();
  els.downloadAllBtn.disabled = !binsOk || n === 0 || running;
  els.downloadAllBtn.textContent = running ? 'Downloading…' : (n ? `Download (${n})` : 'Download');
}

function startItem(item) {
  item.state = 'downloading';
  item.pct = item.pct || 0;
  renderQueue();
  window.vxBridge.start({ id: item.id, url: item.url, quality: item.quality, folder: item.folder, subfolders: item.subfolders });
}

async function addUrl(url) {
  url = (url || '').trim();
  if (!url) return;
  if (!binsOk) { setStatus('Engine missing — see the warning above.', 'err'); return; }
  if (items.some(i => i.url === url && i.state !== 'done' && i.state !== 'error' && i.state !== 'stopped')) {
    setStatus('That URL is already in the queue.', 'warn'); return;
  }
  const item = {
    id: genId(), url, title: url, thumb: '', duration: null, filesize: null,
    quality: els.quality.value, folder: els.folder.value,
    subfolders: els.setSubfolders.checked, extractorKey: '',
    state: 'loading', pct: 0, speed: null, eta: null, downloaded: null, total: null, error: ''
  };
  items.push(item);
  tab = 'queue'; syncTabs();
  renderQueue();

  const res = await window.vxBridge.loadMeta(url);
  if (!items.includes(item)) return;   // removed while loading
  if (!res.ok) {
    item.state = 'error'; item.error = res.error || 'Could not load URL';
    renderQueue(); return;
  }
  item.title = res.data.title;
  item.thumb = res.data.thumbnail || '';
  item.duration = res.data.duration;
  item.filesize = res.data.filesize;
  item.extractorKey = res.data.extractorKey || '';
  item.state = 'queued';
  renderQueue();
  // If a download run is already in progress, fold this into it; otherwise wait for Download.
  if (running) pump();
  else setStatus(`Added — ${queuedCount()} in queue. Press Download to start.`, '');
}

// per-item controls
function pauseItem(id) { const i = byId(id); if (i) { i.state = 'paused'; window.vxBridge.pause(id); renderQueue(); } }
function resumeItem(id) {
  const i = byId(id); if (!i) return;
  i.state = 'downloading'; renderQueue();
  window.vxBridge.resume({ id, url: i.url, quality: i.quality, folder: i.folder, subfolders: i.subfolders });
}
function stopItem(id) { const i = byId(id); if (i) { window.vxBridge.stop(id); } }
function retryItem(id) { const i = byId(id); if (i) { i.state = 'queued'; i.error = ''; i.pct = 0; renderQueue(); pump(); } }
function removeItem(id) {
  const i = byId(id); if (!i) return;
  if (i.state === 'downloading' || i.state === 'paused') window.vxBridge.stop(id);
  items = items.filter(x => x.id !== id);
  renderQueue(); pump();
}
const byId = (id) => items.find(i => i.id === id);

function archive(item) {
  if (els.setIncognito.checked) return;   // incognito: don't record history
  // When per-site subfolders are on, point "Open folder" at the site subfolder.
  const folder = (item.subfolders && item.extractorKey)
    ? item.folder.replace(/[\\/]+$/, '') + '\\' + item.extractorKey
    : item.folder;
  history.unshift({ url: item.url, title: item.title, thumb: item.thumb, quality: item.quality, folder, finishedAt: Date.now() });
  saveHistory();
}

// ---------- rendering ----------
function stateLabel(s) {
  return { loading: 'Loading…', queued: 'Queued', downloading: 'Downloading', paused: 'Paused', done: 'Done', error: 'Error', stopped: 'Stopped' }[s] || s;
}

function ctrlsFor(i) {
  switch (i.state) {
    case 'downloading': return btn('Pause', 'pause', i.id) + btn('Stop', 'stop', i.id, 'danger');
    case 'paused':      return btn('Resume', 'resume', i.id, 'primary') + btn('Stop', 'stop', i.id, 'danger');
    case 'queued':      return btn('Remove', 'remove', i.id, 'danger');
    case 'loading':     return btn('Remove', 'remove', i.id, 'danger');
    case 'error':       return btn('Retry', 'retry', i.id, 'primary') + btn('Remove', 'remove', i.id, 'danger');
    case 'stopped':     return btn('Retry', 'retry', i.id, 'primary') + btn('Remove', 'remove', i.id, 'danger');
    default:            return btn('Remove', 'remove', i.id, 'danger');
  }
}
const btn = (txt, action, id, cls = '') =>
  `<button class="sm ${cls}" data-action="${action}" data-id="${id}">${txt}</button>`;

function progText(i) {
  if (i.state === 'error') return esc(i.error || 'Failed');
  if (i.state === 'done') return 'Complete';
  if (i.state === 'queued') return 'Waiting…';
  if (i.state === 'loading') return 'Fetching info…';
  if (i.state === 'stopped') return 'Cancelled';
  const bits = [];
  if (i.pct != null) bits.push(i.pct.toFixed(1) + '%');
  if (i.downloaded != null && i.total) bits.push(`${fmtBytes(i.downloaded)} / ${fmtBytes(i.total)}`);
  if (i.speed) bits.push(fmtBytes(i.speed) + '/s');
  if (i.eta != null) bits.push('ETA ' + fmtEta(i.eta));
  return bits.join('  ·  ') || 'Starting…';
}

function renderQueue() {
  els.qCount.textContent = items.length ? `(${items.length})` : '';
  updateDownloadBtn();
  if (!items.length) {
    els.queueList.innerHTML = '<div class="empty">No downloads queued. Add URLs above, then press Download.</div>';
    return;
  }
  els.queueList.innerHTML = items.map(i => {
    const sub = [
      `<span class="st ${i.state}">${stateLabel(i.state)}</span>`,
      (!els.setIncognito.checked && i.extractorKey) ? esc(i.extractorKey) : '',
      qLabel(i.quality),
      i.duration ? fmtDur(i.duration) : '',
      i.filesize ? '~' + fmtBytes(i.filesize) : ''
    ].filter(Boolean).join('  ·  ');
    return `
    <div class="item" id="row-${i.id}">
      <img class="thumb" src="${esc(i.thumb)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="body">
        <div class="ititle" title="${esc(i.title)}">${esc(i.title)}</div>
        <div class="isub">${sub}</div>
        <div class="bar"><div class="fill" id="fill-${i.id}" style="width:${i.pct || 0}%"></div></div>
        <div class="prog" id="prog-${i.id}">${progText(i)}</div>
      </div>
      <div class="ctrls">${ctrlsFor(i)}</div>
    </div>`;
  }).join('');
}

function updateProgressRow(i) {
  const fill = $('fill-' + i.id), prog = $('prog-' + i.id);
  if (fill && i.pct != null) fill.style.width = i.pct.toFixed(1) + '%';
  if (prog) prog.textContent = progText(i);
}

function renderHistory() {
  els.hCount.textContent = history.length ? `(${history.length})` : '';
  els.clearHistoryBtn.style.display = (tab === 'history' && history.length) ? '' : 'none';
  if (!history.length) {
    els.historyList.innerHTML = '<div class="empty">Nothing downloaded yet.</div>';
    return;
  }
  els.historyList.innerHTML = history.map((h, idx) => `
    <div class="item">
      <img class="thumb" src="${esc(h.thumb)}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="body">
        <div class="ititle" title="${esc(h.title)}">${esc(h.title)}</div>
        <div class="isub"><span class="st done">Done</span>  ·  ${qLabel(h.quality)}  ·  ${new Date(h.finishedAt).toLocaleString()}</div>
      </div>
      <div class="ctrls">
        <button class="sm" data-haction="open" data-idx="${idx}">Open folder</button>
        <button class="sm" data-haction="again" data-idx="${idx}">Download again</button>
        <button class="sm danger" data-haction="remove" data-idx="${idx}">Remove</button>
      </div>
    </div>`).join('');
}

function syncTabs() {
  els.tabQueue.classList.toggle('active', tab === 'queue');
  els.tabHistory.classList.toggle('active', tab === 'history');
  els.queueList.style.display = tab === 'queue' ? '' : 'none';
  els.historyList.style.display = tab === 'history' ? '' : 'none';
  els.downloadAllBtn.style.display = tab === 'queue' ? '' : 'none';
  renderHistory();
}

// ---------- events ----------
els.addBtn.addEventListener('click', () => { addUrl(els.url.value); els.url.value = ''; });
els.url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addUrl(els.url.value); els.url.value = ''; } });
els.quality.addEventListener('change', saveSettings);
els.browseBtn.addEventListener('click', async () => {
  const p = await window.vxBridge.browse();
  if (p) { els.folder.value = p; saveSettings(); }
});
els.clipwatch.addEventListener('change', () => {
  saveSettings();
  window.vxBridge.clipWatch(els.clipwatch.checked);
  setStatus(els.clipwatch.checked ? 'Watching clipboard — copied URLs will auto-add.' : 'Clipboard watch off.', 'ok');
});

els.downloadAllBtn.addEventListener('click', () => { startQueue(); setStatus('Downloading queue…', ''); });
els.tabQueue.addEventListener('click', () => { tab = 'queue'; syncTabs(); });
els.tabHistory.addEventListener('click', () => { tab = 'history'; syncTabs(); });
els.clearHistoryBtn.addEventListener('click', () => { history = []; saveHistory(); renderHistory(); });

// delegated controls — queue
els.queueList.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-action]'); if (!b) return;
  const id = b.dataset.id;
  ({ pause: pauseItem, resume: resumeItem, stop: stopItem, retry: retryItem, remove: removeItem }[b.dataset.action] || (() => {}))(id);
});
// delegated controls — history
els.historyList.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-haction]'); if (!b) return;
  const h = history[Number(b.dataset.idx)]; if (!h) return;
  if (b.dataset.haction === 'open') window.vxBridge.openFolder(h.folder);
  else if (b.dataset.haction === 'again') { els.quality.value = h.quality; addUrl(h.url); }
  else if (b.dataset.haction === 'remove') { history.splice(Number(b.dataset.idx), 1); saveHistory(); renderHistory(); }
});

// ---------- main-process events ----------
window.vxBridge.onProgress((p) => {
  const i = byId(p.id); if (!i) return;
  i.pct = p.percent; i.downloaded = p.downloaded; i.total = p.total; i.speed = p.speed; i.eta = p.eta;
  updateProgressRow(i);
});

window.vxBridge.onStatus((s) => {
  const i = byId(s.id); if (!i) return;
  switch (s.state) {
    case 'downloading': i.state = 'downloading'; renderQueue(); break;
    case 'paused':      i.state = 'paused'; renderQueue(); break;
    case 'done':
      i.state = 'done'; i.pct = 100;
      archive(i);
      items = items.filter(x => x.id !== i.id);
      renderQueue(); renderHistory();
      setStatus(`Finished: ${i.title}`, 'ok');
      pump();
      break;
    case 'stopped':
      i.state = 'stopped'; renderQueue(); pump();
      break;
    case 'error':
      i.state = 'error'; i.error = s.error || 'Download failed'; renderQueue(); pump();
      break;
  }
});

window.vxBridge.onClipUrl((url) => {
  if (!binsOk) return;
  if (items.some(i => i.url === url)) return;
  addUrl(url);
  setStatus('Auto-added from clipboard: ' + url, 'ok');
});

window.vxBridge.onLog(appendLog);

// ---------- settings & privacy (Phase 3) ----------
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const accelLabel = (a) => a.replace('CommandOrControl', 'Ctrl').replace('Super', 'Win');

// Electron has no window.prompt — small reusable modal returning Promise<string|null>.
function askText(title) {
  return new Promise((resolve) => {
    els.promptTitle.textContent = title; els.promptInput.value = '';
    els.promptModal.style.display = 'flex'; els.promptInput.focus();
    const done = (v) => { els.promptModal.style.display = 'none'; cleanup(); resolve(v); };
    const ok = () => done(els.promptInput.value);
    const cancel = () => done(null);
    const key = (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); };
    function cleanup() {
      els.promptOk.removeEventListener('click', ok);
      els.promptCancel.removeEventListener('click', cancel);
      els.promptInput.removeEventListener('keydown', key);
    }
    els.promptOk.addEventListener('click', ok);
    els.promptCancel.addEventListener('click', cancel);
    els.promptInput.addEventListener('keydown', key);
  });
}

// --- settings modal open/close + live yt-dlp version ---
els.settingsBtn.addEventListener('click', async () => {
  els.settingsModal.style.display = 'flex';
  const v = await window.vxBridge.ytdlpVersion();
  els.ytdlpVer.textContent = v.ok ? v.version : 'not found';
});
els.settingsClose.addEventListener('click', () => { els.settingsModal.style.display = 'none'; });
els.settingsModal.addEventListener('click', (e) => { if (e.target === els.settingsModal) els.settingsModal.style.display = 'none'; });

// --- app lock ---
async function setNewPasscode() {
  const pc = await askText('Set a passcode (used to unlock the app)');
  if (pc) {
    localStorage.setItem(LS.lockHash, await sha256hex(pc));
    localStorage.setItem(LS.lock, '1');
    els.setLock.checked = true;
    setStatus('Passcode set — lock enabled.', 'ok');
    return true;
  }
  return false;
}
els.setLock.addEventListener('change', async () => {
  if (els.setLock.checked) {
    if (!localStorage.getItem(LS.lockHash)) { if (!(await setNewPasscode())) els.setLock.checked = false; }
    else localStorage.setItem(LS.lock, '1');
  } else localStorage.setItem(LS.lock, '0');
});
els.setPasscode.addEventListener('click', setNewPasscode);

async function tryUnlock() {
  const h = await sha256hex(els.lockInput.value);
  if (h === localStorage.getItem(LS.lockHash)) {
    els.lockScreen.style.display = 'none'; els.lockInput.value = ''; els.lockErr.textContent = '';
  } else { els.lockErr.textContent = 'Wrong passcode.'; els.lockInput.value = ''; els.lockInput.focus(); }
}
els.lockUnlock.addEventListener('click', tryUnlock);
els.lockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

// --- panic-hide hotkey ---
async function applyPanic() {
  localStorage.setItem(LS.panic, els.setPanic.checked ? '1' : '0');
  const res = await window.vxBridge.panicSet(els.setPanic.checked, panicKey);
  if (els.setPanic.checked && res && !res.ok) {
    setStatus(res.error || 'Hotkey registration failed', 'err');
    els.setPanic.checked = false; localStorage.setItem(LS.panic, '0');
  } else if (els.setPanic.checked) setStatus('Panic hotkey active: ' + accelLabel(panicKey), 'ok');
}
els.setPanic.addEventListener('change', applyPanic);
els.setPanicKey.addEventListener('click', () => { recordingHotkey = true; els.panicKeyLabel.textContent = 'press keys…'; });
document.addEventListener('keydown', (e) => {
  if (!recordingHotkey) return;
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;   // wait for a non-modifier
  const parts = [];
  if (e.ctrlKey) parts.push('CommandOrControl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Super');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  panicKey = parts.join('+');
  localStorage.setItem(LS.panicKey, panicKey);
  recordingHotkey = false;
  els.panicKeyLabel.textContent = accelLabel(panicKey);
  if (els.setPanic.checked) applyPanic();   // re-register with the new combo
});

// --- incognito ---
function applyIncognito() {
  document.body.classList.toggle('incognito', els.setIncognito.checked);
  localStorage.setItem(LS.incognito, els.setIncognito.checked ? '1' : '0');
  renderQueue();   // refresh site labels (hidden under incognito)
}
els.setIncognito.addEventListener('change', applyIncognito);

// --- discreet title ---
function applyDiscreet() {
  localStorage.setItem(LS.discreet, els.setDiscreet.checked ? '1' : '0');
  const name = els.setDiscreetName.value.trim() || 'Media Tool';
  document.title = els.setDiscreet.checked ? name : 'Video Download by CMK';
}
els.setDiscreet.addEventListener('change', applyDiscreet);
els.setDiscreetName.addEventListener('input', () => {
  localStorage.setItem(LS.discreetName, els.setDiscreetName.value);
  if (els.setDiscreet.checked) applyDiscreet();
});

// --- per-site subfolders ---
els.setSubfolders.addEventListener('change', () => {
  localStorage.setItem(LS.subfolders, els.setSubfolders.checked ? '1' : '0');
});

// --- yt-dlp self-update ---
els.setUpdate.addEventListener('click', async () => {
  els.updateResult.textContent = 'Updating…'; els.setUpdate.disabled = true;
  const r = await window.vxBridge.updateYtdlp();
  els.setUpdate.disabled = false;
  els.updateResult.textContent = r.ok ? (r.output || 'Done.') : ('Error: ' + (r.error || 'failed'));
  const v = await window.vxBridge.ytdlpVersion();
  els.ytdlpVer.textContent = v.ok ? v.version : '?';
});

// ---------- init ----------
(async function init() {
  // Show the lock immediately (before any awaits) so the app never flashes unlocked.
  if (localStorage.getItem(LS.lock) === '1' && localStorage.getItem(LS.lockHash)) {
    els.lockScreen.style.display = 'flex'; els.lockInput.focus();
  }
  const bins = await window.vxBridge.checkBins();
  binsOk = bins.ytdlp && bins.ffmpeg;
  if (!binsOk) {
    els.binWarn.style.display = '';
    const miss = [];
    if (!bins.ytdlp) miss.push('yt-dlp.exe');
    if (!bins.ffmpeg) miss.push('ffmpeg.exe');
    els.binDetail.textContent = `Missing: ${miss.join(', ')} (looked in ${bins.binDir})`;
  }

  // restore settings
  els.folder.value = localStorage.getItem(LS.folder) || await window.vxBridge.defaultDir();
  els.quality.value = localStorage.getItem(LS.quality) || 'best';
  els.clipwatch.checked = localStorage.getItem(LS.clipwatch) === '1';
  try { history = JSON.parse(localStorage.getItem(LS.history) || '[]'); } catch { history = []; }
  if (els.clipwatch.checked) window.vxBridge.clipWatch(true);

  // restore privacy settings
  els.setSubfolders.checked = localStorage.getItem(LS.subfolders) === '1';
  els.setLock.checked = localStorage.getItem(LS.lock) === '1';
  panicKey = localStorage.getItem(LS.panicKey) || panicKey;
  els.panicKeyLabel.textContent = accelLabel(panicKey);
  els.setPanic.checked = localStorage.getItem(LS.panic) === '1';
  if (els.setPanic.checked) window.vxBridge.panicSet(true, panicKey);
  els.setIncognito.checked = localStorage.getItem(LS.incognito) === '1';
  applyIncognito();
  els.setDiscreetName.value = localStorage.getItem(LS.discreetName) || '';
  els.setDiscreet.checked = localStorage.getItem(LS.discreet) === '1';
  applyDiscreet();

  syncTabs();
  renderQueue();
})();
