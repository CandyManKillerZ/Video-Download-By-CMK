// Video Download by CMK — Electron main process.
// Thin GUI wrapper around bundled yt-dlp.exe + ffmpeg.exe.
// Phase 2: multiple downloads tracked by id (jobs Map) + clipboard URL watcher.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

const isDev = !app.isPackaged;
// In dev, binaries live in ./bin. When packaged, electron-builder copies bin/ to resources/bin.
const binDir = isDev ? path.join(__dirname, 'bin') : path.join(process.resourcesPath, 'bin');
const EXE = (n) => path.join(binDir, process.platform === 'win32' ? `${n}.exe` : n);
const YTDLP = EXE('yt-dlp');
const FFMPEG = EXE('ffmpeg');
const ICON = path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

let win = null;

// Active downloads, keyed by the renderer's item id. yt-dlp spawns ffmpeg as a
// child, so we always kill the whole process *tree* — killing only the parent
// leaks ffmpeg. Each job: { child, dests:Set<string>, pausing, stopping }.
const jobs = new Map();

function createWindow() {
  win = new BrowserWindow({
    width: 820,
    height: 720,
    minWidth: 620,
    minHeight: 560,
    backgroundColor: '#050805',
    autoHideMenuBar: true,
    icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killAll();
  stopClipWatch();
  if (process.platform !== 'darwin') app.quit();
});

// ---------- helpers ----------
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function log(line) { if (line) send('vx-log', line); }

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
    } else {
      try { process.kill(-pid); } catch { try { process.kill(pid); } catch {} }
      resolve();
    }
  });
}
function killAll() { jobs.forEach((j) => killTree(j.child.pid)); }
function tryUnlink(f) { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {} }

// ---------- IPC: environment ----------
ipcMain.handle('vx-check-bins', () => ({
  ytdlp: fs.existsSync(YTDLP),
  ffmpeg: fs.existsSync(FFMPEG),
  binDir
}));

ipcMain.handle('vx-default-dir', () => {
  try { return app.getPath('videos'); }
  catch { try { return app.getPath('downloads'); } catch { return ''; } }
});

ipcMain.handle('vx-browse', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose download folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle('vx-open-folder', (e, p) => { if (p) shell.openPath(p); });

// ---------- IPC: metadata ----------
ipcMain.handle('vx-load-meta', (e, url) => new Promise((resolve) => {
  if (!fs.existsSync(YTDLP)) {
    return resolve({ ok: false, error: 'yt-dlp.exe not found in bin/' });
  }
  execFile(
    YTDLP,
    ['-J', '--no-playlist', '--no-warnings', url],
    { maxBuffer: 1024 * 1024 * 128 },
    (err, stdout, stderr) => {
      if (err && !stdout) {
        const msg = (stderr || err.message || 'Failed to read video info').trim().split('\n').pop();
        return resolve({ ok: false, error: msg });
      }
      try {
        const j = JSON.parse(stdout);
        resolve({
          ok: true,
          data: {
            title: j.title || j.id || 'video',
            duration: j.duration || null,
            thumbnail: j.thumbnail || null,
            filesize: j.filesize || j.filesize_approx || null,
            ext: j.ext || 'mp4',
            extractorKey: j.extractor_key || j.extractor || null,
            webpage_url: j.webpage_url || url
          }
        });
      } catch {
        resolve({ ok: false, error: 'Could not parse video info (unsupported page?)' });
      }
    }
  );
}));

// ---------- IPC: download lifecycle (per item id) ----------
function buildFormat(quality) {
  const h = { '1080': 1080, '720': 720, '480': 480 }[quality];
  if (!h) return 'bv*+ba/b';                          // Best
  return `bv*[height<=${h}]+ba/b[height<=${h}]`;
}

// req: { id, url, quality, folder }
function startDownload(req) {
  const prev = jobs.get(req.id);
  if (prev) killTree(prev.child.pid);

  const outTemplate = req.subfolders
    ? path.join(req.folder, '%(extractor_key)s', '%(title).200B [%(height)sp].%(ext)s')
    : path.join(req.folder, '%(title).200B [%(height)sp].%(ext)s');
  const args = [
    '-f', buildFormat(req.quality),
    '--no-playlist',
    '--continue',
    '--no-mtime',
    '-N', '4',
    '--ffmpeg-location', binDir,
    '--newline',
    '--progress-template',
    'download:VXP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '-o', outTemplate,
    req.url
  ];
  if (process.platform === 'win32') args.unshift('--windows-filenames');

  // detached on non-Windows makes the child a process-group leader, so killTree's
  // process.kill(-pid) can take down yt-dlp AND its ffmpeg child together.
  const child = spawn(YTDLP, args, { windowsHide: true, detached: process.platform !== 'win32' });
  const job = { child, dests: new Set(), pausing: false, stopping: false };
  jobs.set(req.id, job);
  send('vx-status', { id: req.id, state: 'downloading' });

  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '').trim();
      buf = buf.slice(nl + 1);
      handleLine(req.id, job, line);
    }
  });
  child.stderr.on('data', (d) => {
    d.toString().split('\n').forEach(l => { if (l.trim()) log(l.trim()); });
  });

  child.on('error', (e2) => {
    log('Failed to start yt-dlp: ' + e2.message);
    send('vx-status', { id: req.id, state: 'error', error: e2.message });
    jobs.delete(req.id);
  });

  child.on('close', (code) => {
    const j = jobs.get(req.id);
    jobs.delete(req.id);
    if (!j) return;
    if (j.pausing) { send('vx-status', { id: req.id, state: 'paused' }); return; }
    if (j.stopping) {
      j.dests.forEach(f => { tryUnlink(f); tryUnlink(f + '.part'); });
      send('vx-status', { id: req.id, state: 'stopped' });
      return;
    }
    if (code === 0) send('vx-status', { id: req.id, state: 'done' });
    else send('vx-status', { id: req.id, state: 'error', error: `yt-dlp exited (code ${code})` });
  });
}

