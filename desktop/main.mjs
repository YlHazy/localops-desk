import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, utilityProcess } from "electron";
import { desktopDeskUrl, desktopPetUrl, firstTrayNotice, localOpsReady, navigationAction, safeWindowBounds } from "./contract.mjs";

const smokeCheck = process.argv.includes("--smoke-check");
const smokeReportPath = smokeCheck ? process.env.LOCALOPS_SMOKE_REPORT : null;
if (smokeCheck) {
  app.setPath("userData", resolve(process.env.LOCALOPS_SMOKE_PROFILE || join(tmpdir(), `localops-guardian-smoke-${process.pid}`)));
}
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

let petWindow = null;
let petLoadPromise = Promise.resolve();
let deskWindow = null;
let tray = null;
let ownedApi = null;
let quitting = false;
let alwaysOnTop = true;
let firstCloseNoticeShown = false;

function appPath(...parts) {
  return join(app.getAppPath(), ...parts);
}

function statePath() {
  return join(app.getPath("userData"), "desktop-window.json");
}

function readDesktopState() {
  try {
    const state = JSON.parse(readFileSync(statePath(), "utf8"));
    return state && typeof state === "object" ? state : {};
  } catch {
    return {};
  }
}

function writeDesktopState(patch) {
  try {
    writeFileSync(statePath(), JSON.stringify({ ...readDesktopState(), ...patch }), "utf8");
    return true;
  } catch {
    return false;
  }
}

function writeSmokeReport(report) {
  if (!smokeReportPath) return;
  writeFileSync(smokeReportPath, `${JSON.stringify(report)}\n`, "utf8");
}

function finishSmoke(exitCode) {
  quitting = true;
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
  if (deskWindow && !deskWindow.isDestroyed()) deskWindow.destroy();
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
  if (ownedApi) ownedApi.kill();
  app.exit(exitCode);
}

function readPetBounds() {
  return safeWindowBounds(readDesktopState().petBounds);
}

function persistPetBounds() {
  if (!petWindow || petWindow.isDestroyed()) return;
  writeDesktopState({ petBounds: petWindow.getBounds() });
}

function secureWindowOptions(extra = {}) {
  return {
    show: false,
    backgroundColor: "#0d1715",
    icon: appPath("build", "icon.png"),
    webPreferences: {
      preload: appPath("desktop", "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    ...extra
  };
}

function openExternalAllowed(url) {
  if (navigationAction(url) !== "external") return;
  void shell.openExternal(url);
}

function assertTrustedIpc(event) {
  let origin = "";
  try {
    origin = new URL(event.senderFrame?.url || "").origin;
  } catch {
    // Keep an empty origin and reject below.
  }
  if (origin !== "http://127.0.0.1:4317") throw new Error("Desktop request rejected outside the LocalOps loopback app.");
}

function attachNavigationGuard(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const action = navigationAction(url);
    if (action === "desk") showDesk(new URL(url).hash);
    else if (action === "external") openExternalAllowed(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url === window.webContents.getURL()) return;
    event.preventDefault();
    const action = navigationAction(url);
    if (action === "desk") showDesk(new URL(url).hash);
    else if (action === "external") openExternalAllowed(url);
  });
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow;
  petWindow = new BrowserWindow(secureWindowOptions({
    ...readPetBounds(),
    minWidth: 340,
    minHeight: 600,
    title: "LocalOps Guardian",
    autoHideMenuBar: true,
    alwaysOnTop
  }));
  attachNavigationGuard(petWindow);
  petWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    persistPetBounds();
    petWindow.hide();
    if (!firstCloseNoticeShown && tray) {
      firstCloseNoticeShown = true;
      writeDesktopState({ trayCloseExplained: true });
      tray.displayBalloon({ ...firstTrayNotice, iconType: "info", largeIcon: false });
    }
    rebuildTrayMenu();
  });
  petWindow.on("move", persistPetBounds);
  petWindow.on("resize", persistPetBounds);
  petWindow.on("closed", () => { petWindow = null; });
  petWindow.once("ready-to-show", () => {
    if (!smokeCheck) petWindow.show();
  });
  petLoadPromise = petWindow.loadURL(desktopPetUrl());
  if (!smokeCheck) {
    void petLoadPromise.catch((error) => dialog.showErrorBox("LocalOps 界面加载失败", error instanceof Error ? error.message : String(error)));
  }
  return petWindow;
}

