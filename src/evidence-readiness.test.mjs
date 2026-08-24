import assert from "node:assert/strict";
import test from "node:test";
import { evidenceReadiness } from "./evidence-readiness.mjs";

const dashboard = { mode: "safe-simulated", practiceMode: false };
const host = { healthUrl: "", sshAlias: "", isOfflineDemo: false };

test("readiness is scoped to the selected host instead of another configured host", () => {
  const status = evidenceReadiness({ ...dashboard, hosts: [{ healthUrl: "https://other.example/health" }] }, host);
  assert.equal(status.state, "missing");
  assert.equal(status.canCollect, false);
});

test("readiness distinguishes usable HTTP from a saved but disabled SSH alias", () => {
  const http = evidenceReadiness(dashboard, { ...host, healthUrl: "https://example.test/health" });
  assert.equal(http.state, "http");
  assert.equal(http.canCollect, true);

  const disabled = evidenceReadiness(dashboard, { ...host, sshAlias: "my-server" });
  assert.equal(disabled.state, "ssh-disabled");
  assert.equal(disabled.canCollect, false);
  assert.match(disabled.detail, /当前启动不会使用 SSH/);
});

test("readiness describes combined, SSH-only, and zero-network practice modes", () => {
  const enabled = { ...dashboard, mode: "ssh-enabled" };
  assert.equal(evidenceReadiness(enabled, { ...host, healthUrl: "https://example.test/health", sshAlias: "my-server" }).state, "combined");
  assert.equal(evidenceReadiness(enabled, { ...host, sshAlias: "my-server" }).state, "ssh-only");
  const offline = evidenceReadiness({ ...dashboard, practiceMode: true }, host);
  assert.equal(offline.state, "offline");
  assert.match(offline.detail, /零网络请求/);
});
