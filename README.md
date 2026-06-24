<h1 align="center">🎬 Video Download by CMK</h1>

<p align="center">
  A fast, no-nonsense desktop <b>video downloader</b> with a clean GUI and a Matrix-green hacker look.<br>
  Paste a link, queue up as many as you want, hit <b>Download</b>.
</p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%2F11-0078D6?logo=windows&logoColor=white">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-2f3242?logo=electron&logoColor=9FEAF9">
  <img alt="Powered by yt-dlp" src="https://img.shields.io/badge/engine-yt--dlp%20%2B%20ffmpeg-39ff14">
</p>

> Powered by [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) + [`ffmpeg`](https://ffmpeg.org/) under the hood — both bundled in the installer, so there's nothing else to set up.

<!-- Add a screenshot here once you have one:  ![screenshot](docs/screenshot.png) -->

---

## 📥 Download

Grab the latest installer from the **[Releases page](../../releases)** → `Video Download by CMK Setup x.y.z.exe`.

It installs **per-user (no admin needed)** with a normal wizard, and adds a desktop + Start-menu shortcut.

> **Heads-up:** the app isn't code-signed, so on first run Windows SmartScreen shows *"Windows protected your PC"* → click **More info → Run anyway**. If the installer seems to do nothing, right-click it → **Properties** → check **Unblock** → **Apply**, then run again. (Some antivirus tools throw a *false positive* on the bundled `yt-dlp.exe` — common for downloader utilities.)

---

## ✨ Features

- **Paste & go** — auto-detects title, thumbnail, size, and duration from a URL
- **Download queue** — line up many videos, start them all with one button
- **Pause / Resume / Stop** per download, with live progress, speed & ETA
- **Quality picker** — Best / 1080p / 720p / 480p
- **History** — re-download or open the file's folder
- **Clipboard watch** — optionally auto-add any video URL you copy
- **Per-site subfolders** — keep each site's downloads separated
- **Privacy suite** 🔒 — passcode lock, panic-hide hotkey, incognito (no history + blurred titles/thumbs), discreet taskbar title
- **Matrix theme** — green-on-black, monospace, digital rain 🟢

---

## 🚀 Usage

1. Launch the app
2. Paste a video URL (**Ctrl+V**) and press **Enter** to add it to the queue
3. Choose **quality** and a **save folder**
4. Add as many as you like, then click **Download** — they process one after another

Sites change often; if downloads start failing, open **⚙ Settings → Update yt-dlp** to pull the latest engine (no reinstall needed).

---

## 🛠️ Build from source

Requires [Node.js](https://nodejs.org/) (LTS) on Windows.

```bash
git clone <your-repo-url>
cd video-extractor
npm install

# Drop the engine binaries into bin/ (they're gitignored — see bin/README.txt):
#   bin/yt-dlp.exe    https://github.com/yt-dlp/yt-dlp/releases
#   bin/ffmpeg.exe    https://github.com/BtbN/FFmpeg-Builds/releases  (also grab ffprobe.exe)

npm start            # run in dev
npm run dist         # build the Windows installer → dist/
```

> **Building the installer?** electron-builder needs to extract a helper that contains macOS symlinks, which Windows blocks unless **Developer Mode is ON** (*Settings → Update & Security → For developers*) or you run the build from an **elevated** terminal. Dev runs (`npm start`) don't need this.

**Custom icon:** replace `build/icon-src.png` and run `npm run make-icon` (auto-crops, squares, and packs a multi-res `icon.ico`).

Architecture notes for contributors live in [`CLAUDE.md`](CLAUDE.md).

---

## 🧰 Tech

`Electron` · `yt-dlp` · `ffmpeg` · `electron-builder` (packaging) · `jimp` + `png-to-ico` (icon tooling)

---

## ⚖️ Disclaimer

For **personal use only**. You are responsible for respecting the terms of service of the sites you use and the copyright of the content you download. This project bundles `yt-dlp` and `ffmpeg`, which are licensed under their own terms.

---

<p align="center">Made with 💚 by CMK</p>
