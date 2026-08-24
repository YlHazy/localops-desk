import assert from "node:assert/strict";
import test from "node:test";
import { manualFocusSelection, prioritizeHosts, retainFocusSelection, selectFocusHost } from "./host-priority.mjs";

const apiOrder = [
  { id: "unknown", name: "C", status: "unknown" },
  { id: "healthy", name: "A", status: "healthy" },
  { id: "warning-b", name: "B", status: "warning" },
  { id: "critical", name: "D", status: "critical" },
  { id: "warning-a", name: "A", status: "warning" }
];

test("priority order is severity-first, stable by name, and never mutates API order", () => {
  const prioritized = prioritizeHosts(apiOrder);
  assert.deepEqual(prioritized.map((host) => host.id), ["critical", "warning-a", "warning-b", "unknown", "healthy"]);
  assert.deepEqual(apiOrder.map((host) => host.id), ["unknown", "healthy", "warning-b", "critical", "warning-a"]);
});

test("automatic focus follows priority while deliberate focus remains explicit", () => {
  const prioritized = prioritizeHosts(apiOrder);
  assert.equal(selectFocusHost(prioritized, null).id, "critical");
  assert.equal(manualFocusSelection(prioritized, "critical"), null);
  assert.equal(manualFocusSelection(prioritized, "healthy"), "healthy");
  assert.equal(selectFocusHost(prioritized, "healthy").id, "healthy");
  assert.equal(selectFocusHost(prioritized, "missing").id, "critical");
});

test("refresh retains only a manual selection that still exists", () => {
  assert.equal(retainFocusSelection(apiOrder, "healthy"), "healthy");
  assert.equal(retainFocusSelection(apiOrder, "removed"), null);
  assert.equal(retainFocusSelection([], "healthy"), null);
});
