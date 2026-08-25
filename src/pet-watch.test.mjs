import assert from "node:assert/strict";
import test from "node:test";
import { monitorSignal } from "./pet-monitor.mjs";
import { notificationDecision, petNotificationPreferenceKey, petQuietDurationMs, readNotificationPreference, readQuietUntil, watchModeCopy, writeNotificationPreference, writeQuietUntil } from "./pet-watch.mjs";

const signal = (counts) => monitorSignal({ counts });
const healthy = signal({ healthy: 2 });
const critical = signal({ critical: 1 });

test("quiet watch records deterioration without sending a system notification", () => {
  const now = 10_000;
  assert.equal(notificationDecision(healthy, critical, { enabled: true, permission: "granted", quietUntil: now + petQuietDurationMs, now }).outcome, "suppressed");
  assert.equal(notificationDecision(healthy, critical, { enabled: true, permission: "granted", quietUntil: now, now }).outcome, "sent");
  assert.equal(notificationDecision(healthy, critical, { enabled: false, permission: "granted", now }).outcome, "none");
});

test("watch mode copy explains active, quiet, blocked, and unsupported states", () => {
  assert.equal(watchModeCopy({ supported: true, blocked: false, enabled: true, quietUntil: 70_000, now: 10_000 }).state, "quiet");
  assert.match(watchModeCopy({ supported: true, blocked: false, enabled: true, quietUntil: 70_000, now: 10_000 }).detail, /1 分钟后/);
  assert.deepEqual(watchModeCopy({ supported: true, blocked: true, enabled: false, permissionSurface: "windows" }), {
    label: "系统提醒已阻止",
    detail: "在 Windows 通知设置中重新允许",
    state: "blocked"
  });
  assert.match(watchModeCopy({ supported: true, blocked: true, enabled: false }).detail, /浏览器站点权限/);
  assert.match(watchModeCopy({ supported: true, blocked: false, enabled: true, permissionSurface: "windows" }).detail, /Windows 托盘提醒/);
  assert.equal(watchModeCopy({ supported: false, blocked: false, enabled: false }).state, "unsupported");
});

test("quiet preference is bounded to a future timestamp and fails closed", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  assert.equal(writeQuietUntil(storage, 50_000), true);
  assert.equal(readQuietUntil(storage, 10_000), 50_000);
  assert.equal(readQuietUntil(storage, 50_001), 0);
  assert.equal(writeQuietUntil(storage, 0), true);
  assert.equal(values.size, 0);
  assert.equal(writeQuietUntil({ setItem() { throw new Error("blocked"); }, removeItem() {} }, 50_000), false);
});

test("notification preference is shared without broadening stored data", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readNotificationPreference(storage), false);
  assert.equal(writeNotificationPreference(storage, true), true);
  assert.equal(values.get(petNotificationPreferenceKey), "1");
  assert.equal(readNotificationPreference(storage), true);
  assert.equal(writeNotificationPreference(storage, false), true);
  assert.equal(values.get(petNotificationPreferenceKey), "0");
  assert.equal(writeNotificationPreference({ setItem() { throw new Error("blocked"); } }, true), false);
  assert.equal(readNotificationPreference({ getItem() { throw new Error("blocked"); } }), false);
});
