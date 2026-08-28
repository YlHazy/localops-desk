import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bearerHeaders, ensureLocalApiToken, requestHasValidToken } from "./local-auth.mjs";

test("local API token is stable per data directory and only accepted as bearer", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "localops-auth-test-"));
  try {
    const first = ensureLocalApiToken(dataDir, {});
    assert.equal(ensureLocalApiToken(dataDir, {}), first);
    assert.equal(readFileSync(join(dataDir, "local-api-token"), "utf8").trim(), first);
    assert.equal(requestHasValidToken({ headers: bearerHeaders(first) }, first), true);
    assert.equal(requestHasValidToken({ headers: { authorization: "Bearer wrong" } }, first), false);
    assert.equal(requestHasValidToken({ headers: { "x-localops-token": first } }, first), false);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("desktop, launcher, and development data directories share one current-user token", () => {
  const userRoot = mkdtempSync(join(tmpdir(), "localops-auth-user-"));
  const firstData = mkdtempSync(join(tmpdir(), "localops-auth-a-"));
  const secondData = mkdtempSync(join(tmpdir(), "localops-auth-b-"));
  try {
    const environment = { LOCALAPPDATA: userRoot };
    assert.equal(ensureLocalApiToken(firstData, environment), ensureLocalApiToken(secondData, environment));
    assert.match(readFileSync(join(userRoot, "LocalOps Guardian", "local-api-token"), "utf8"), /^[A-Za-z0-9_-]{43}\n$/);
  } finally {
    rmSync(userRoot, { recursive: true, force: true });
    rmSync(firstData, { recursive: true, force: true });
    rmSync(secondData, { recursive: true, force: true });
  }
});
