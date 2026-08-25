import assert from "node:assert/strict";
import test from "node:test";
import { desktopDeskUrl, desktopPetUrl, firstTrayNotice, navigationAction, safeWindowBounds } from "./contract.mjs";

const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";

test("desktop URLs stay on the fixed loopback origin and identify the tray runtime", () => {
  assert.equal(desktopPetUrl(sessionId), `http://127.0.0.1:4317/?mode=pet&session=${sessionId}&runtime=desktop`);
  assert.equal(desktopDeskUrl("/#tab=checks"), "http://127.0.0.1:4317/#tab=checks");
  assert.throws(() => desktopDeskUrl("https://example.com"), /loopback/);
});

test("persisted pet bounds are accepted only inside a bounded desktop size", () => {
  assert.deepEqual(safeWindowBounds({ x: 12.2, y: 24.8, width: 380, height: 760 }), { x: 12, y: 25, width: 380, height: 760 });
  assert.deepEqual(safeWindowBounds({ x: 0, y: 0, width: 10, height: 10 }), { width: 380, height: 760 });
  assert.deepEqual(safeWindowBounds(null), { width: 380, height: 760 });
});

test("navigation allowlist separates LocalOps desk links, Codex discussion, and everything else", () => {
  assert.equal(navigationAction("http://127.0.0.1:4317/#tab=hosts"), "desk");
  assert.equal(navigationAction("https://chatgpt.com/?q=localops"), "external");
  assert.equal(navigationAction("https://example.com"), "deny");
  assert.equal(navigationAction("file:///C:/secret.txt"), "deny");
  assert.equal(navigationAction("http://localhost:4317/"), "deny");
});

test("first close copy explains tray persistence and the explicit exit boundary", () => {
  assert.match(firstTrayNotice.content, /系统托盘/);
  assert.match(firstTrayNotice.content, /明确退出/);
});
