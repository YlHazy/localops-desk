import assert from "node:assert/strict";
import test from "node:test";
import { codexPanelSize, desktopAlertCopy, desktopCodexPanelUrl, desktopCodexPetUrl, desktopDeskUrl, desktopLoopbackOrigin, desktopPetUrl, firstTrayNotice, navigationAction, safeCodexPetBounds, safeWindowBounds, steppedCodexPetBounds } from "./contract.mjs";

const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";

test("desktop URLs stay on the fixed loopback origin and identify the tray runtime", () => {
  assert.equal(desktopPetUrl(sessionId), `http://127.0.0.1:4317/?mode=pet&session=${sessionId}&runtime=desktop`);
  assert.equal(desktopDeskUrl("/#tab=checks"), "http://127.0.0.1:4317/#tab=checks");
  assert.throws(() => desktopDeskUrl("https://example.com"), /loopback/);
  assert.equal(desktopLoopbackOrigin(54321), "http://127.0.0.1:54321");
  assert.equal(desktopPetUrl(sessionId, 54321), `http://127.0.0.1:54321/?mode=pet&session=${sessionId}&runtime=desktop`);
  assert.equal(desktopCodexPetUrl(54321), "http://127.0.0.1:54321/?mode=codex-pet&runtime=desktop");
  assert.equal(desktopCodexPanelUrl(54321), "http://127.0.0.1:54321/?mode=codex-panel&runtime=desktop");
  assert.equal(desktopDeskUrl("/#tab=checks", 54321), "http://127.0.0.1:54321/#tab=checks");
  assert.throws(() => desktopLoopbackOrigin(0), /between 1 and 65535/);
});

test("Codex companion keeps a fixed compact silhouette while preserving its position", () => {
  assert.deepEqual(safeCodexPetBounds({ x: 12.2, y: 24.8, width: 168, height: 200 }), { x: 12, y: 25, width: 168, height: 200 });
  assert.deepEqual(safeCodexPetBounds({ x: 12.2, y: 24.8, width: 900, height: 900 }), { width: 208, height: 248 });
  assert.deepEqual(safeCodexPetBounds(null), { width: 208, height: 248 });
  assert.deepEqual(steppedCodexPetBounds({ x: 100, y: 100, width: 208, height: 248 }, -1), { x: 140, y: 148, width: 168, height: 200 });
  assert.deepEqual(steppedCodexPetBounds({ x: 100, y: 100, width: 208, height: 248 }, 1), { x: 48, y: 38, width: 260, height: 310 });
  const before = { x: 100, y: 100, width: 208, height: 248 };
  const after = steppedCodexPetBounds(before, -1);
  assert.equal(after.x + after.width, before.x + before.width);
  assert.equal(after.y + after.height, before.y + before.height);
  assert.throws(() => steppedCodexPetBounds({ width: 208, height: 248 }, 0), /direction/);
});

test("Codex panel expands only for readable command detail", () => {
  assert.deepEqual(codexPanelSize(false), { width: 388, height: 276 });
  assert.deepEqual(codexPanelSize(true), { width: 568, height: 468 });
  assert.throws(() => codexPanelSize("yes"), /boolean/);
});

test("persisted pet bounds stay within the compact companion window", () => {
  assert.deepEqual(safeWindowBounds({ x: 12.2, y: 24.8, width: 360, height: 420 }), { x: 12, y: 25, width: 360, height: 420 });
  assert.deepEqual(safeWindowBounds({ x: 0, y: 0, width: 380, height: 760 }), { width: 360, height: 420 });
  assert.deepEqual(safeWindowBounds(null), { width: 360, height: 420 });
});

test("navigation allowlist separates LocalOps desk links, Codex discussion, and everything else", () => {
  assert.equal(navigationAction("http://127.0.0.1:4317/#tab=hosts"), "desk");
  assert.equal(navigationAction("http://127.0.0.1:54321/#tab=hosts", 54321), "desk");
  assert.equal(navigationAction("http://127.0.0.1:4317/#tab=hosts", 54321), "deny");
  assert.equal(navigationAction("https://chatgpt.com/?q=localops"), "external");
  assert.equal(navigationAction("https://example.com"), "deny");
  assert.equal(navigationAction("file:///C:/secret.txt"), "deny");
  assert.equal(navigationAction("http://localhost:4317/"), "deny");
});

test("first close copy explains tray persistence and the explicit exit boundary", () => {
  assert.match(firstTrayNotice.content, /系统托盘/);
  assert.match(firstTrayNotice.content, /明确退出/);
});

test("desktop tray alerts accept only aggregate counts and fixed copy", () => {
  assert.deepEqual(desktopAlertCopy({ kind: "ready" }), {
    title: "LocalOps 提醒已就位",
    content: "以后只在状态变差时提醒；不会显示服务器名称、地址、命令或原始证据。",
    iconType: "info"
  });
  assert.deepEqual(desktopAlertCopy({ kind: "status", critical: 1, warning: 2, unknown: 3 }), {
    title: "LocalOps 发现故障",
    content: "故障 1 · 关注 2 · 待确认 3。打开小哨查看证据。",
    iconType: "error"
  });
  assert.match(desktopAlertCopy({ kind: "test" }).content, /不包含服务器身份或检查证据/);
  assert.throws(() => desktopAlertCopy({ kind: "status", critical: 1, warning: 2, unknown: 3, host: "secret" }), /allow-listed/);
  assert.throws(() => desktopAlertCopy({ kind: "status", critical: -1, warning: 0, unknown: 0 }), /between 0 and 999/);
  assert.throws(() => desktopAlertCopy({ kind: "custom", title: "arbitrary" }), /allow-listed/);
});
