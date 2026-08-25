import assert from "node:assert/strict";
import test from "node:test";
import { actionCapability, createNginxReloadApproval, executeNginxReload, nginxActionCommand, publicApproval, validateNginxApproval } from "./safe-actions.mjs";

const host = { id: "host-1", name: "Test", environment: "test", role: "web", sshAlias: "safe-host", updatedAt: "2026-08-26T00:00:00.000Z" };

test("action capability requires both independent runtime gates", () => {
  assert.equal(actionCapability({ actionsEnabled: false, sshEnabled: true }).enabled, false);
  assert.equal(actionCapability({ actionsEnabled: true, sshEnabled: false }).enabled, false);
  assert.equal(actionCapability({ actionsEnabled: true, sshEnabled: true }).enabled, true);
});

test("approval is short-lived, exact, and contains only fixed commands", () => {
  const approval = createNginxReloadApproval({ host, approvalId: "approval-1", evidenceCheckId: 9, now: 1_000, ttlMs: 120_000 });
  const visible = publicApproval(approval);
  assert.equal(visible.expiresAt, new Date(121_000).toISOString());
  assert.equal(visible.evidenceCheckId, 9);
  assert.deepEqual(visible.commands, [
    "ssh safe-host 'sudo -n nginx -t'",
    "ssh safe-host 'sudo -n systemctl reload nginx'"
  ]);
  assert.equal(nginxActionCommand("reload"), "sudo -n systemctl reload nginx");
  assert.notEqual(
    approval.planDigest,
    createNginxReloadApproval({ host: { ...host, name: "Changed" }, approvalId: "approval-1", evidenceCheckId: 9, now: 1_000, ttlMs: 120_000 }).planDigest
  );
  assert.notEqual(
    approval.planDigest,
    createNginxReloadApproval({ host: { ...host, updatedAt: "2026-08-26T00:01:00.000Z" }, approvalId: "approval-1", evidenceCheckId: 9, now: 1_000, ttlMs: 120_000 }).planDigest
  );
  assert.throws(() => nginxActionCommand("restart"), /not allowlisted/);
  assert.equal(validateNginxApproval(approval, { phrase: visible.requiredPhrase, planDigest: visible.planDigest }, 2_000), approval);
  assert.throws(() => validateNginxApproval(approval, { phrase: "确认", planDigest: visible.planDigest }, 2_000), /完整确认短语/);
  assert.throws(() => validateNginxApproval(approval, { phrase: visible.requiredPhrase, planDigest: "changed" }, 2_000), /预案已经变化/);
  assert.throws(() => validateNginxApproval(approval, { phrase: visible.requiredPhrase, planDigest: visible.planDigest }, 121_000), /超过两分钟/);
});

test("failed nginx preflight stops before reload", async () => {
  const calls = [];
  const result = await executeNginxReload({
    approval: {},
    runCommand: async (step) => { calls.push(step); throw new Error("password=secret bad config"); },
    verify: async () => { throw new Error("must not verify"); }
  });
  assert.deepEqual(calls, ["preflight"]);
  assert.equal(result.failureCode, "NGINX_PREFLIGHT_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /password=secret/);
});

test("successful reload always runs a post-action check", async () => {
  const calls = [];
  const result = await executeNginxReload({
    approval: {},
    runCommand: async (step) => { calls.push(step); return `${step} ok`; },
    verify: async () => { calls.push("verify"); return { status: "healthy", checkId: 42, summary: "healthy" }; }
  });
  assert.deepEqual(calls, ["preflight", "reload", "verify"]);
  assert.equal(result.status, "succeeded");
  assert.equal(result.verificationCheckId, 42);
});

test("uncertain verification never retries the mutation or claims success", async () => {
  const calls = [];
  const result = await executeNginxReload({
    approval: {},
    runCommand: async (step) => { calls.push(step); return "ok"; },
    verify: async () => ({ status: "warning", checkId: 7, summary: "still warning" })
  });
  assert.deepEqual(calls, ["preflight", "reload"]);
  assert.equal(result.status, "verification-warning");
  assert.match(result.summary, /不要重复执行/);
});
