import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { collectHost, collectedSummary, readOnlySshCommands, readOnlySshPreview, sshOnlyCollectedSummary } from "./runtime.mjs";

async function closeTestServer(server) {
  if (!server.listening) return;
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections?.();
  await closed;
}

test("copyable SSH preview is generated from the executor's exact read-only allowlist", () => {
  const preview = readOnlySshPreview("safe-alias");
  assert.deepEqual(preview, [
    "ssh safe-alias uptime",
    "ssh safe-alias free -m",
    "ssh safe-alias df -P /",
    "ssh safe-alias \"docker ps --format '{{.Names}} {{.Status}}'\"",
    "ssh safe-alias \"sudo -n docker ps --format '{{.Names}} {{.Status}}'\""
  ]);
  assert.equal(preview.length, Object.keys(readOnlySshCommands).length);
  assert.equal(preview.filter((command) => /sudo/i.test(command)).length, 1);
  assert.match(preview.at(-1), /sudo -n docker ps/);
  assert.doesNotMatch(preview.join("\n"), /compose|restart|systemctl/i);
  assert.throws(() => readOnlySshPreview("-oProxyCommand=bad"), /SSH alias/);
});

test("collected summary prioritizes entry failure over secondary resource pressure", () => {
  assert.match(collectedSummary("critical", "critical", "warning"), /HTTP 健康检查明确失败/);
  assert.doesNotMatch(collectedSummary("critical", "critical", "warning"), /HTTP 可用/);
  assert.match(collectedSummary("warning", "healthy", "warning"), /资源使用率接近关注阈值/);
});

test("SSH-only summaries distinguish missing HTTP evidence from SSH or resource failure", () => {
  assert.match(sshOnlyCollectedSummary("ok", "healthy"), /网页\/API 保持未知/);
  assert.match(sshOnlyCollectedSummary("ok", "warning"), /资源使用率接近关注阈值/);
  assert.match(sshOnlyCollectedSummary("Permission denied", "unknown"), /只读 SSH 检查失败/);
});

test("offline demo profile bypasses HTTP and SSH collectors even when targets are injected", async (t) => {
  let requestCount = 0;
  const probe = createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(200).end("unexpected");
  });
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  t.after(() => closeTestServer(probe));

  const result = await collectHost({
    id: "localops-sample-healthy",
    tags: ["localops:offline-demo"],
    healthUrl: `http://127.0.0.1:${probe.address().port}/must-not-run`,
    sshAlias: "-must-not-run",
  }, { mode: "ssh-enabled", httpTimeoutMs: 100 });

  assert.equal(result.status, "healthy");
  assert.equal(result.httpStatus, "simulated 200 ready");
  assert.equal(requestCount, 0);
});

test("SSH-enabled mode keeps an HTTP-only host healthy without attempting an empty SSH alias", async (t) => {
  const probe = createServer((_req, res) => res.writeHead(200).end("ok"));
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  t.after(() => closeTestServer(probe));

  const result = await collectHost({
    id: "http-only",
    tags: [],
    healthUrl: `http://127.0.0.1:${probe.address().port}/health`,
    sshAlias: ""
  }, { mode: "ssh-enabled", httpTimeoutMs: 500 });

  assert.equal(result.status, "healthy");
  assert.equal(result.sshStatus, "not configured");
  assert.match(result.summary, /HTTP 健康检查正常/);
  assert.match(result.summary, /未采集 SSH 与资源证据/);
  assert.doesNotMatch(result.summary, /模拟资源检查正常/);
  assert.match(result.evidence.join("\n"), /没有执行 SSH 命令/);
});

test("safe mode reports a saved SSH alias as disabled instead of usable evidence", async () => {
  const result = await collectHost({
    id: "ssh-disabled",
    tags: [],
    healthUrl: "",
    sshAlias: "saved-alias"
  }, { mode: "safe-simulated", httpTimeoutMs: 50 });

  assert.equal(result.status, "unknown");
  assert.equal(result.sshStatus, "simulated disabled");
  assert.match(result.summary, /已保存但当前未启用/);
});
