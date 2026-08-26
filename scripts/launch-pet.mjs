import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPetSessionId, petModePath, petPresencePath } from "../src/pet-presence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultHost = "127.0.0.1";
const defaultPort = 4317;

export function petUrl({ host = defaultHost, port = defaultPort, sessionId = null, runtimeMode = null } = {}) {
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Pet window only supports a loopback LocalOps host.");
  }
  const authority = host === "::1" ? `[${host}]:${port}` : `${host}:${port}`;
  if (sessionId != null && !isPetSessionId(sessionId)) throw new Error("Pet window session must be a UUID.");
  return new URL(petModePath(sessionId, runtimeMode), `http://${authority}`).toString();
}

export function edgeCandidates(environment = process.env) {
  return [
    environment.LOCALOPS_BROWSER_PATH,
    environment["PROGRAMFILES(X86)"] ? join(environment["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
    environment.PROGRAMFILES ? join(environment.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    environment.LOCALAPPDATA ? join(environment.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe") : null
  ].filter(Boolean);
}

export async function firstExistingPath(candidates, canAccess = access) {
  for (const candidate of candidates) {
    try {
      await canAccess(candidate);
      return candidate;
    } catch {
      // Continue through the bounded candidate list.
    }
  }
  return null;
}

export function petRuntimeModeForApi(alreadyRunning) {
  return alreadyRunning ? "existing" : "owned";
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  const major = Number.parseInt(String(version).split(".")[0], 10);
  if (!Number.isInteger(major) || major < 22 || major >= 25) {
    throw new Error(`LocalOps 需要 Node.js 22–24；当前版本为 ${version || "未知"}。`);
  }
}

export async function assertPetBuildAvailable(canAccess = access) {
  try {
    await canAccess(join(root, "dist", "index.html"));
  } catch {
    throw new Error("尚未生成 LocalOps 桌宠界面。首次使用请在项目目录运行 npm install，然后运行 npm run build。");
  }
}

export async function localOpsReady(url, fetchImpl = fetch) {
  try {
    const request = { signal: AbortSignal.timeout(1_500) };
    const manifestResponse = await fetchImpl(new URL("/api/agent/manifest", url), request);
    if (!manifestResponse.ok) return false;
    const manifest = await manifestResponse.json();
    if (manifest?.name !== "LocalOps Desk Agent API" || manifest?.safety?.arbitraryShell !== false) return false;

    const statusResponse = await fetchImpl(new URL("/api/status", url), request);
    if (!statusResponse.ok) return false;
    const payload = await statusResponse.json();
    return Boolean(payload && typeof payload === "object" && payload.counts && Array.isArray(payload.hosts));
  } catch {
    return false;
  }
}

export async function petSessionPresent(url, fetchImpl = fetch) {
  try {
    const target = new URL(url);
    const sessionId = target.searchParams.get("session");
    if (!isPetSessionId(sessionId)) return false;
    const response = await fetchImpl(new URL(petPresencePath(sessionId), target), {
      signal: AbortSignal.timeout(1_500)
    });
    if (!response.ok) return false;
    return (await response.json())?.presence?.present === true;
  } catch {
    return false;
  }
}

export async function activePetPresence(url, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(new URL("/api/pet-presence", url), {
      signal: AbortSignal.timeout(1_500)
    });
  } catch {
    throw new Error("无法确认 LocalOps 桌宠是否已打开，已停止启动新窗口。");
  }
  if (!response.ok) throw new Error("LocalOps 桌宠状态接口不可用，已停止启动新窗口。");
  let payload;
  try {
    payload = (await response.json())?.presence;
  } catch {
    throw new Error("LocalOps 桌宠状态响应无法识别，已停止启动新窗口。");
  }
  if (typeof payload?.present !== "boolean" || !Number.isInteger(payload?.activeCount) || payload.activeCount < 0 || payload.present !== (payload.activeCount > 0)) {
    throw new Error("LocalOps 桌宠状态响应无法识别，已停止启动新窗口。");
  }
  return payload;
}

export function assertNoActivePet(presence) {
  if (presence.present) {
    throw new Error(`LocalOps 桌宠已经打开（${presence.activeCount} 个活动窗口），请使用现有窗口。`);
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export async function waitForPetPresence(url, {
  fetchImpl = fetch,
  delayImpl = delay,
  attempts = 40,
  intervalMs = 250
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await petSessionPresent(url, fetchImpl)) return true;
    await delayImpl(intervalMs);
  }
  throw new Error("桌宠窗口没有在 10 秒内完成加载，已停止本次本地值守。");
}

export async function monitorPetPresence(url, {
  fetchImpl = fetch,
  delayImpl = delay,
  intervalMs = 3_000,
  maxConsecutiveMisses = 3
} = {}) {
  let misses = 0;
  while (misses < maxConsecutiveMisses) {
    await delayImpl(intervalMs);
    misses = await petSessionPresent(url, fetchImpl) ? 0 : misses + 1;
  }
}

export function launcherSummary(result) {
  const visibleUrl = new URL(result.url);
  visibleUrl.searchParams.delete("session");
  visibleUrl.searchParams.delete("runtime");
  const lines = [
    `${result.checkOnly ? "LocalOps pet check passed" : "LocalOps pet ready"}: ${visibleUrl.toString()}`,
    `Browser: ${result.browserPath}`,
    result.apiAlreadyRunning
      ? "API: recognizable loopback LocalOps is already running"
      : result.checkOnly
        ? "API: not running; launcher would start a task-owned process"
        : "API: task-owned process started"
  ];
  if (result.browser?.pid) lines.push(`Pet window PID: ${result.browser.pid}`);
  if (result.apiProcess?.pid) lines.push(`Owned API PID: ${result.apiProcess.pid}`);
  if (result.activePresence?.present) lines.push(`Pet: already open (${result.activePresence.activeCount} active)`);
  return lines;
}

async function waitUntilReady(url, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await localOpsReady(url)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("LocalOps API did not become ready within 7.5 seconds.");
}

export async function waitForOwnedApiReady(url, child, readyImpl = waitUntilReady) {
  if (!child?.once || !child?.removeListener) throw new Error("LocalOps owned API process could not be observed.");
  return new Promise((resolveReady, rejectReady) => {
    const cleanup = () => {
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
    };
    const fail = (message) => {
      cleanup();
      rejectReady(new Error(message));
    };
    const onError = () => fail("LocalOps owned API process could not start.");
    const onExit = () => fail("LocalOps owned API process stopped before the pet opened.");
    child.once("error", onError);
    child.once("exit", onExit);
    Promise.resolve()
      .then(() => readyImpl(url))
      .then(() => {
        if (child.exitCode != null || child.killed) {
          fail("LocalOps owned API process stopped before the pet opened.");
          return;
        }
        cleanup();
        resolveReady();
      }, (error) => {
        cleanup();
        rejectReady(error);
      });
  });
}

function stopOwnedProcess(child) {
  if (!child || child.exitCode != null || child.killed) return;
  child.kill();
}

export async function launchPet({ checkOnly = false, sessionId = randomUUID() } = {}) {
  assertSupportedNodeVersion();
  if (process.platform !== "win32") throw new Error("The desktop pet launcher currently supports Windows only.");
  const browserPath = await firstExistingPath(edgeCandidates());
  if (!browserPath) throw new Error("Microsoft Edge was not found. Set LOCALOPS_BROWSER_PATH to an approved Chromium executable.");
  await assertPetBuildAvailable();

  const baseUrl = petUrl();
  const alreadyRunning = await localOpsReady(baseUrl);
  if (checkOnly) {
    const activePresence = alreadyRunning ? await activePetPresence(baseUrl) : { present: false, activeCount: 0 };
    return { browserPath, url: baseUrl, apiAlreadyRunning: alreadyRunning, activePresence, checkOnly: true };
  }

  const url = petUrl({ sessionId, runtimeMode: petRuntimeModeForApi(alreadyRunning) });

  let apiProcess = null;
  if (!alreadyRunning) {
    apiProcess = spawn(process.execPath, [join(root, "server", "index.mjs")], {
      cwd: root,
      env: { ...process.env, LOCALOPS_API_HOST: defaultHost, LOCALOPS_API_PORT: String(defaultPort) },
      stdio: "inherit",
      windowsHide: true
    });
    try {
      await waitForOwnedApiReady(url, apiProcess);
    } catch (error) {
      stopOwnedProcess(apiProcess);
      throw error;
    }
  }

  let activePresence;
  try {
    activePresence = await activePetPresence(url);
  } catch (error) {
    stopOwnedProcess(apiProcess);
    throw error;
  }
  try {
    assertNoActivePet(activePresence);
  } catch (error) {
    stopOwnedProcess(apiProcess);
    throw error;
  }

  const profileDir = join(root, "data", "pet-browser-profile");
  const browser = spawn(browserPath, [
    `--app=${url}`,
    "--window-size=380,760",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--disable-extensions",
    "--disable-sync"
  ], { stdio: "ignore", windowsHide: false });

  const cleanupApi = () => stopOwnedProcess(apiProcess);
  const stopLauncherChildren = () => {
    stopOwnedProcess(browser);
    cleanupApi();
  };
  process.once("SIGINT", stopLauncherChildren);
  process.once("SIGTERM", stopLauncherChildren);
  const browserStartError = new Promise((_, reject) => {
    browser.once("error", reject);
  });
  try {
    await Promise.race([waitForPetPresence(url), browserStartError]);
  } catch (error) {
    stopLauncherChildren();
    throw error;
  }
  const sessionMonitor = monitorPetPresence(url).finally(cleanupApi);
  return { browserPath, url, sessionId, apiAlreadyRunning: alreadyRunning, browser, apiProcess, sessionMonitor };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  launchPet({ checkOnly: process.argv.includes("--check") })
    .then((result) => {
      launcherSummary(result).forEach((line) => console.log(line));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
