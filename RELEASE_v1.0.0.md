# 🎬 Video Download by CMK — v1.0.0

A fast, no-nonsense **video downloader** with a clean GUI and a Matrix-green hacker look. Paste a link, queue up as many as you want, hit **Download**. Powered by `yt-dlp` + `ffmpeg` under the hood (both bundled — nothing else to install).

---

## 📥 Download

**⬇ `Video Download by CMK Setup 1.0.0.exe`** — Windows 10/11 (64-bit) — in the **Assets** section below.

Download it, run it, follow the wizard. It installs per-user (no admin needed) and adds a desktop + Start-menu shortcut.

---

## ⚠️ First launch — "Windows protected your PC"

This app is **not code-signed** (signing certificates cost money), so Windows will warn you the first time. It's safe — here's how to get past it:

1. If you see **"Windows protected your PC"** → click **More info** → **Run anyway**.
2. If double-clicking the installer seems to **do nothing**, Windows tagged it as downloaded ("Mark of the Web"). Fix it:
   - **Right-click** `Video Download by CMK Setup 1.0.0.exe` → **Properties**
   - At the bottom, check **Unblock** → **Apply** → **OK**
   - Run it again.
3. **Antivirus flagging it?** Some AVs throw a *false positive* on the bundled `yt-dlp.exe` (this is extremely common for downloader tools — they're built with PyInstaller, which AVs are twitchy about). If you're unsure, scan it on [VirusTotal](https://www.virustotal.com/) — the detections you'll see are generic heuristics on yt-dlp, not the app.

---

## ✨ Features

- **Paste & go** — drop in a URL, auto-detects title, thumbnail, size, and duration
- **Download queue** — line up as many videos as you want, then start them all with one button
- **Pause / Resume / Stop** on any download, with live progress, speed, and ETA
- **Quality picker** — Best / 1080p / 720p / 480p
- **History** — re-download or jump straight to the file's folder
- **Clipboard watch** — optionally auto-add any video URL you copy
- **Per-site subfolders** — keep each site's downloads neatly separated
- **Privacy suite** 🔒 — passcode lock, a panic-hide hotkey, incognito mode (no history + blurred titles/thumbnails), and a discreet taskbar title
- **Matrix theme** — green-on-black, monospace, with digital rain 🟢

---

## 🚀 Quick start

1. Launch **Video Download by CMK**
2. Paste a video URL (**Ctrl+V**) and press **Enter** to add it
3. Choose your **quality** and **save folder**
4. Add more links if you want, then click **Download** — they'll process one after another

---

## 🔄 Keep it working

Sites change constantly, and `yt-dlp` updates often to keep up. If a download starts failing, open **⚙ Settings → Update yt-dlp** — one click pulls the latest engine. No reinstall needed.

---

## 💻 Requirements

- Windows 10 or 11, 64-bit
- ~500 MB free disk space (the engine is bundled)
- An internet connection 🙂

---

## 🙏 Built with

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the extraction engine
- [FFmpeg](https://ffmpeg.org/) — muxing & conversion
- [Electron](https://www.electronjs.org/) — the app shell

---

## ⚖️ Disclaimer

For **personal use only**. You are responsible for respecting the terms of service of the sites you use and the copyright of the content you download. Don't download anything you don't have the right to.

---

*Found a bug or have a request? Open an issue.* 💚
