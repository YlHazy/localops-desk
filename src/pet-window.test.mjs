import assert from "node:assert/strict";
import test from "node:test";
import { readTopmostPreference, requestPetWindowTopmost, writeTopmostPreference } from "./pet-window.mjs";

const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";

test("topmost preference defaults on for the launcher and can be explicitly disabled", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readTopmostPreference(storage), true);
  assert.equal(writeTopmostPreference(storage, false), true);
  assert.equal(readTopmostPreference(storage), false);
});

test("topmost request is session-scoped and confirms the requested result", async () => {
  let request;
  const windowState = await requestPetWindowTopmost(sessionId, true, async (path, init) => {
    request = { path, init };
    return { ok: true, async json() { return { window: { supported: true, topmost: true, message: "ok" } }; } };
  });
  assert.equal(request.path, `/api/pet-window/${sessionId}`);
  assert.deepEqual(JSON.parse(request.init.body), { topmost: true });
  assert.equal(windowState.topmost, true);
  await assert.rejects(() => requestPetWindowTopmost("not-a-session", true), /Windows 启动器/);
  await assert.rejects(() => requestPetWindowTopmost(sessionId, false, async () => ({
    ok: true,
    async json() { return { window: { supported: true, topmost: true } }; }
  })), /没有确认/);
});