function showPet() {
  const window = createPetWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  rebuildTrayMenu();
}

function showDesk(path = "") {
  const url = desktopDeskUrl(path || "/");
  if (!deskWindow || deskWindow.isDestroyed()) {
    deskWindow = new BrowserWindow(secureWindowOptions({
      width: 1220,
      height: 820,
      minWidth: 900,
      minHeight: 620,
      title: "LocalOps 控制台",
      autoHideMenuBar: true
    }));
    attachNavigationGuard(deskWindow);
    deskWindow.on("closed", () => { deskWindow = null; });
  }
  void deskWindow.loadURL(url);
  deskWindow.once("ready-to-show", () => deskWindow?.show());
  if (deskWindow.isMinimized()) deskWindow.restore();
  deskWindow.show();
  deskWindow.focus();
}

function setAlwaysOnTop(enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("always-on-top must be a boolean");
  alwaysOnTop = enabled;
  if (petWindow && !petWindow.isDestroyed()) petWindow.setAlwaysOnTop(enabled);
  rebuildTrayMenu();
  return {
    supported: true,
    topmost: enabled,
    message: enabled ? "桌宠已由 LocalOps 桌面宿主保持置顶。" : "桌宠已恢复为普通桌面窗口。"
  };
}

function loginExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function loginStartupState() {
  if (process.platform !== "win32") {
    return { supported: false, enabled: false, status: "unsupported", ready: false, blockers: ["当前仅支持 Windows 用户登录启动"], message: "当前系统不支持登录后启动。" };
  }
  if (!app.isPackaged) {
    return { supported: true, enabled: false, status: "not-installed", ready: false, blockers: ["请先使用打包后的 LocalOps 桌面程序"], message: "开发预览不会写入 Windows 登录启动项；打包版可直接开启。" };
  }
  const enabled = app.getLoginItemSettings({ path: loginExecutablePath(), args: [] }).openAtLogin;
  return {
    supported: true,
    enabled,
    status: enabled ? "managed" : "not-installed",
    ready: true,
    blockers: [],
    message: enabled ? "登录 Windows 后会自动启动 LocalOps，并在系统托盘持续值守。" : "尚未开启登录后自动值守。"
  };
}

function setLoginStartup(enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("login startup must be a boolean");
  const current = loginStartupState();
  if (!current.supported || !current.ready) throw new Error(current.message);
  app.setLoginItemSettings({ openAtLogin: enabled, path: loginExecutablePath(), args: [] });
  const updated = loginStartupState();
  if (updated.enabled !== enabled) throw new Error("Windows 没有确认登录启动设置，当前状态保持不变。");
  return updated;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const visible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "● 本地值守运行中", enabled: false },
    { type: "separator" },
    { label: visible ? "隐藏小哨" : "显示小哨", click: () => visible ? petWindow?.hide() : showPet() },
    { label: "打开完整控制台", click: () => showDesk() },
    { type: "separator" },
    { label: "桌宠置顶", type: "checkbox", checked: alwaysOnTop, click: (item) => setAlwaysOnTop(item.checked) },
    { type: "separator" },
    { label: "退出 LocalOps（停止本次值守）", click: () => { quitting = true; app.quit(); } }
  ]));
}

function createTray() {
  const source = nativeImage.createFromPath(appPath("build", "icon.png"));
  tray = new Tray(source.resize({ width: 20, height: 20 }));
  tray.setToolTip("LocalOps Guardian · 本地值守中");
  tray.on("click", () => {
    if (petWindow?.isVisible()) petWindow.hide();
    else showPet();
    rebuildTrayMenu();
  });
  rebuildTrayMenu();
}

