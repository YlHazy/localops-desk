import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultHost = "127.0.0.1";
const defaultPort = 4317;

export function petUrl({ host = defaultHost, port = defaultPort } = {}) {
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Pet window only supports a loopback LocalOps host.");
  }
  const authority = host === "::1" ? `[${host}]:${port}` : `${host}:${port}`;
  return `http://${authority}/?mode=pet`;
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

export function launcherSummary(result) {
  const lines = [
    `${result.checkOnly ? "LocalOps pet check passed" : "LocalOps pet ready"}: ${result.url}`,
    `Browser: ${result.browserPath}`,
    result.apiAlreadyRunning
      ? "API: recognizable loopback LocalOps is already running"
      : result.checkOnly
        ? "API: not running; launcher would start a task-owned process"
        : "API: task-owned process started"
  ];
  if (result.browser?.pid) lines.push(`Pet window PID: ${result.browser.pid}`);
  if (result.apiProcess?.pid) lines.push(`Owned API PID: ${result.apiProcess.pid}`);
  return lines;
}

async function waitUntilReady(url, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await localOpsReady(url)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("LocalOps API did not become ready within 7.5 seconds.");
}

function stopOwnedProcess(child) {
  if (!child || child.exitCode != null || child.killed) return;
  child.kill();
}

export async function launchPet({ checkOnly = false } = {}) {
  if (process.platform !== "win32") throw new Error("The desktop pet launcher currently supports Windows only.");
  const browserPath = await firstExistingPath(edgeCandidates());
  if (!browserPath) throw new Error("Microsoft Edge was not found. Set LOCALOPS_BROWSER_PATH to an approved Chromium executable.");
  await access(join(root, "dist", "index.html"));

  const url = petUrl();
  const alreadyRunning = await localOpsReady(url);
  if (checkOnly) return { browserPath, url, apiAlreadyRunning: alreadyRunning, checkOnly: true };

  let apiProcess = null;
  if (!alreadyRunning) {
    apiProcess = spawn(process.execPath, [join(root, "server", "index.mjs")], {
      cwd: root,
      env: { ...process.env, LOCALOPS_API_HOST: defaultHost, LOCALOPS_API_PORT: String(defaultPort) },
      stdio: "inherit",
      windowsHide: true
    });
    try {
      await waitUntilReady(url);
    } catch (error) {
      stopOwnedProcess(apiProcess);
      throw error;
    }
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
  browser.once("error", (error) => {
    cleanupApi();
    console.error(`Unable to open the pet window: ${error.message}`);
    process.exitCode = 1;
  });
  browser.once("exit", () => cleanupApi());
  return { browserPath, url, apiAlreadyRunning: alreadyRunning, browser, apiProcess };
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
