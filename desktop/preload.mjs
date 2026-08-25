import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("localOpsDesktop", Object.freeze({
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("desktop:set-always-on-top", enabled),
  showDesk: (path) => ipcRenderer.invoke("desktop:show-desk", path),
  showPet: () => ipcRenderer.invoke("desktop:show-pet"),
  setLoginStartup: (enabled) => ipcRenderer.invoke("desktop:set-login-startup", enabled)
}));
