const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetWindow', {
  close: () => ipcRenderer.send('widget:close'),
  openSettings: () => ipcRenderer.send('widget:open-settings'),
  closeSettings: () => ipcRenderer.send('settings:close'),
  updateSettings: (payload) => ipcRenderer.send('widget:settings-updated', payload),
  onSettingsUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('widget:settings-updated', listener);
    return () => ipcRenderer.removeListener('widget:settings-updated', listener);
  },
  setAlwaysOnTop: (value) => ipcRenderer.invoke('widget:set-always-on-top', value),
  setOpacity: (value) => ipcRenderer.invoke('widget:set-opacity', value),
  getAutoStart: () => ipcRenderer.invoke('widget:get-autostart'),
  setAutoStart: (value) => ipcRenderer.invoke('widget:set-autostart', value),
  getCustomImage: () => ipcRenderer.invoke('widget:get-custom-image'),
  pickCustomImage: () => ipcRenderer.invoke('widget:pick-custom-image'),
  removeCustomImage: () => ipcRenderer.invoke('widget:remove-custom-image'),
});