async function waitForApi(attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await localOpsReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureApi() {
  if (await localOpsReady()) return "existing";
  ownedApi = utilityProcess.fork(appPath("server", "index.mjs"), [], {
    env: {
      ...process.env,
      LOCALOPS_API_HOST: "127.0.0.1",
      LOCALOPS_API_PORT: "4317",
      LOCALOPS_DATA_DIR: join(app.getPath("userData"), "data")
    },
    stdio: "pipe",
    serviceName: "LocalOps local monitoring API"
  });
  ownedApi.stdout?.on("data", (chunk) => { if (smokeCheck) process.stdout.write(chunk); });
  ownedApi.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  if (!await waitForApi()) throw new Error("本地值守 API 没有在 15 秒内就绪；为避免连接到未知服务，桌面宿主已停止启动。");
  return "owned";
}

ipcMain.handle("desktop:get-state", (event) => {
  assertTrustedIpc(event);
  return { desktop: true, topmost: alwaysOnTop, closeBehavior: "tray", startup: loginStartupState() };
});
ipcMain.handle("desktop:set-always-on-top", (event, enabled) => {
  assertTrustedIpc(event);
  return setAlwaysOnTop(enabled);
});
ipcMain.handle("desktop:set-login-startup", (event, enabled) => {
  assertTrustedIpc(event);
  return { startup: setLoginStartup(enabled) };
});
ipcMain.handle("desktop:show-pet", (event) => {
  assertTrustedIpc(event);
  showPet();
  return { opened: true };
});
ipcMain.handle("desktop:show-desk", (event, path) => {
  assertTrustedIpc(event);
  showDesk(typeof path === "string" ? path : "");
  return { opened: true };
});

app.on("second-instance", () => showPet());
app.on("before-quit", () => {
  quitting = true;
  persistPetBounds();
  if (ownedApi) ownedApi.kill();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && quitting) app.quit();
});

if (gotSingleInstanceLock) {
  app.whenReady().then(async () => {
    try {
      app.setAppUserModelId("com.localops.guardian");
      firstCloseNoticeShown = readDesktopState().trayCloseExplained === true;
      const apiOwnership = await ensureApi();
      createPetWindow();
      createTray();
      if (smokeCheck) {
        await Promise.race([
          petLoadPromise,
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Desktop renderer smoke check timed out.")), 15_000))
        ]);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const result = await petWindow.webContents.executeJavaScript("({ title: document.title, runtime: new URLSearchParams(location.search).get('runtime'), hasApp: Boolean(document.querySelector('.pet-window')) })");
        if (result.title !== "LocalOps Guardian" || result.runtime !== "desktop" || !result.hasApp) {
          throw new Error(`Desktop renderer smoke result was incomplete: ${JSON.stringify(result)}`);
        }
        petWindow.close();
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
        const report = {
          ok: true,
          pid: process.pid,
          apiOwnership,
          hasTray: Boolean(tray && !tray.isDestroyed()),
          hiddenToTray: Boolean(petWindow && !petWindow.isDestroyed() && !petWindow.isVisible()),
          closeNoticePersisted: readDesktopState().trayCloseExplained === true,
          ...result
        };
        process.stdout.write(`${JSON.stringify(report)}\n`);
        writeSmokeReport(report);
        finishSmoke(0);
      }
    } catch (error) {
      writeSmokeReport({ ok: false, error: error instanceof Error ? error.message : String(error) });
      if (!smokeCheck) dialog.showErrorBox("LocalOps 无法启动", error instanceof Error ? error.message : String(error));
      else process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exitCode = 1;
      if (smokeCheck) finishSmoke(1);
      else {
        quitting = true;
        app.quit();
      }
    }
  });
}
