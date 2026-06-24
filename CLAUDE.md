# Video Download by CMK — Codebase Guide

A simple-GUI video downloader. Electron front-end that drives bundled **`yt-dlp.exe`** + **`ffmpeg.exe`** as subprocesses — it does **not** scrape sites itself. The folder is still named `video-extractor/` (product name was renamed later; folder kept to avoid path churn).

---

## Architecture

```
┌─ main.js ─────────────┐  spawn/track yt-dlp (jobs Map, id-keyed)
│  Electron main process│  kill process TREE on pause/stop (ffmpeg is a child)
│                       │  clipboard watcher · IPC handlers
└───────────▲───────────┘
            │ preload.js  (contextBridge → window.vxBridge)
┌───────────▼───────────┐
│ src/index.html  (UI+CSS)
│ src/renderer.js (queue engine, history, rendering)
└───────────────────────┘
bin/  yt-dlp.exe · ffmpeg.exe · ffprobe.exe   (gitignored — see bin/README.txt)
```

The engine is the key idea: **wrap yt-dlp, don't write extractors.** yt-dlp already supports hundreds of sites, handles HLS/DASH→MP4 merging (via ffmpeg), and exposes metadata as JSON. Our job is a nice GUI + process lifecycle.

---

## File Map

| File | Purpose |
|------|---------|
| `main.js` | Electron main. Window, IPC, `jobs` Map of active downloads, `startDownload()`, process-tree kill, clipboard watcher, `vx-load-meta`. |
| `preload.js` | `contextBridge` exposing `window.vxBridge` (the only renderer↔main surface). |
| `src/index.html` | UI markup + all CSS (dark theme). Add-URL row, Quality/clipboard/folder settings, Queue/History tabs, log. |
| `src/renderer.js` | Queue engine (`pump()`/`startItem()`/`addUrl()`), per-item controls, progress/history rendering, localStorage persistence. |
| `bin/README.txt` | Where to download the two binaries. |
| `package.json` | `name: video-download-cmk`, `productName: "Video Download by CMK"`, electron + electron-builder, `extraResources` ships `bin/`. |

---

## Download lifecycle (the important part)

`renderer` owns the **queue/ordering/persistence**; `main` owns the **processes**. Every download is identified by a renderer-generated `item.id`, and all IPC + events carry that id.

1. **Add** → `addUrl()` creates an item (`state:'loading'`), calls `vxBridge.loadMeta(url)` (`yt-dlp -J`), fills title/thumb/size, sets `state:'queued'`. **Adding does NOT start a download** — it only enqueues.
2. **Download button** → `startQueue()` sets the `running` flag and calls `pump()`. **pump()** is the sequential queue driver: while `running`, it fills slots up to `MAX_CONCURRENT` (default **1**; bump the constant in `renderer.js` — `main.js` keys jobs by id so it supports N) by starting `queued` items, and clears `running` once the queue is fully drained. Nothing auto-starts unless `running` is set, so URLs pile up until the user clicks Download (URLs added *during* a run fold into it).
3. **startItem()** → `vxBridge.start({id,url,quality,folder,subfolders})` → `main.startDownload()` spawns yt-dlp with `--progress-template` (sentinel lines `VXP|status|downloaded|total|total_est|speed|eta`), `--continue`, `--ffmpeg-location bin/`, output template `%(title).200B [%(height)sp].%(ext)s` — or `%(extractor_key)s/%(title)…` when **per-site subfolders** is on (the Settings toggle, captured per-item at add-time; yt-dlp creates the site folder). History stores the resolved folder so "Open folder" lands in the site subfolder.
4. **Progress** — main parses `VXP|` lines → `vx-progress {id,...}` → renderer updates just that row (`updateProgressRow`, no full re-render).
5. **Pause / Resume / Stop** map to process control:
   - **Pause** = `job.pausing=true` + kill tree → keep partial → `vx-status {state:'paused'}`.
   - **Resume** = re-spawn same args; yt-dlp `--continue` picks up the partial (HTTP) or skips done HLS fragments. *Not a frozen suspend — it's stop-and-continue.*
   - **Stop** = `job.stopping=true` + kill tree + delete the `dests` partials → `state:'stopped'`.
6. **Done** → `vx-status {state:'done'}` → renderer archives to history, removes from queue, `pump()` next.

> **Always kill the process TREE** (`taskkill /PID x /T /F`). yt-dlp spawns ffmpeg; killing only the parent leaves ffmpeg running. See `killTree()` / `killAll()`.

> Progress bar may go 0→100 **twice** then merge: yt-dlp downloads video and audio as separate passes before ffmpeg muxes them. Expected, not a bug.

---

## Quality presets

`buildFormat(quality)` in `main.js` maps the dropdown to a yt-dlp `-f` selector:

| Dropdown | `-f` |
|----------|------|
| `best`   | `bv*+ba/b` |
| `1080` / `720` / `480` | `bv*[height<=N]+ba/b[height<=N]` |

`height<=N` picks the best stream at or below N, so it works even when the exact height isn't offered. Presets are global (not per-video), captured onto each item at add-time.

---

## Clipboard watcher

`main.js` polls the **system** clipboard (Electron `clipboard.readText()`, 1 s interval) — the renderer's `navigator.clipboard` only works while focused, but we want to catch URLs copied in other apps. On a new URL it emits `vx-clip-url`; renderer auto-adds it (deduped). Toggled by the "Auto-add copied URLs" checkbox → `vxBridge.clipWatch(on)`. Seeds `lastClip` on start so it never fires on whatever was already copied.

