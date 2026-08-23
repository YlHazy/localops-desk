import assert from "node:assert/strict";
import test from "node:test";
import { monitorSignal, selectFocusHost, worseningNotice } from "./pet-monitor.mjs";

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
