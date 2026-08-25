const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("localOpsDesktop", Object.freeze({
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("desktop:set-always-on-top", enabled),
  hidePet: () => ipcRenderer.invoke("desktop:hide-pet"),
  showDesk: (path) => ipcRenderer.invoke("desktop:show-desk", path),
  showPet: () => ipcRenderer.invoke("desktop:show-pet"),
  showNotification: (request) => ipcRenderer.invoke("desktop:show-notification", request),
  setLoginStartup: (enabled) => ipcRenderer.invoke("desktop:set-login-startup", enabled)
}));
