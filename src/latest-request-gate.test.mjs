import assert from "node:assert/strict";
import test from "node:test";
import { createLatestRequestGate, resolveLatestRequest } from "./latest-request-gate.mjs";

test("a later request makes every earlier response stale", () => {
  const gate = createLatestRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isLatest(first), false);
  assert.equal(gate.isLatest(second), true);
});

test("completion order cannot make an older request current again", async () => {
  const gate = createLatestRequestGate();
  const applied = [];
  const finish = async (label, token, delay) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (gate.isLatest(token)) applied.push(label);
  };
  const oldToken = gate.begin();
  const oldRequest = finish("old", oldToken, 15);
  const newToken = gate.begin();
  const newRequest = finish("new", newToken, 1);
  await Promise.all([oldRequest, newRequest]);
  assert.deepEqual(applied, ["new"]);
});

test("invalidation rejects an in-flight response after unmount", () => {
  const gate = createLatestRequestGate();
  const inFlight = gate.begin();
  gate.invalidate();
  assert.equal(gate.isLatest(inFlight), false);
});

test("a stale failure is ignored after a newer request begins", async () => {
  const gate = createLatestRequestGate();
  const staleToken = gate.begin();
  const staleFailure = Promise.reject(new Error("old network failure"));
  gate.begin();
  assert.deepEqual(await resolveLatestRequest(gate, staleToken, staleFailure), { current: false });
});

test("the latest failure still reaches the recovery path", async () => {
  const gate = createLatestRequestGate();
  const currentToken = gate.begin();
  await assert.rejects(
    resolveLatestRequest(gate, currentToken, Promise.reject(new Error("current network failure"))),
    /current network failure/
  );
});
