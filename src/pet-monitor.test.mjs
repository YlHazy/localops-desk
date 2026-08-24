import assert from "node:assert/strict";
import test from "node:test";
import { trustworthyDashboard } from "./desk-sync.mjs";
import { selectFocusHost } from "./host-priority.mjs";
import { monitorSignal, petSnapshotTrust, worseningNotice } from "./pet-monitor.mjs";

function dashboard(counts) {
  return { counts };
}

test("monitor signal keeps notification content aggregate-only", () => {
  const signal = monitorSignal(dashboard({ healthy: 1, warning: 2, critical: 0, unknown: 1 }));
  assert.deepEqual(signal, { level: "warning", score: 2, critical: 0, warning: 2, unknown: 1 });
  const notice = worseningNotice(monitorSignal(dashboard({ healthy: 4, warning: 0, critical: 0, unknown: 0 })), signal);
  assert.match(notice.body, /故障 0 · 关注 2 · 待确认 1/);
  assert.doesNotMatch(notice.body, /host|ssh|https?:\/\//i);
});

test("first observation and stable degraded state do not notify", () => {
  const warning = monitorSignal(dashboard({ healthy: 1, warning: 1, critical: 0, unknown: 0 }));
  assert.equal(worseningNotice(null, warning), null);
  assert.equal(worseningNotice(warning, warning), null);
});

test("worse severity and a larger affected count notify once", () => {
  const healthy = monitorSignal(dashboard({ healthy: 2, warning: 0, critical: 0, unknown: 0 }));
  const warningOne = monitorSignal(dashboard({ healthy: 1, warning: 1, critical: 0, unknown: 0 }));
  const warningTwo = monitorSignal(dashboard({ healthy: 0, warning: 2, critical: 0, unknown: 0 }));
  assert.match(worseningNotice(healthy, warningOne).title, /需要关注/);
  assert.ok(worseningNotice(warningOne, warningTwo));
  assert.equal(worseningNotice(warningTwo, warningOne), null);
});

test("local API loss is urgent but repeated loss and recovery stay quiet", () => {
  const healthy = monitorSignal(dashboard({ healthy: 1, warning: 0, critical: 0, unknown: 0 }));
  const offline = monitorSignal(dashboard({}), true);
  assert.match(worseningNotice(healthy, offline).title, /值守中断/);
  assert.equal(worseningNotice(offline, offline), null);
  assert.equal(worseningNotice(offline, healthy), null);
});

test("manual host focus never changes the priority ordering", () => {
  const hosts = [
    { id: "critical-host", status: "critical" },
    { id: "healthy-host", status: "healthy" }
  ];
  assert.equal(selectFocusHost(hosts, null).id, "critical-host");
  assert.equal(selectFocusHost(hosts, "healthy-host").id, "healthy-host");
  assert.equal(selectFocusHost(hosts, "missing-host").id, "critical-host");
  assert.equal(hosts[0].id, "critical-host");
  assert.equal(selectFocusHost([], "healthy-host"), null);
});

test("pet snapshot trust never presents retained or expired evidence as current", () => {
  assert.deepEqual(petSnapshotTrust(true, false, true), {
    state: "offline",
    label: "本地同步中断 · 仅显示上次证据",
    current: false
  });
  assert.equal(petSnapshotTrust(true, false, false).state, "offline");
  assert.equal(petSnapshotTrust(false, false, false).state, "unknown");
  assert.deepEqual(petSnapshotTrust(false, true, true), {
    state: "stale",
    label: "存在待更新对象 · 不能视为全部当前",
    current: false
  });
  assert.deepEqual(petSnapshotTrust(false, false, true), {
    state: "current",
    label: "证据仍在有效期内",
    current: true
  });
});

test("evidence expiry reaches aggregate pet notifications exactly once", () => {
  const observedAt = Date.parse("2026-08-24T00:00:00.000Z");
  const dashboard = {
    observedAt: new Date(observedAt).toISOString(),
    staleAfterMs: 60_000,
    counts: { healthy: 2, warning: 0, critical: 0, unknown: 0 },
    hosts: [
      { id: "one", name: "private-one", status: "healthy" },
      { id: "two", name: "private-two", status: "healthy" }
    ]
  };
  const fresh = monitorSignal(trustworthyDashboard(dashboard, observedAt + 60_000));
  const expired = monitorSignal(trustworthyDashboard(dashboard, observedAt + 60_001));
  const notice = worseningNotice(fresh, expired);
  assert.equal(expired.level, "unknown");
  assert.match(notice.body, /待确认 2/);
  assert.doesNotMatch(notice.body, /private-one|private-two/);
  assert.equal(worseningNotice(expired, expired), null);
});

test("pet priority and counts downgrade only the host whose evidence expired", () => {
  const dashboard = {
    observedAt: "2026-08-24T00:10:00.000Z",
    staleAfterMs: 5 * 60_000,
    counts: { healthy: 1, warning: 0, critical: 1, unknown: 0 },
    hosts: [
      { id: "old-critical", name: "private-old", status: "critical", lastCheckedAt: "2026-08-24T00:00:00.000Z" },
      { id: "fresh-healthy", name: "private-fresh", status: "healthy", lastCheckedAt: "2026-08-24T00:10:00.000Z" }
    ]
  };
  const view = trustworthyDashboard(dashboard, Date.parse("2026-08-24T00:11:00.000Z"));
  assert.deepEqual(view.counts, { healthy: 1, warning: 0, critical: 0, unknown: 1 });
  assert.equal(monitorSignal(view).level, "unknown");
  assert.equal(view.hosts.find((host) => host.id === "old-critical").status, "unknown");
  assert.equal(view.hosts.find((host) => host.id === "fresh-healthy").status, "healthy");
});
