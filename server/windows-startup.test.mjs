import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configureStartupEntry, publicStartupState, startupEntryContent, startupEntrySnapshot } from "./windows-startup.mjs";

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "localops-startup-test-"));
  const root = join(base, "repo");
  const startup = join(base, "startup");
  const browser = join(base, "msedge.exe");
  const nodePath = join(base, "node.exe");
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), "ready");
  await writeFile(join(root, "scripts", "launch-pet.mjs"), "// launcher");
  await writeFile(browser, "browser");
  await writeFile(nodePath, "node");
  t.after(() => rm(base, { recursive: true, force: true }));
  return {
    root,
    nodePath,
    environment: { LOCALOPS_STARTUP_DIR: startup, LOCALOPS_BROWSER_PATH: browser },
    platform: "win32"
  };
}

test("startup entry is hidden, bounded, and quotes paths", async (t) => {
  const options = await fixture(t);
  const content = startupEntryContent(options);
  assert.match(content, /managed startup entry v1/);
  assert.match(content, /launch-pet\.mjs/);
  assert.match(content, /, 0, False/);
  assert.doesNotMatch(content, /powershell|cmd\.exe|https?:\/\//i);
});

test("startup install and removal are idempotent in an isolated directory", async (t) => {
  const options = await fixture(t);
  assert.equal((await startupEntrySnapshot(options)).status, "not-installed");
  const installed = await configureStartupEntry(options, true);
  assert.equal(installed.status, "managed");
  assert.equal((await configureStartupEntry(options, true)).status, "managed");
  const encoded = await readFile(installed.entryPath);
  assert.equal(encoded[0], 0xff);
  assert.equal(encoded[1], 0xfe);
  assert.equal((await configureStartupEntry(options, false)).status, "not-installed");
  assert.equal((await configureStartupEntry(options, false)).status, "not-installed");
});

test("unknown same-name startup entry is never overwritten or removed", async (t) => {
  const options = await fixture(t);
  const initial = await startupEntrySnapshot(options);
  await mkdir(initial.directory, { recursive: true });
  await writeFile(initial.entryPath, "foreign startup entry");
  assert.equal((await startupEntrySnapshot(options)).status, "conflict");
  await assert.rejects(() => configureStartupEntry(options, true), { code: "STARTUP_ENTRY_CONFLICT" });
  await assert.rejects(() => configureStartupEntry(options, false), { code: "STARTUP_ENTRY_CONFLICT" });
  assert.equal(await readFile(initial.entryPath, "utf8"), "foreign startup entry");
});

test("missing build or browser blocks installation without writing", async (t) => {
  const options = await fixture(t);
  await rm(join(options.root, "dist"), { recursive: true });
  await rm(options.environment.LOCALOPS_BROWSER_PATH);
  const snapshot = await startupEntrySnapshot(options);
  assert.equal(snapshot.ready, false);
  assert.deepEqual(snapshot.blockers, ["生产构建尚未生成", "未找到 Microsoft Edge"]);
  await assert.rejects(() => configureStartupEntry(options, true), { code: "STARTUP_NOT_READY" });
});

test("missing pet launcher blocks installation with a specific reason", async (t) => {
  const options = await fixture(t);
  await rm(join(options.root, "scripts", "launch-pet.mjs"));
  const snapshot = await startupEntrySnapshot(options);
  assert.equal(snapshot.ready, false);
  assert.deepEqual(snapshot.blockers, ["桌宠启动脚本不可用"]);
  await assert.rejects(() => configureStartupEntry(options, true), { code: "STARTUP_NOT_READY" });
});

test("public startup state excludes local filesystem paths and generated script", async (t) => {
  const options = await fixture(t);
  const publicState = publicStartupState(await startupEntrySnapshot(options));
  const serialized = JSON.stringify(publicState);
  assert.doesNotMatch(serialized, /localops-startup-test|launch-pet|node\.exe|msedge/i);
});
