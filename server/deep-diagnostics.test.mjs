import assert from "node:assert/strict";
import test from "node:test";
import { collectDeepEvidence, deepSshCommand, parseContainerInventory, redactDiagnosticText } from "./deep-diagnostics.mjs";

test("deep diagnostic commands reject arbitrary container input", () => {
  assert.equal(deepSshCommand("logs", "api-1"), "docker logs --since 15m --tail 80 api-1");
  assert.throws(() => deepSshCommand("logs", "api; rm -rf /"), /not safe/);
  assert.throws(() => deepSshCommand("shell"), /not allowlisted/);
});

test("deep diagnostic text removes common secret forms and stays bounded", () => {
  const source = 'password=hunter2 Authorization: abc token="xyz" postgres://user:pass@db/app Bearer token.value eyJabcdefgh.abcdefgh.abcdefgh';
  const redacted = redactDiagnosticText(source, 500);
  assert.doesNotMatch(redacted, /hunter2|\babc\b|\bxyz\b|user:pass|token\.value|eyJabcdefgh/);
  assert.match(redacted, /<redacted>/);
  assert.ok(redacted.length <= 500);
});

test("container inventory accepts only safe names", () => {
  assert.deepEqual(parseContainerInventory("api-1\tUp 2 hours\nworker;bad\tExited (1)\ndb_1\tRestarting"), [
    { name: "api-1", status: "Up 2 hours" },
    { name: "db_1", status: "Restarting" }
  ]);
});

test("offline resource diagnosis adds truthful zero-network evidence", async () => {
  let executions = 0;
  const result = await collectDeepEvidence({
    host: { id: "localops-sample-warning", sshAlias: "", tags: ["localops:offline-demo"] },
    layer: "resources",
    mode: "safe-simulated",
    execute: async () => { executions += 1; }
  });
  assert.equal(executions, 0);
  assert.equal(result.state, "complete");
  assert.equal(result.source, "offline-practice");
  assert.equal(result.findings[0].value, "76%");
  assert.match(result.safetyBoundary, /没有联网/);
});

test("resource diagnosis runs only its bounded plan and redacts returned summary", async () => {
  const calls = [];
  const outputs = {
    disk: "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda 100 76 24 76% /",
    inode: "Filesystem Inodes IUsed IFree IUse% Mounted on\n/dev/sda 100 22 78 22% /",
    dockerUsage: "TYPE TOTAL ACTIVE SIZE RECLAIMABLE\nImages 4 2 3GB 1GB token=secret-value"
  };
  const result = await collectDeepEvidence({
    host: { id: "real", sshAlias: "prod", tags: [] }, layer: "resources", mode: "ssh-enabled",
    execute: async ({ key }) => { calls.push(key); return outputs[key]; }
  });
  assert.deepEqual(calls.sort(), ["disk", "dockerUsage", "inode"]);
  assert.equal(result.findings[0].status, "warning");
  assert.equal(result.findings[1].status, "healthy");
  assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  assert.equal(result.coverage.failed, 0);
});

test("runtime diagnosis reads bounded logs only for a validated suspect container", async () => {
  const calls = [];
  const result = await collectDeepEvidence({
    host: { id: "real", sshAlias: "prod", tags: [] }, layer: "runtime", mode: "ssh-enabled",
    execute: async ({ key, containerName }) => {
      calls.push([key, containerName]);
      if (key === "containers") return "api-1\tRestarting (1) 2 seconds ago\ndb-1\tUp 2 hours";
      if (key === "failedUnits") return "";
      if (key === "listening") return "State Recv-Q Send-Q Local Address:Port\nLISTEN 0 10 0.0.0.0:3000";
      if (key === "logs") return "Authorization: top-secret\nError: dependency unavailable";
      throw new Error("unexpected key");
    }
  });
  assert.deepEqual(calls.at(-1), ["logs", "api-1"]);
  assert.equal(result.findings[0].status, "warning");
  assert.doesNotMatch(result.excerpt.join("\n"), /top-secret/);
  assert.match(result.excerpt.join("\n"), /dependency unavailable/);
});
