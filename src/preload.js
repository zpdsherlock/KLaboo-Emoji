const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('klabooAPI', {
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  writeFile: (filePath, data) => ipcRenderer.invoke('file:write', { filePath, data }),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  setDirty: (v) => ipcRenderer.send('doc:dirty', v),
  setTitle: (t) => ipcRenderer.send('doc:title', t),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
