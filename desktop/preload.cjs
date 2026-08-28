const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("localOpsDesktop", Object.freeze({
  getState: () => ipcRenderer.invoke("desktop:get-state"),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("desktop:set-always-on-top", enabled),
  hidePet: () => ipcRenderer.invoke("desktop:hide-pet"),
  showDesk: (path) => ipcRenderer.invoke("desktop:show-desk", path),
  showPet: () => ipcRenderer.invoke("desktop:show-pet"),
  hideCodexPet: () => ipcRenderer.invoke("desktop:hide-codex-pet"),
  showCodexPet: () => ipcRenderer.invoke("desktop:show-codex-pet"),
  setCodexCompanionHover: (active) => ipcRenderer.invoke("desktop:set-codex-companion-hover", active),
  setCodexPanelDetail: (detail) => ipcRenderer.invoke("desktop:set-codex-panel-detail", detail),
  resizeCodexPet: (direction) => ipcRenderer.invoke("desktop:resize-codex-pet", direction),
  showNotification: (request) => ipcRenderer.invoke("desktop:show-notification", request),
  setLoginStartup: (enabled) => ipcRenderer.invoke("desktop:set-login-startup", enabled)
}));
