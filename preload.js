const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetWindow', {
  close: () => ipcRenderer.send('widget:close'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('widget:set-always-on-top', value),
  setOpacity: (value) => ipcRenderer.invoke('widget:set-opacity', value),
  getAutoStart: () => ipcRenderer.invoke('widget:get-autostart'),
  setAutoStart: (value) => ipcRenderer.invoke('widget:set-autostart', value),
});
