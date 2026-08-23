import assert from "node:assert/strict";
import test from "node:test";
import { edgeCandidates, firstExistingPath, launcherSummary, localOpsReady, petUrl } from "./launch-pet.mjs";

test("pet URL is fixed to the loopback app surface", () => {
  assert.equal(petUrl(), "http://127.0.0.1:4317/?mode=pet");
  assert.equal(petUrl({ host: "::1", port: 9443 }), "http://[::1]:9443/?mode=pet");
  assert.throws(() => petUrl({ host: "example.com" }), /loopback/);
});

test("explicit browser path is checked before bounded Edge locations", () => {
  const candidates = edgeCandidates({
    LOCALOPS_BROWSER_PATH: "D:\\approved\\browser.exe",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    PROGRAMFILES: "C:\\Program Files",
    LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local"
  });
  assert.equal(candidates[0], "D:\\approved\\browser.exe");
  assert.equal(candidates.length, 4);
  assert.ok(candidates.every((candidate) => candidate.endsWith(".exe")));
});

test("browser discovery returns only an accessible candidate", async () => {
  const visited = [];
  const found = await firstExistingPath(["missing.exe", "allowed.exe"], async (candidate) => {
    visited.push(candidate);
    if (candidate === "missing.exe") throw new Error("missing");
  });
  assert.equal(found, "allowed.exe");
  assert.deepEqual(visited, ["missing.exe", "allowed.exe"]);
});

test("API readiness requires a recognizable LocalOps status payload", async () => {
  const localOpsFetch = async (url) => ({
    ok: true,
    async json() {
      return url.pathname.endsWith("manifest")
        ? { name: "LocalOps Desk Agent API", safety: { arbitraryShell: false } }
        : { counts: {}, hosts: [] };
    }
  });
  assert.equal(await localOpsReady(petUrl(), localOpsFetch), true);
  assert.equal(await localOpsReady(petUrl(), async () => ({
    ok: true,
    async json() { return { status: "foreign-service" }; }
  })), false);
  assert.equal(await localOpsReady(petUrl(), async () => ({ ok: false })), false);
  assert.equal(await localOpsReady(petUrl(), async () => { throw new Error("offline"); }), false);
});

test("check mode reports intent without claiming a process was started", () => {
  const lines = launcherSummary({
    checkOnly: true,
    apiAlreadyRunning: false,
    browserPath: "approved.exe",
    url: petUrl()
  });
  assert.match(lines.join("\n"), /check passed/);
  assert.match(lines.join("\n"), /would start a task-owned process/);
  assert.doesNotMatch(lines.join("\n"), /API: task-owned process started/);
});

test("live launcher summary identifies only the child processes it owns", () => {
  const lines = launcherSummary({
    checkOnly: false,
    apiAlreadyRunning: false,
    browserPath: "approved.exe",
    url: petUrl(),
    browser: { pid: 1201 },
    apiProcess: { pid: 1202 }
  });
  assert.match(lines.join("\n"), /Pet window PID: 1201/);
  assert.match(lines.join("\n"), /Owned API PID: 1202/);
});
