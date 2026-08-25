import assert from "node:assert/strict";
import test from "node:test";
import { operationUiState } from "./operation-state.mjs";

test("non-check work never masquerades as an active server check", () => {
  for (const operation of ["diagnosis", "scheduler", "retention", "action", "host-save", "host-delete"]) {
    const state = operationUiState(operation);
    assert.equal(state.busy, true);
    assert.equal(state.checking, false);
  }
});

test("each operation exposes one truthful purpose flag", () => {
  const expected = {
    check: "checking",
    diagnosis: "diagnosing",
    scheduler: "savingScheduler",
    retention: "retaining",
    action: "preparingAction",
    "host-save": "savingHost",
    "host-delete": "deletingHost"
  };
  for (const [operation, activeKey] of Object.entries(expected)) {
    const state = operationUiState(operation);
    const purposeFlags = Object.entries(state).filter(([key, value]) => key !== "busy" && value).map(([key]) => key);
    assert.deepEqual(purposeFlags, [activeKey]);
  }
});

test("idle is not busy and unknown operation names fail closed", () => {
  assert.deepEqual(operationUiState(null), {
    busy: false,
    checking: false,
    diagnosing: false,
    savingScheduler: false,
    retaining: false,
    preparingAction: false,
    savingHost: false,
    deletingHost: false
  });
  assert.throws(() => operationUiState("surprise"), /Unsupported pending operation/);
});
