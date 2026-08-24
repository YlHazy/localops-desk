import assert from "node:assert/strict";
import test from "node:test";
import { petDeskIntent, petDeskPath } from "./pet-navigation.mjs";

test("pet desk links keep local focus in a fragment and preserve the requested desk tab", () => {
  const path = petDeskPath({ hostId: "host-123", tab: "hosts", source: "pet-alert", revision: 42 });
  assert.match(path, /^\/#/);
  assert.doesNotMatch(path.split("#")[0], /host-123/);
  assert.match(path, /revision=42/);
  assert.deepEqual(petDeskIntent(new URL(path, "http://127.0.0.1:4317").hash), {
    hostId: "host-123",
    tab: "hosts",
    source: "pet-alert"
  });
});

test("pet desk intent rejects unsafe or unknown navigation values", () => {
  assert.throws(() => petDeskPath({ hostId: "../secret" }), /Invalid LocalOps focus host/);
  assert.deepEqual(petDeskIntent("#focusHost=..%2Fsecret&tab=actions&source=outside"), {
    hostId: null,
    tab: null,
    source: null
  });
});
