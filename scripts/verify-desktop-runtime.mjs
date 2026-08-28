import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const executable = process.env.LOCALOPS_DESKTOP_EXECUTABLE
  ? resolve(process.env.LOCALOPS_DESKTOP_EXECUTABLE)
  : join(root, "release", `LocalOps-Guardian-${packageMetadata.version}-x64.exe`);
const reportPath = join(root, "release", "desktop-runtime-verification.json");
const profilePath = join(root, "release", "desktop-runtime-profile");

await access(executable);
await rm(reportPath, { force: true });
await rm(profilePath, { recursive: true, force: true });

const smokePort = await new Promise((resolvePort, rejectPort) => {
  const reservation = createServer();
  reservation.unref();
  reservation.once("error", rejectPort);
  reservation.listen(0, "127.0.0.1", () => {
    const address = reservation.address();
    const port = typeof address === "object" && address ? address.port : null;
    reservation.close((error) => error ? rejectPort(error) : resolvePort(port));
  });
});
if (!Number.isInteger(smokePort) || smokePort <= 0) throw new Error("Could not reserve an isolated desktop smoke port.");
const smokeOrigin = `http://127.0.0.1:${smokePort}`;

const child = spawn(executable, ["--smoke-check"], {
  cwd: root,
  env: { ...process.env, LOCALOPS_SMOKE_REPORT: reportPath, LOCALOPS_SMOKE_PROFILE: profilePath, LOCALOPS_SMOKE_API_PORT: String(smokePort) },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
});
let childStdout = "";
let childStderr = "";
child.stdout?.on("data", (chunk) => { childStdout += chunk.toString(); });
child.stderr?.on("data", (chunk) => { childStderr += chunk.toString(); });
const childExit = new Promise((resolveExit) => child.once("exit", (code, signal) => resolveExit({ code, signal })));

let report = null;
for (let attempt = 0; attempt < 240; attempt += 1) {
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
    break;
  } catch {
    if (child.exitCode != null) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
}

if (!report?.ok || !Number.isInteger(report.pid) || report.pid <= 0 || report.apiOwnership !== "owned" || report.apiOrigin !== smokeOrigin || report.runtime !== "desktop" || report.title !== "LocalOps Guardian" || report.hasApp !== true || report.bridgeState?.desktop !== true || report.bridgeState?.closeBehavior !== "tray" || report.bridgeState?.topmost !== true || report.hasNotificationBridge !== true || report.rejectsUnsafeNotification !== true || report.hasTray !== true || report.hiddenToTray !== true || report.closeNoticePersisted !== true) {
  const exit = child.exitCode == null ? null : await childExit;
  throw new Error(`Packaged desktop smoke check did not confirm the renderer: ${JSON.stringify({ report, exit, stdout: childStdout.slice(-2000), stderr: childStderr.slice(-4000) })}`);
}

let processExited = false;
// Portable Electron builds may need extra time to release the extracted runtime
// after the renderer has already produced a successful smoke report.
for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    process.kill(report.pid, 0);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  } catch {
    processExited = true;
    break;
  }
}
if (!processExited) throw new Error(`Packaged desktop smoke process ${report.pid} did not exit.`);

try {
  const response = await fetch(`${smokeOrigin}/api/agent/manifest`, { signal: AbortSignal.timeout(1_000) });
  if (response.ok) throw new Error("Packaged desktop smoke check left the owned API running.");
} catch (error) {
  if (error instanceof Error && error.message.includes("left the owned API")) throw error;
}

await rm(profilePath, { recursive: true, force: true });

console.log(`Packaged desktop verified: ${JSON.stringify(report)}`);