---

## Privacy & settings (Phase 3)

All in the **⚙ Settings** modal (`settingsBtn`), state in localStorage, logic in the "settings & privacy" block of `renderer.js`.

- **App lock** — passcode hashed with `sha256hex()` (Web Crypto) into `vd_lockhash`. On launch, `init()` shows `#lockScreen` *synchronously before any await* so the app never flashes unlocked; `tryUnlock()` compares hashes. **Casual deterrent only** — localStorage is editable by anyone with disk access; it's not encryption.
- **Panic-hide hotkey** — renderer records an accelerator (keydown capture → Electron format, `CommandOrControl+…`), `main.setPanic()` registers it via `globalShortcut`; the callback toggles `win.hide()`/`win.show()`. Works unfocused; downloads keep running while hidden. The only way back is the hotkey (no tray), so the combo is shown in Settings.
- **Incognito** — `body.incognito` CSS blurs `.thumb`/`.ititle` (hover reveals); `archive()` early-returns so nothing is written to history.
- **Discreet title** — sets `document.title` (Electron window title follows it → taskbar/alt-tab label).
- **yt-dlp self-update** — `updateYtdlp()` runs `yt-dlp -U`; version shown via `ytdlpVersion()`.

> Electron has no `window.prompt`, so passcode entry uses the reusable `askText()` modal (`#promptModal`) returning `Promise<string|null>`.

## IPC Channels (`window.vxBridge`)

| Method / Event | Dir | Purpose |
|----------------|-----|---------|
| `checkBins()` | r→m | `{ytdlp, ffmpeg, binDir}` existence check (startup banner) |
| `defaultDir()` | r→m | OS Videos/Downloads path |
| `browse()` | r→m | Folder picker dialog |
| `loadMeta(url)` | r→m | `yt-dlp -J` → `{title,duration,thumbnail,filesize,ext}` |
| `openFolder(path)` | r→m | Reveal a folder |
| `start(req)` / `resume(req)` | r→m | Spawn/respawn a download `{id,url,quality,folder}` |
| `pause(id)` / `stop(id)` | r→m | Pause (keep partial) / Stop (delete partial) |
| `clipWatch(on)` | r→m | Start/stop the clipboard poller |
| `panicSet(enabled,key)` | r→m | Register/unregister the global panic-hide hotkey |
| `ytdlpVersion()` | r→m | Current yt-dlp version string |
| `updateYtdlp()` | r→m | Run `yt-dlp -U` (self-update) |
| `onProgress(cb)` | m→r | `{id,downloaded,total,speed,eta,percent}` |
| `onStatus(cb)` | m→r | `{id,state,error?}` — `downloading\|paused\|done\|stopped\|error` |
| `onClipUrl(cb)` | m→r | A newly-copied URL to auto-add |
| `onLog(cb)` | m→r | Raw yt-dlp stdout/stderr lines → log pane |

To add a channel: declare it in `preload.js`, handle it in `main.js` (`ipcMain.handle`/`.on`), call `window.vxBridge.x()` in `renderer.js`.

---

## State persistence (localStorage, in renderer)

| Key | Holds |
|-----|-------|
| `vd_folder` | Save-to folder |
| `vd_quality` | Default quality preset |
| `vd_clipwatch` | Clipboard-watch on/off |
| `vd_subfolders` | Per-site subfolders on/off |
| `vd_history` | Completed downloads (max 100) |
| `vd_lock` / `vd_lockhash` | App-lock on/off + SHA-256 of passcode |
| `vd_panic` / `vd_panickey` | Panic hotkey on/off + accelerator |
| `vd_incognito` | Incognito (no history + blur) |
| `vd_discreet` / `vd_discreetname` | Discreet title on/off + the fake name |

The live **queue** (`items[]`) is intentionally **not** persisted — it's in-flight state. Only finished downloads survive a restart (history).

---

## Item state machine (`renderer.js`)

`loading → queued → downloading ⇄ paused → done` (archived to history)
Side exits: `→ error` (Retry/Remove), `→ stopped` (Retry/Remove). `ctrlsFor(state)` decides which buttons a row shows. The queue only advances while `running` (set by the Download button); `pump()` then starts `queued` items, and `paused` holds its concurrency slot so the queue stays predictable. Retry/Remove call `pump()` too, but it's a no-op unless a run is active.

---

## Build & Run

```bash
npm start            # dev (needs bin/yt-dlp.exe + bin/ffmpeg.exe present)
npm run dist         # build NSIS one-click installer → dist/
```

`extraResources` copies `bin/` next to the app at package time; `main.js` resolves `binDir` as `./bin` in dev and `process.resourcesPath/bin` when packaged.

**Binaries** (gitignored; ~290 MB): `yt-dlp.exe` from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases), `ffmpeg.exe`/`ffprobe.exe` from a [BtbN win64 build](https://github.com/BtbN/FFmpeg-Builds/releases). Re-fetch yt-dlp every few weeks — sites change and it updates often.

---

## Roadmap

- **Phase 1 (done):** single download, metadata, Download/Pause/Resume/Stop.
- **Phase 2 (done):** download queue, history (re-download/open-folder), clipboard auto-watch.
- **Phase 3 (done):** privacy suite (app lock, panic-hide hotkey, incognito/no-history, discreet title) + one-click yt-dlp self-update.
- **Phase 3.1 (done):** per-site subfolders (Settings toggle → `%(extractor_key)s/` in the output path).
- **Future ideas:** themes, cookies/proxy, filename templates, concurrent downloads (bump `MAX_CONCURRENT`).
