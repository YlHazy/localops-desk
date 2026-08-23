import assert from "node:assert/strict";
import test from "node:test";
import { isPetSessionId, petPresencePath } from "./pet-presence.mjs";

test("pet presence accepts UUID sessions and creates one bounded API path", () => {
  const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";
  assert.equal(isPetSessionId(sessionId), true);
  assert.equal(petPresencePath(sessionId), `/api/pet-presence/${sessionId}`);
  assert.equal(isPetSessionId("../api/status"), false);
  assert.throws(() => petPresencePath("not-a-session"), /Invalid LocalOps pet session/);
});