function handleLine(id, job, line) {
  if (!line) return;
  if (line.startsWith('VXP|')) {
    const p = line.split('|');
    const num = (v) => (v && v !== 'NA' && v !== 'None') ? Number(v) : null;
    const downloaded = num(p[2]);
    const total = num(p[3]) || num(p[4]);
    const speed = num(p[5]);
    const eta = num(p[6]);
    const percent = (downloaded != null && total) ? Math.min(100, (downloaded / total) * 100) : null;
    send('vx-progress', { id, downloaded, total, speed, eta, percent });
    return;
  }
  const m = line.match(/^\[download\] Destination: (.+)$/);
  if (m) job.dests.add(m[1]);
  log(line);
}

ipcMain.on('vx-start', (e, req) => startDownload(req));
ipcMain.on('vx-resume', (e, req) => startDownload(req));            // resume = re-run, --continue picks up partial
ipcMain.on('vx-pause', (e, { id }) => { const j = jobs.get(id); if (j) { j.pausing = true; killTree(j.child.pid); } });
ipcMain.on('vx-stop', (e, { id }) => { const j = jobs.get(id); if (j) { j.stopping = true; killTree(j.child.pid); } });

// ---------- IPC: clipboard watcher ----------
// Polls the system clipboard from the main process (renderer's navigator.clipboard
// only works while focused; we want to catch URLs copied in other apps too).
let clipTimer = null;
let lastClip = '';
function startClipWatch() {
  if (clipTimer) return;
  lastClip = (clipboard.readText() || '').trim();   // seed: don't fire on the URL already there
  clipTimer = setInterval(() => {
    const t = (clipboard.readText() || '').trim();
    if (t && t !== lastClip) {
      lastClip = t;
      if (/^https?:\/\/\S+$/i.test(t)) send('vx-clip-url', t);
    }
  }, 1000);
}
function stopClipWatch() { if (clipTimer) { clearInterval(clipTimer); clipTimer = null; } }
ipcMain.on('vx-clip-watch', (e, on) => { on ? startClipWatch() : stopClipWatch(); });

// ---------- IPC: panic-hide global hotkey ----------
// Registers a system-wide accelerator that toggles the window. Works even when the
// app is unfocused; downloads keep running while hidden.
let panicAccel = null;
function setPanic(enabled, accel) {
  if (panicAccel) { try { globalShortcut.unregister(panicAccel); } catch {} panicAccel = null; }
  if (!enabled || !accel) return { ok: true };
  try {
    const ok = globalShortcut.register(accel, () => {
      if (!win || win.isDestroyed()) return;
      if (win.isVisible()) win.hide();
      else { win.show(); win.focus(); }
    });
    if (!ok) return { ok: false, error: `Couldn't register ${accel} (already in use?)` };
    panicAccel = accel;
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
ipcMain.handle('vx-panic-set', (e, { enabled, key }) => setPanic(enabled, key));

// ---------- IPC: yt-dlp self-update ----------
ipcMain.handle('vx-ytdlp-version', () => new Promise((res) => {
  if (!fs.existsSync(YTDLP)) return res({ ok: false, error: 'yt-dlp.exe not found' });
  execFile(YTDLP, ['--version'], (err, out) =>
    res(err ? { ok: false, error: err.message } : { ok: true, version: (out || '').trim() }));
}));
ipcMain.handle('vx-update-ytdlp', () => new Promise((res) => {
  if (!fs.existsSync(YTDLP)) return res({ ok: false, error: 'yt-dlp.exe not found' });
  execFile(YTDLP, ['-U'], { timeout: 120000 }, (err, out, errout) => {
    const text = ((out || '') + (errout || '')).trim();
    if (err && !text) return res({ ok: false, error: err.message });
    res({ ok: true, output: text });
  });
}));

app.on('will-quit', () => globalShortcut.unregisterAll());
