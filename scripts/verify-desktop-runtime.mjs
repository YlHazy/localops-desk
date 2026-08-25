import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const executable = join(root, "release", `LocalOps-Guardian-${packageMetadata.version}-x64.exe`);
const reportPath = join(root, "release", "desktop-runtime-verification.json");

await access(executable);
await rm(reportPath, { force: true });

const child = spawn(executable, ["--smoke-check"], {
  cwd: root,
  env: { ...process.env, LOCALOPS_SMOKE_REPORT: reportPath },
  windowsHide: true,
  stdio: "ignore"
});
child.unref();

let report = null;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
    break;
  } catch {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
}

if (!report?.ok || report.apiOwnership !== "owned" || report.runtime !== "desktop" || report.title !== "LocalOps Guardian" || report.hasApp !== true || report.hasTray !== true) {
  throw new Error(`Packaged desktop smoke check did not confirm the renderer: ${JSON.stringify(report)}`);
}

await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
try {
  const response = await fetch("http://127.0.0.1:4317/api/agent/manifest", { signal: AbortSignal.timeout(1_000) });
  if (response.ok) throw new Error("Packaged desktop smoke check left the owned API running.");
} catch (error) {
  if (error instanceof Error && error.message.includes("left the owned API")) throw error;
}

console.log(`Packaged desktop verified: ${JSON.stringify(report)}`);
