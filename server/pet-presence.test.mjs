import assert from "node:assert/strict";
import test from "node:test";
import { petPresenceTtlMs } from "../src/pet-presence.mjs";
import { createPetPresenceTracker } from "./pet-presence.mjs";

const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";

test("pet presence is memory-only, expiring, and explicitly closeable", () => {
  let time = Date.parse("2026-08-24T00:00:00.000Z");
  const tracker = createPetPresenceTracker({ now: () => time });
  assert.deepEqual(tracker.read(sessionId), { present: false, lastSeenAt: null });
  assert.equal(tracker.update(sessionId, "open").present, true);
  time += petPresenceTtlMs + 1;
  assert.deepEqual(tracker.read(sessionId), { present: false, lastSeenAt: null });
  tracker.update(sessionId, "open");
  assert.deepEqual(tracker.update(sessionId, "closing"), { present: false, lastSeenAt: null });
});

test("pet presence rejects invalid session and state values", () => {
  const tracker = createPetPresenceTracker();
  assert.throws(() => tracker.read("not-a-session"), { code: "INVALID_PET_SESSION" });
  assert.throws(() => tracker.update(sessionId, "sleeping"), { code: "INVALID_PET_PRESENCE" });
});
