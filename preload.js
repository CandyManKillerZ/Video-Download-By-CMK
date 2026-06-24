const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vxBridge', {
  checkBins:   ()     => ipcRenderer.invoke('vx-check-bins'),
  defaultDir:  ()     => ipcRenderer.invoke('vx-default-dir'),
  browse:      ()     => ipcRenderer.invoke('vx-browse'),
  loadMeta:    (url)  => ipcRenderer.invoke('vx-load-meta', url),
  openFolder:  (p)    => ipcRenderer.send('vx-open-folder', p),
  // downloads are keyed by item id
  start:       (req)  => ipcRenderer.send('vx-start', req),     // { id, url, quality, folder }
  resume:      (req)  => ipcRenderer.send('vx-resume', req),    // { id, url, quality, folder }
  pause:       (id)   => ipcRenderer.send('vx-pause', { id }),
  stop:        (id)   => ipcRenderer.send('vx-stop', { id }),
  clipWatch:   (on)   => ipcRenderer.send('vx-clip-watch', on),
  panicSet:    (enabled, key) => ipcRenderer.invoke('vx-panic-set', { enabled, key }),
  ytdlpVersion:()     => ipcRenderer.invoke('vx-ytdlp-version'),
  updateYtdlp: ()     => ipcRenderer.invoke('vx-update-ytdlp'),
  onProgress:  (cb)   => ipcRenderer.on('vx-progress', (e, d) => cb(d)),  // { id, ... }
  onStatus:    (cb)   => ipcRenderer.on('vx-status',   (e, d) => cb(d)),  // { id, state, error? }
  onClipUrl:   (cb)   => ipcRenderer.on('vx-clip-url', (e, url) => cb(url)),
  onLog:       (cb)   => ipcRenderer.on('vx-log',      (e, d) => cb(d))
});
