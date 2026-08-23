import assert from "node:assert/strict";
import test from "node:test";
import { deskSyncCopy, fetchDeskSnapshot, schedulerDraftAfterSync } from "./desk-sync.mjs";

test("desk sync copy distinguishes initial, running, and paused states", () => {
  assert.match(deskSyncCopy("idle", null, 10_000).label, /首次同步/);
  assert.match(deskSyncCopy("syncing", null, 10_000).detail, /不会触发巡检/);
  assert.match(deskSyncCopy("offline", 5_000, 10_000).detail, /保留上次结果/);
});

test("desk sync age is bounded and human readable", () => {
  assert.equal(deskSyncCopy("current", 10_000, 9_000).label, "自动同步 · 刚刚");
  assert.equal(deskSyncCopy("current", 10_000, 35_000).label, "自动同步 · 25 秒前");
  assert.equal(deskSyncCopy("current", 10_000, 140_000).label, "自动同步 · 2 分钟前");
});

test("desk snapshot uses only the four bounded read endpoints", async () => {
  const calls = [];
  const payloads = {
    "/api/status": { counts: {}, hosts: [] },
    "/api/checks": { checks: [{ id: 1 }] },
    "/api/reports/current": { report: "current" },
    "/api/scheduler": { scheduler: { enabled: true } }
  };
  const snapshot = await fetchDeskSnapshot(async (path) => {
    calls.push(path);
    return payloads[path];
  });
  assert.deepEqual(calls, ["/api/status", "/api/checks", "/api/reports/current", "/api/scheduler"]);
  assert.equal(snapshot.checks[0].id, 1);
  assert.equal(snapshot.report, "current");
  assert.equal(snapshot.scheduler.enabled, true);
});

test("background sync preserves an unsaved scheduler draft", () => {
  const draft = { enabled: false, lightIntervalMinutes: 47, retentionDays: 19 };
  const runtime = { enabled: true, lightIntervalMinutes: 15, retentionDays: 7 };
  assert.equal(schedulerDraftAfterSync(draft, runtime, true), draft);
  assert.deepEqual(schedulerDraftAfterSync(draft, runtime, false), runtime);
});
