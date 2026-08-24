import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activePetPresence, assertNoActivePet, assertPetBuildAvailable, assertSupportedNodeVersion, edgeCandidates, firstExistingPath, launcherSummary, localOpsReady, monitorPetPresence, petSessionPresent, petUrl, waitForPetPresence } from "./launch-pet.mjs";

const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";

test("checked-in Windows entry launches only the bounded pet launcher", async () => {
  const content = await readFile(new URL("../Start%20LocalOps%20Guardian.vbs", import.meta.url), "utf8");
  assert.match(content, /scripts\\launch-pet\.mjs/);
  assert.match(content, /shell\.Run\(.+, 0, True\)/);
  assert.match(content, /MsgBox/);
  assert.doesNotMatch(content, /powershell|npm install|https?:\/\/|schtasks|service/i);
});

test("launcher accepts only the supported Node release range", () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion("22.12.0"));
  assert.doesNotThrow(() => assertSupportedNodeVersion("24.9.1"));
  assert.throws(() => assertSupportedNodeVersion("21.7.0"), /Node\.js 22–24/);
  assert.throws(() => assertSupportedNodeVersion("25.0.0"), /Node\.js 22–24/);
  assert.throws(() => assertSupportedNodeVersion("unknown"), /当前版本为 unknown/);
});

test("missing production build has an actionable first-run error", async () => {
  await assert.rejects(() => assertPetBuildAvailable(async () => { throw new Error("missing"); }), /npm install.+npm run build/);
});

test("pet URL is fixed to the loopback app surface", () => {
  assert.equal(petUrl(), "http://127.0.0.1:4317/?mode=pet");
  assert.equal(petUrl({ host: "::1", port: 9443 }), "http://[::1]:9443/?mode=pet");
  assert.equal(petUrl({ sessionId }), `http://127.0.0.1:4317/?mode=pet&session=${sessionId}`);
  assert.throws(() => petUrl({ host: "example.com" }), /loopback/);
  assert.throws(() => petUrl({ sessionId: "../status" }), /UUID/);
});

test("pet presence waits for a real page heartbeat and tolerates brief misses", async () => {
  const url = petUrl({ sessionId });
  const states = [false, false, true];
  const fetchImpl = async () => ({
    ok: true,
    async json() { return { presence: { present: states.shift() ?? false } }; }
  });
  assert.equal(await petSessionPresent(url, fetchImpl), false);
  await waitForPetPresence(url, { fetchImpl, delayImpl: async () => undefined, attempts: 3 });

  const monitorStates = [true, false, true, false, false, false];
  let reads = 0;
  await monitorPetPresence(url, {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        reads += 1;
        return { presence: { present: monitorStates.shift() ?? false } };
      }
    }),
    delayImpl: async () => undefined,
    maxConsecutiveMisses: 3
  });
  assert.equal(reads, 6);
});

test("active pet discovery accepts only aggregate identity-free state", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() { return { presence: { present: true, activeCount: 1 } }; }
  });
  assert.deepEqual(await activePetPresence(petUrl(), fetchImpl), { present: true, activeCount: 1 });
  await assert.rejects(() => activePetPresence(petUrl(), async () => ({ ok: false })), /状态接口不可用/);
  await assert.rejects(() => activePetPresence(petUrl(), async () => { throw new Error("offline"); }), /无法确认/);
  await assert.rejects(() => activePetPresence(petUrl(), async () => ({
    ok: true,
    async json() { throw new SyntaxError("invalid JSON"); }
  })), /状态响应无法识别/);
  await assert.rejects(() => activePetPresence(petUrl(), async () => ({
    ok: true,
    async json() { return { presence: { present: false, activeCount: 2, sessionId } }; }
  })), /状态响应无法识别/);
  assert.doesNotThrow(() => assertNoActivePet({ present: false, activeCount: 0 }));
  assert.throws(() => assertNoActivePet({ present: true, activeCount: 2 }), /已经打开（2 个活动窗口）/);
});

test("pet presence wait fails closed when the page never loads", async () => {
  await assert.rejects(() => waitForPetPresence(petUrl({ sessionId }), {
    fetchImpl: async () => ({ ok: true, async json() { return { presence: { present: false } }; } }),
    delayImpl: async () => undefined,
    attempts: 2
  }), /没有在 10 秒内完成加载/);
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
    activePresence: { present: false, activeCount: 0 },
    browserPath: "approved.exe",
    url: petUrl()
  });
  assert.match(lines.join("\n"), /check passed/);
  assert.match(lines.join("\n"), /would start a task-owned process/);
  assert.doesNotMatch(lines.join("\n"), /API: task-owned process started/);
  const alreadyOpen = launcherSummary({
    checkOnly: true,
    apiAlreadyRunning: true,
    activePresence: { present: true, activeCount: 1 },
    browserPath: "approved.exe",
    url: petUrl()
  });
  assert.match(alreadyOpen.join("\n"), /Pet: already open \(1 active\)/);
});

test("live launcher summary identifies only the child processes it owns", () => {
  const lines = launcherSummary({
    checkOnly: false,
    apiAlreadyRunning: false,
    browserPath: "approved.exe",
    url: petUrl({ sessionId }),
    browser: { pid: 1201 },
    apiProcess: { pid: 1202 }
  });
  assert.match(lines.join("\n"), /Pet window PID: 1201/);
  assert.match(lines.join("\n"), /Owned API PID: 1202/);
  assert.doesNotMatch(lines.join("\n"), new RegExp(sessionId));
});
