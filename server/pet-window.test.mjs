import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { petWindowCapability, petWindowCommand, petWindowTitle, setPetWindowTopmost } from "./pet-window.mjs";

function childResult({ code = 0, stdout = "", stderr = "" } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (stdout) child.stdout.emit("data", stdout);
    if (stderr) child.stderr.emit("data", stderr);
    child.emit("close", code);
  });
  return child;
}

test("pet topmost command is bounded to the checked-in Windows helper", () => {
  const command = petWindowCommand({ root: "C:\\LocalOps", topmost: true, platform: "win32", systemRoot: "C:\\Windows" });
  assert.equal(command.executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(command.args.slice(0, 6), ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]);
  assert.equal(command.args.at(-4), "-WindowTitle");
  assert.equal(command.args.at(-3), petWindowTitle);
  assert.equal(command.args.at(-2), "-Topmost");
  assert.equal(command.args.at(-1), "true");
  assert.throws(() => petWindowCommand({ root: ".", topmost: "yes", platform: "win32", systemRoot: "C:\\Windows" }), /boolean/);
  assert.equal(petWindowCapability("linux").supported, false);
});

test("pet topmost result is accepted only after the helper confirms exact state", async () => {
  const options = { root: "C:\\LocalOps", topmost: true, platform: "win32", systemRoot: "C:\\Windows" };
  const result = await setPetWindowTopmost(options, () => childResult({ stdout: JSON.stringify({ title: petWindowTitle, topmost: true }) }));
  assert.equal(result.topmost, true);
  await assert.rejects(() => setPetWindowTopmost(options, () => childResult({ code: 2, stderr: "ambiguous" })), /ambiguous/);
  await assert.rejects(() => setPetWindowTopmost(options, () => childResult({ stdout: "not-json" })), /无法识别/);
});
