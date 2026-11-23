const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  toggleMode: () => ipcRenderer.invoke('desktop-pet:toggle-mode'),
  minimize: () => ipcRenderer.send('desktop-pet:minimize'),
  close: () => ipcRenderer.send('desktop-pet:close'),
  onModeChanged: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('desktop-pet:mode-changed', (_event, enabled) => callback(enabled));
    }
  },
  onCursorMoved: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('desktop-pet:cursor-moved', (_event, x) => callback(x));
    }
  }
});
