import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const serverScript = fileURLToPath(new URL("./index.mjs", import.meta.url));
const testApiToken = "localops_test_token_abcdefghijklmnopqrstuvwxyz0123456789";
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => nativeFetch(input, {
  ...init,
  headers: { authorization: `Bearer ${testApiToken}`, ...(init.headers || {}) }
});

async function closeTestServer(server) {
  if (!server.listening) return;
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections?.();
  await closed;
}

function requestWithHost(url, hostHeader) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "GET",
      headers: { host: hostHeader, authorization: `Bearer ${testApiToken}` }
    }, async (res) => {
      let body = "";
      for await (const chunk of res) body += chunk;
      resolve({ status: res.statusCode, body: JSON.parse(body) });
    });
    req.on("error", reject);
    req.end();
  });
}

async function startApi(t, extraEnv = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "localops-api-test-"));
  const child = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      LOCALOPS_API_HOST: "127.0.0.1",
      LOCALOPS_API_PORT: "0",
      LOCALOPS_DATA_DIR: dataDir,
      LOCALOPS_SEED_DEMO: "0",
      LOCALOPS_API_TOKEN: testApiToken,
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout, terminal: false });
  t.after(async () => {
    if (child.exitCode == null && child.signalCode == null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    lines.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const port = await new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      lines.off("line", onLine);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const settle = (callback, value) => {
      cleanup();
      callback(value);
    };
    const onLine = (line) => {
      const match = line.match(/127\.0\.0\.1:(\d+)/);
      if (match) settle(resolve, Number(match[1]));
    };
    const onExit = (code) => settle(reject, new Error(`LocalOps API exited with ${code}: ${stderr}`));
    const onError = (error) => settle(reject, new Error(`Failed to start LocalOps API: ${error.message}`));
    const timeout = setTimeout(() => {
      settle(reject, new Error(`Timed out starting LocalOps API: ${stderr}`));
    }, 15_000);

    lines.on("line", onLine);
    child.once("exit", onExit);
    child.once("error", onError);
  });
  return { child, base: `http://127.0.0.1:${port}`, dataDir };
}

test("API rejects originless local callers without the installation token", async (t) => {
  const api = await startApi(t);
  const response = await nativeFetch(`${api.base}/api/status`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "AUTH_REQUIRED");
});

test("API rejects oversized request bodies by bytes and remains responsive", async (t) => {
  const api = await startApi(t);
  const oversized = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "界".repeat(22_000) })
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, "REQUEST_BODY_TOO_LARGE");
  assert.equal((await fetch(`${api.base}/api/status`)).status, 200);
});

test("empty status exposes explicit freshness metadata", async (t) => {
  const api = await startApi(t);
  const response = await fetch(`${api.base}/api/status`);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.observedAt, null);
  assert.equal(status.staleAfterMs, 30 * 60 * 1000);
  assert.deepEqual(status.counts, { healthy: 0, warning: 0, critical: 0, unknown: 0 });
  assert.deepEqual(status.hosts, []);
});

test("offline demo hosts require explicit opt-in and contain no connection targets", async (t) => {
  const api = await startApi(t, { LOCALOPS_SEED_DEMO: "1" });
  const response = await fetch(`${api.base}/api/status`);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.deepEqual(status.hosts.map((host) => host.id).sort(), ["localops-sample-healthy", "localops-sample-unknown", "localops-sample-warning"]);
  assert.ok(status.hosts.every((host) => host.status === "unknown"));
  assert.equal(status.practiceMode, true);
  assert.ok(status.hosts.every((host) => host.isOfflineDemo === true));

  const configured = await fetch(`${api.base}/api/hosts`);
  const hosts = (await configured.json()).hosts;
  assert.ok(hosts.every((host) => host.healthUrl === "" && host.sshAlias === "" && host.composeProject === ""));

  const checked = await fetch(`${api.base}/api/checks/light/localops-sample-healthy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(checked.status, 200);
  const result = await checked.json();
  assert.equal(result.hostResults[0].status, "healthy");
  assert.match(result.hostResults[0].evidence.join(" "), /没有发起 HTTP、SSH/);

  const report = await fetch(`${api.base}/api/reports/current`).then((item) => item.json());
  assert.match(report.report, /CPU 未采集, 负载 未采集, 内存 未采集, 磁盘 未采集/);
  assert.doesNotMatch(report.report, /N\/A%/);
});

test("check receipt explains host evidence without exposing connection configuration", async (t) => {
  const api = await startApi(t, { LOCALOPS_SEED_DEMO: "1" });
  const checked = await fetch(`${api.base}/api/checks/light/localops-sample-warning`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(checked.status, 200);
  const checkId = (await checked.json()).id;

  const database = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  database.prepare("UPDATE host_checks SET evidenceJson = ?, sanitizedError = ?, httpStatus = ? WHERE runId = ?").run(
    JSON.stringify(["legacy https://example.test/health?token=legacy-secret-marker", "Bearer legacy-bearer-marker"]),
    "password=legacy-password-marker",
    "500 https://user:legacy-url-password@example.test",
    checkId
  );
  database.prepare("UPDATE hosts SET name = ? WHERE id = ?").run("后来修改的当前名称", "localops-sample-warning");
  database.close();

  const response = await fetch(`${api.base}/api/checks/${checkId}`);
  assert.equal(response.status, 200);
  const detail = (await response.json()).detail;
  assert.equal(detail.check.id, checkId);
  assert.equal(detail.check.trigger, "manual-host");
  assert.equal(detail.hosts.length, 1);
  assert.equal(detail.hosts[0].hostName, "示例 · 需要关注");
  assert.equal(detail.hosts[0].identitySnapshot, true);
  assert.equal(detail.hosts[0].status, "warning");
  assert.equal(detail.hosts[0].diskPercent, 76);
  const detailText = JSON.stringify(detail);
  assert.doesNotMatch(detailText, /healthUrl|sshAlias|composeProject|tags/);
  assert.doesNotMatch(detailText, /legacy-secret-marker|legacy-bearer-marker|legacy-password-marker|legacy-url-password/);
  assert.match(detailText, /<redacted>/);

  const missing = await fetch(`${api.base}/api/checks/999999`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, "CHECK_RUN_NOT_FOUND");
});

test("offline practice is explicit, exclusive, network-free, and fully removable", async (t) => {
  const api = await startApi(t);
  const install = await fetch(`${api.base}/api/practice/offline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(install.status, 201);
  assert.deepEqual((await install.json()).practice, {
    installed: true,
    practiceMode: true,
    hostsAdded: 3,
    totalHosts: 3,
    networkTargets: 0
  });

  const status = await fetch(`${api.base}/api/status`).then((item) => item.json());
  assert.equal(status.practiceMode, true);
  assert.ok(status.hosts.every((host) => host.isOfflineDemo));
  assert.ok(status.hosts.every((host) => host.healthUrl === "" && host.sshAlias === "" && host.composeProject === ""));

  const practicePlanResponse = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: status.hosts[0].id, actionKey: "inspect-service" })
  });
  assert.equal(practicePlanResponse.status, 200);
  const practicePlan = await practicePlanResponse.json();
  assert.equal(practicePlan.executionState, "blocked-template");
  assert.equal(practicePlan.copyAllowed, false);
  assert.ok(practicePlan.commands.every((command) => command.includes("<ssh-alias>")));
  assert.ok(practicePlan.commands.every((command) => !command.includes(status.hosts[0].name)));

  const blockedCreate = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "real-server" })
  });
  assert.equal(blockedCreate.status, 409);
  assert.equal((await blockedCreate.json()).error, "OFFLINE_PRACTICE_CONFLICT");

  const blockedDelete = await fetch(`${api.base}/api/hosts/localops-sample-healthy`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(blockedDelete.status, 409);

  const checked = await fetch(`${api.base}/api/checks/light`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(checked.status, 200);
  assert.equal((await checked.json()).hostResults.length, 3);

  const schedulerEnabled = await fetch(`${api.base}/api/scheduler`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, lightIntervalMinutes: 60, retentionDays: 7 })
  });
  assert.equal(schedulerEnabled.status, 200);

  const remove = await fetch(`${api.base}/api/practice/offline`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(remove.status, 200);
  assert.deepEqual((await remove.json()).practice, {
    removed: true,
    practiceMode: false,
    hostsRemoved: 3,
    checksRemoved: 3,
    runsRemoved: 1,
    schedulerDisabled: true
  });
  const clearedStatus = await fetch(`${api.base}/api/status`).then((item) => item.json());
  assert.equal(clearedStatus.practiceMode, false);
  assert.deepEqual(clearedStatus.hosts, []);
  assert.deepEqual((await fetch(`${api.base}/api/checks`).then((item) => item.json())).checks, []);
  assert.equal((await fetch(`${api.base}/api/scheduler`).then((item) => item.json())).scheduler.enabled, false);

  const manifest = await fetch(`${api.base}/api/agent/manifest`).then((item) => item.text());
  assert.doesNotMatch(manifest, /practice\/offline/);
});

test("automatic diagnosis rechecks one offline host and returns an identity-free cause", async (t) => {
  const api = await startApi(t);
  await fetch(`${api.base}/api/practice/offline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });

  const response = await fetch(`${api.base}/api/diagnostics/localops-sample-warning`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "warning");
  assert.equal(result.diagnosis.layer, "resources");
  assert.equal(result.diagnosis.confidence, "high");
  assert.match(result.diagnosis.headline, /磁盘 76%/);
  assert.equal(result.deepEvidence.state, "complete");
  assert.equal(result.deepEvidence.source, "offline-practice");
  assert.equal(result.deepEvidence.findings[0].value, "76%");
  assert.match(result.deepEvidence.safetyBoundary, /没有联网/);
  assert.match(result.safetyBoundary, /没有执行重启、清理、部署或配置变更/);
  assert.ok(result.checkId > 0);
  assert.ok(result.runId);
  const resultText = JSON.stringify(result);
  assert.doesNotMatch(resultText, /hostId|hostName|sshAlias|healthUrl|composeProject|evidence/);

  const checks = await fetch(`${api.base}/api/checks`).then((item) => item.json());
  assert.equal(checks.checks[0].trigger, "manual-diagnosis");
  assert.equal(checks.checks[0].hostScope, "localops-sample-warning");

  const compatibility = await fetch(`${api.base}/api/checks/deep`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: "localops-sample-warning" })
  }).then((item) => item.json());
  assert.equal(compatibility.compatibilityEndpoint, true);
  assert.equal(compatibility.deepEvidence.source, "offline-practice");

  const manifest = await fetch(`${api.base}/api/agent/manifest`).then((item) => item.text());
  assert.doesNotMatch(manifest, /\/api\/diagnostics/);
});

test("batch checks collect only usable hosts and report skipped coverage honestly", async (t) => {
  const api = await startApi(t);
  const create = async (body) => fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then((response) => response.json());
  const usable = (await create({ name: "usable", healthUrl: `${api.base}/api/status`, sshAlias: "" })).host;
  const blocked = (await create({ name: "blocked", healthUrl: "", sshAlias: "" })).host;

  const response = await fetch(`${api.base}/api/checks/light`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual({
    total: result.coverage.total,
    collectible: result.coverage.collectible,
    blocked: result.coverage.blocked
  }, { total: 2, collectible: 1, blocked: 1 });
  assert.deepEqual(result.hostResults.map((item) => item.hostId), [usable.id]);
  assert.match(result.summary, /1 台已取得证据，1 台.*跳过/);
  assert.doesNotMatch(result.summary, /healthy|warning|critical|unknown/);

  const status = await fetch(`${api.base}/api/status`).then((item) => item.json());
  assert.ok(status.hosts.find((item) => item.id === usable.id).lastCheckedAt);
  assert.equal(status.hosts.find((item) => item.id === blocked.id).lastCheckedAt, null);

  const blockedCheck = await fetch(`${api.base}/api/checks/light/${encodeURIComponent(blocked.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(blockedCheck.status, 409);
  const blockedBody = await blockedCheck.json();
  assert.equal(blockedBody.error, "NO_COLLECTIBLE_EVIDENCE");
  assert.equal(blockedBody.coverage.collectible, 0);
});

test("check run and host evidence are committed atomically", async (t) => {
  const api = await startApi(t);
  await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "atomic-host", healthUrl: `${api.base}/api/status`, sshAlias: "" })
  });
  const database = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  database.exec(`
    CREATE TRIGGER reject_test_host_check
    BEFORE INSERT ON host_checks
    BEGIN
      SELECT RAISE(FAIL, 'forced atomicity test failure');
    END;
  `);
  database.close();

  const failed = await fetch(`${api.base}/api/checks/light`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(failed.status, 500);
  const checks = (await fetch(`${api.base}/api/checks`).then((item) => item.json())).checks;
  const status = await fetch(`${api.base}/api/status`).then((item) => item.json());
  assert.deepEqual(checks, []);
  assert.equal(status.hosts[0].lastCheckedAt, null);
  assert.equal(status.hosts[0].status, "unknown");
});

test("scheduler refuses zero coverage and stops when the last source is removed", async (t) => {
  const api = await startApi(t);
  const initial = (await fetch(`${api.base}/api/scheduler`).then((item) => item.json())).scheduler;
  assert.equal(initial.lastOutcome, "never");
  assert.equal(initial.lastEventAt, null);
  assert.equal(initial.lastMessage, "尚未运行自动巡检。");
  const disabledRun = await fetch(`${api.base}/api/scheduler/run-now`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(disabledRun.status, 409);
  assert.equal((await disabledRun.json()).error, "SCHEDULER_NOT_ENABLED");
  const created = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "scheduler-host", healthUrl: "", sshAlias: "" })
  }).then((response) => response.json());

  const refused = await fetch(`${api.base}/api/scheduler`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, lightIntervalMinutes: 60, retentionDays: 7 })
  });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error, "NO_COLLECTIBLE_EVIDENCE");
  assert.equal((await fetch(`${api.base}/api/scheduler`).then((item) => item.json())).scheduler.enabled, false);

  const updated = await fetch(`${api.base}/api/hosts/${encodeURIComponent(created.host.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...created.host, healthUrl: `${api.base}/api/status` })
  }).then((response) => response.json());
  const enabled = await fetch(`${api.base}/api/scheduler`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, lightIntervalMinutes: 60, retentionDays: 7 })
  });
  assert.equal(enabled.status, 200);
  const enabledState = (await enabled.json()).scheduler;
  assert.equal(enabledState.enabled, true);
  assert.equal(enabledState.coverage.collectible, 1);

  const runNow = await fetch(`${api.base}/api/scheduler/run-now`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(runNow.status, 200);
  const verified = (await runNow.json()).scheduler;
  assert.equal(verified.lastOutcome, "succeeded");
  assert.equal(verified.lastCheckedHosts, 1);
  assert.equal(verified.lastSkippedHosts, 0);
  assert.ok(verified.lastEventAt);
  assert.ok(verified.lastRunAt);
  assert.ok(verified.nextRunAt);
  assert.match(verified.lastMessage, /1 台已取得证据/);
  assert.equal(verified.lastErrorCode, null);
  const schedulerCheck = (await fetch(`${api.base}/api/checks`).then((item) => item.json())).checks[0];
  assert.equal(schedulerCheck.trigger, "scheduled-manual");

  await fetch(`${api.base}/api/hosts/${encodeURIComponent(created.host.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...updated.host, healthUrl: "" })
  });
  const stopped = (await fetch(`${api.base}/api/scheduler`).then((item) => item.json())).scheduler;
  assert.equal(stopped.enabled, false);
  assert.equal(stopped.nextRunAt, null);
  assert.equal(stopped.coverage.collectible, 0);
  assert.equal(stopped.lastOutcome, "stopped-no-evidence");
  assert.equal(stopped.lastErrorCode, "NO_COLLECTIBLE_EVIDENCE");
  assert.match(stopped.lastMessage, /自动巡检已停止/);
});

test("offline practice never overwrites or deletes colliding user data", async (t) => {
  const api = await startApi(t);
  const created = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "localops-sample-healthy", name: "user-owned-collision", tags: [] })
  });
  assert.equal(created.status, 201);

  for (const method of ["POST", "DELETE"]) {
    const response = await fetch(`${api.base}/api/practice/offline`, {
      method,
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "OFFLINE_PRACTICE_CONFLICT");
  }
  const hosts = (await fetch(`${api.base}/api/hosts`).then((item) => item.json())).hosts;
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].name, "user-owned-collision");
});

test("legacy offline demo rows remain recognizable and removable", async (t) => {
  const api = await startApi(t);
  const legacyRows = [
    ["localops-sample-healthy", "Sample healthy service"],
    ["localops-sample-warning", "Sample attention service"],
    ["localops-sample-unknown", "Sample unobserved service"]
  ];
  for (const [id, name] of legacyRows) {
    const created = await fetch(`${api.base}/api/hosts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        name,
        environment: "sample",
        role: "offline UI demonstration",
        sshAlias: "",
        healthUrl: "",
        composeProject: "",
        tags: ["localops:offline-demo"]
      })
    });
    assert.equal(created.status, 201);
  }
  assert.equal((await fetch(`${api.base}/api/status`).then((item) => item.json())).practiceMode, true);
  const removed = await fetch(`${api.base}/api/practice/offline`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).practice.hostsRemoved, 3);
  assert.deepEqual((await fetch(`${api.base}/api/hosts`).then((item) => item.json())).hosts, []);
});

test("legacy seed flag no longer inserts project-specific hosts", async (t) => {
  const api = await startApi(t, { LOCALOPS_SEED_HOSTS: "1" });
  const response = await fetch(`${api.base}/api/status`);
  const status = await response.json();
  assert.deepEqual(status.hosts, []);
});

test("host input rejects unsafe SSH aliases with a 400 response", async (t) => {
  const api = await startApi(t);
  const missingName = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "   " })
  });
  assert.equal(missingName.status, 400);
  const missingNameBody = await missingName.json();
  assert.equal(missingNameBody.error, "INVALID_INPUT");
  assert.match(missingNameBody.message, /名称不能为空/);

  const response = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "unsafe", sshAlias: "-oProxyCommand=calc", healthUrl: "" })
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "INVALID_INPUT");
});

test("health URLs reject embedded secrets and agent payloads omit connection configuration", async (t) => {
  const api = await startApi(t);
  for (const healthUrl of [
    "http://user:password@127.0.0.1/health",
    "http://127.0.0.1/health?token=secret-marker",
    "http://127.0.0.1/health#secret-marker"
  ]) {
    const rejected = await fetch(`${api.base}/api/hosts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `rejected-${Math.random()}`, sshAlias: "safe-alias", healthUrl })
    });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error, "INVALID_INPUT");
  }

  const secretMarkers = {
    sshAlias: "private-alias-marker",
    healthUrl: `${api.base}/api/agent/manifest`,
    composeProject: "private-compose-marker"
  };
  const created = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "safe-agent-host", environment: "test", role: "fixture", tags: ["private-tag-marker"], ...secretMarkers })
  });
  assert.equal(created.status, 201);
  const host = (await created.json()).host;
  const dashboardStatus = await fetch(`${api.base}/api/status`).then((item) => item.json());
  assert.deepEqual(dashboardStatus.hosts[0].tags, ["private-tag-marker"]);
  const check = await fetch(`${api.base}/api/checks/light/${encodeURIComponent(host.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(check.status, 200);
  const checkText = JSON.stringify(await check.json());
  assert.doesNotMatch(checkText, /private-alias-marker|private-compose-marker|\/api\/agent\/manifest/);

  const database = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  database.prepare("UPDATE host_checks SET evidenceJson = ?").run(JSON.stringify(["legacy evidence https://example.test/?token=legacy-secret-marker"]));
  database.close();

  const agentStatus = await fetch(`${api.base}/api/agent/status`);
  assert.equal(agentStatus.status, 200);
  const agentText = JSON.stringify(await agentStatus.json());
  assert.doesNotMatch(agentText, /private-alias-marker|private-compose-marker|private-tag-marker|legacy-secret-marker|\/api\/agent\/manifest/);
});

test("expired HTTP failures become unknown and are not reported as a current global outage", async (t) => {
  const api = await startApi(t);
  const created = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "stale-host",
      environment: "test",
      role: "fixture",
      sshAlias: "stale-host",
      healthUrl: "http://127.0.0.1:1/health",
      composeProject: "",
      tags: []
    })
  });
  const host = (await created.json()).host;
  const checked = await fetch(`${api.base}/api/checks/light/${encodeURIComponent(host.id)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(checked.status, 200);

  const database = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  database.prepare("UPDATE check_runs SET finishedAt = ?").run("2020-01-01T00:00:00.000Z");
  database.close();

  const response = await fetch(`${api.base}/api/agent/status`);
  const status = await response.json();
  assert.equal(status.hosts[0].status, "unknown");
  assert.doesNotMatch(status.report, /所有具备新鲜证据的 HTTP 健康检查都失败/);
});

test("browser boundary rejects cross-site, rebinding, and simple-content mutation requests", async (t) => {
  const api = await startApi(t);
  const crossSite = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "https://attacker.example" },
    body: JSON.stringify({ name: "cross-site" })
  });
  assert.equal(crossSite.status, 403);
  assert.equal((await crossSite.json()).error, "ORIGIN_NOT_ALLOWED");

  const simpleContent = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ name: "simple-content" })
  });
  assert.equal(simpleContent.status, 415);
  assert.equal((await simpleContent.json()).error, "JSON_REQUIRED");

  const devOrigin = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:5177" },
    body: JSON.stringify({ name: "dev-origin", sshAlias: "dev-origin", healthUrl: "" })
  });
  assert.equal(devOrigin.status, 201);
  assert.equal(devOrigin.headers.get("access-control-allow-origin"), "http://127.0.0.1:5177");

  const rebound = await requestWithHost(`${api.base}/api/status`, "attacker.example:4317");
  assert.equal(rebound.status, 403);
  assert.equal(rebound.body.error, "HOST_NOT_ALLOWED");
});

test("pet presence is session-scoped, validated, and closeable", async (t) => {
  const api = await startApi(t);
  const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";
  const path = `${api.base}/api/pet-presence/${sessionId}`;

  const inactiveWindow = await fetch(`${api.base}/api/pet-window/${sessionId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topmost: true })
  });
  assert.equal(inactiveWindow.status, 409);
  assert.equal((await inactiveWindow.json()).error, "PET_WINDOW_SESSION_INACTIVE");

  assert.deepEqual(await fetch(`${api.base}/api/pet-presence`).then((item) => item.json()), { presence: { present: false, activeCount: 0 } });
  assert.deepEqual(await fetch(path).then((item) => item.json()), { presence: { present: false, lastSeenAt: null } });
  const opened = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: "open" })
  });
  assert.equal(opened.status, 200);
  assert.equal((await opened.json()).presence.present, true);
  const invalidWindow = await fetch(`${api.base}/api/pet-window/${sessionId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topmost: "yes" })
  });
  assert.equal(invalidWindow.status, 400);
  assert.equal((await invalidWindow.json()).error, "INVALID_INPUT");
  assert.equal((await fetch(path).then((item) => item.json())).presence.present, true);
  const aggregateText = await fetch(`${api.base}/api/pet-presence`).then((item) => item.text());
  assert.deepEqual(JSON.parse(aggregateText), { presence: { present: true, activeCount: 1 } });
  assert.doesNotMatch(aggregateText, new RegExp(sessionId));

  const closed = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: "closing" })
  });
  assert.deepEqual(await closed.json(), { presence: { present: false, lastSeenAt: null } });
  assert.deepEqual(await fetch(`${api.base}/api/pet-presence`).then((item) => item.json()), { presence: { present: false, activeCount: 0 } });

  const invalid = await fetch(`${api.base}/api/pet-presence/not-a-uuid`);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "INVALID_PET_SESSION");
});

test("startup API exposes no local paths and requires an explicit boolean mutation", async (t) => {
  const startupDir = mkdtempSync(join(tmpdir(), "localops-startup-api-test-"));
  t.after(() => rmSync(startupDir, { recursive: true, force: true }));
  const api = await startApi(t, { LOCALOPS_STARTUP_DIR: startupDir });

  const inspected = await fetch(`${api.base}/api/startup`);
  assert.equal(inspected.status, 200);
  const inspectedText = await inspected.text();
  assert.doesNotMatch(inspectedText, /localops-startup-api-test|AppData|launch-pet\.mjs/i);
  assert.equal(JSON.parse(inspectedText).startup.enabled, false);

  const invalid = await fetch(`${api.base}/api/startup`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: "yes" })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "INVALID_INPUT");

  const disabled = await fetch(`${api.base}/api/startup`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(disabled.status, 200);
  assert.equal((await disabled.json()).startup.enabled, false);
});

test("dry-run plans enforce read-only copying and placeholder-only mutations", async (t) => {
  const api = await startApi(t);
  const response = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: "missing-host", actionKey: "inspect-service" })
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "HOST_NOT_FOUND");

  const created = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "http-only", sshAlias: "", healthUrl: "" })
  });
  assert.equal(created.status, 201);
  const httpOnlyHost = (await created.json()).host;
  const noAliasPlan = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: httpOnlyHost.id, actionKey: "inspect-service" })
  });
  assert.equal(noAliasPlan.status, 400);
  assert.equal((await noAliasPlan.json()).error, "INVALID_INPUT");

  const noAliasMutationResponse = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: httpOnlyHost.id, actionKey: "reload-nginx" })
  });
  assert.equal(noAliasMutationResponse.status, 200);
  const noAliasMutation = await noAliasMutationResponse.json();
  assert.equal(noAliasMutation.executionState, "blocked-template");
  assert.equal(noAliasMutation.copyAllowed, false);
  assert.ok(noAliasMutation.commands.every((command) => command.includes("<ssh-alias>")));

  const actionableResponse = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "actionable", sshAlias: "safe-readonly", healthUrl: "" })
  });
  assert.equal(actionableResponse.status, 201);
  const actionable = (await actionableResponse.json()).host;

  const inspectResponse = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: actionable.id, actionKey: "inspect-service" })
  });
  assert.equal(inspectResponse.status, 200);
  const inspect = await inspectResponse.json();
  assert.equal(inspect.riskTier, "read-only");
  assert.equal(inspect.executionState, "read-only-ready");
  assert.equal(inspect.copyAllowed, true);
  assert.ok(inspect.commands.every((command) => command.includes("safe-readonly")));

  const reloadResponse = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: actionable.id, actionKey: "reload-nginx" })
  });
  assert.equal(reloadResponse.status, 200);
  const reload = await reloadResponse.json();
  assert.equal(reload.riskTier, "medium");
  assert.equal(reload.executionState, "blocked-template");
  assert.equal(reload.copyAllowed, false);
  assert.equal(reload.blockedReason, "Nginx 重载通道未开启，当前只生成预案。");
  assert.ok(reload.commands.every((command) => command.includes("<ssh-alias>")));
  assert.ok(reload.commands.every((command) => !command.includes("safe-readonly")));

  const restartResponse = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: actionable.id, actionKey: "restart-compose-service" })
  });
  assert.equal(restartResponse.status, 200);
  const restart = await restartResponse.json();
  assert.equal(restart.riskTier, "high");
  assert.equal(restart.copyAllowed, false);
  assert.equal(restart.blockedReason, "当前只生成预案，不执行服务重启。");
  assert.ok(restart.commands.every((command) => command.includes("<ssh-alias>")));
  assert.ok(restart.commands.every((command) => !command.includes("safe-readonly")));
  assert.match(restart.commands.join("\n"), /<app>.*<service>/s);

  const unknown = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: actionable.id, actionKey: "unexpected-action" })
  });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error, "INVALID_INPUT");
});

test("remote actions stay off by default and enabled preparation requires fresh abnormal evidence", async (t) => {
  const disabledApi = await startApi(t);
  const disabledCapability = await fetch(`${disabledApi.base}/api/actions/capability`).then((item) => item.json());
  assert.equal(disabledCapability.capability.enabled, false);
  assert.ok(disabledCapability.capability.blockers.length >= 1);
  const disabledPrepare = await fetch(`${disabledApi.base}/api/actions/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: "missing", actionKey: "reload-nginx" })
  });
  assert.equal(disabledPrepare.status, 409);
  assert.equal((await disabledPrepare.json()).error, "ACTIONS_DISABLED");
  assert.deepEqual((await fetch(`${disabledApi.base}/api/actions/receipts`).then((item) => item.json())).receipts, []);

  const api = await startApi(t, { LOCALOPS_ENABLE_SSH: "1", LOCALOPS_ENABLE_ACTIONS: "1" });
  const created = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "local-action-test", sshAlias: "localhost", healthUrl: `${api.base}/` })
  }).then((item) => item.json());
  const hostId = created.host.id;
  const beforeDiagnosis = await fetch(`${api.base}/api/actions/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId, actionKey: "reload-nginx" })
  });
  assert.equal(beforeDiagnosis.status, 409);
  assert.equal((await beforeDiagnosis.json()).error, "FRESH_DIAGNOSIS_REQUIRED");

  const diagnosis = await fetch(`${api.base}/api/diagnostics/${encodeURIComponent(hostId)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}"
  });
  assert.equal(diagnosis.status, 200);
  assert.ok(["warning", "critical"].includes((await diagnosis.json()).status));

  const unrelatedPrepare = await fetch(`${api.base}/api/actions/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId, actionKey: "reload-nginx" })
  });
  assert.equal(unrelatedPrepare.status, 409);
  assert.equal((await unrelatedPrepare.json()).error, "ACTION_NOT_RECOMMENDED");

  const evidenceDb = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  evidenceDb.prepare(`
    UPDATE host_checks
    SET status = 'critical', httpStatus = 'failed', sshStatus = 'ok', dockerStatus = 'running',
        cpuPercent = 20, memoryPercent = 30, diskPercent = 40
    WHERE id = (SELECT id FROM host_checks WHERE hostId = ? ORDER BY id DESC LIMIT 1)
  `).run(hostId);
  evidenceDb.close();

  const preparedResponse = await fetch(`${api.base}/api/actions/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId, actionKey: "reload-nginx" })
  });
  assert.equal(preparedResponse.status, 201);
  const prepared = await preparedResponse.json();
  assert.equal(prepared.capability.enabled, true);
  assert.equal(prepared.approval.actionKey, "reload-nginx");
  assert.equal(prepared.approval.diagnosisLayer, "entry");
  assert.match(prepared.approval.basis, /网页\/API 入口/);
  assert.match(prepared.approval.commands.join("\n"), /nginx -t.*systemctl reload nginx/s);
  assert.ok(prepared.approval.expiresAt);

  const wrongPhrase = await fetch(`${api.base}/api/actions/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approvalId: prepared.approval.approvalId, planDigest: prepared.approval.planDigest, phrase: "确认" })
  });
  assert.equal(wrongPhrase.status, 400);
  assert.equal((await wrongPhrase.json()).error, "ACTION_PHRASE_MISMATCH");
  assert.deepEqual((await fetch(`${api.base}/api/actions/receipts`).then((item) => item.json())).receipts, []);

  const changedHost = await fetch(`${api.base}/api/hosts/${encodeURIComponent(hostId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...created.host, name: "local-action-test-changed" })
  });
  assert.equal(changedHost.status, 200);
  const changedTarget = await fetch(`${api.base}/api/actions/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      approvalId: prepared.approval.approvalId,
      planDigest: prepared.approval.planDigest,
      phrase: prepared.approval.requiredPhrase
    })
  });
  assert.equal(changedTarget.status, 409);
  assert.equal((await changedTarget.json()).error, "ACTION_TARGET_CHANGED");
  assert.deepEqual((await fetch(`${api.base}/api/actions/receipts`).then((item) => item.json())).receipts, []);

  const manifest = await fetch(`${api.base}/api/agent/manifest`).then((item) => item.text());
  assert.doesNotMatch(manifest, /actions\/(prepare|execute|receipts|capability)/);
});

test("retention removes finished action receipts but preserves active and current receipts", async (t) => {
  const api = await startApi(t);
  const database = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  const insert = database.prepare(`
    INSERT INTO action_runs (id, hostId, hostName, actionKey, status, approvedAt, startedAt, finishedAt, summary, verificationCheckId, failureCode, commandDigest)
    VALUES (?, 'host', 'fixture', 'reload-nginx', ?, ?, ?, ?, 'fixture', NULL, NULL, 'digest')
  `);
  insert.run("old-finished", "succeeded", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z", "2020-01-01T00:01:00.000Z");
  insert.run("old-running", "running", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z", null);
  const recent = new Date().toISOString();
  insert.run("recent-finished", "failed", recent, recent, recent);
  database.close();

  const response = await fetch(`${api.base}/api/maintenance/retention`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vacuum: false })
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).retention;
  assert.equal(result.deletedActionRuns, 1);

  const verify = new DatabaseSync(join(api.dataDir, "localops.sqlite"));
  const ids = verify.prepare("SELECT id FROM action_runs ORDER BY id").all().map((row) => row.id);
  verify.close();
  assert.deepEqual(ids, ["old-running", "recent-finished"]);
});

test("automatic diagnosis keeps one host lock and run identity while its check is active", async (t) => {
  let releaseProbe;
  let markProbeStarted;
  const probeStarted = new Promise((resolve) => { markProbeStarted = resolve; });
  const probeGate = new Promise((resolve) => { releaseProbe = resolve; });
  let probeCount = 0;
  const probe = createServer(async (_req, res) => {
    probeCount += 1;
    markProbeStarted();
    await probeGate;
    res.writeHead(200).end("ready");
  });
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  t.after(() => closeTestServer(probe));

  const api = await startApi(t);
  const createdResponse = await fetch(`${api.base}/api/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "slow-host",
      environment: "test",
      role: "fixture",
      sshAlias: "",
      healthUrl: `http://127.0.0.1:${probe.address().port}/health`,
      composeProject: "",
      tags: []
    })
  });
  const created = await createdResponse.json();
  const path = `${api.base}/api/checks/light/${encodeURIComponent(created.host.id)}`;
  const diagnosisPath = `${api.base}/api/diagnostics/${encodeURIComponent(created.host.id)}`;
  const firstRequest = fetch(diagnosisPath, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await probeStarted;
  const overlapping = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(overlapping.status, 409);
  const conflict = await overlapping.json();
  assert.equal(conflict.error, "CHECK_ALREADY_RUNNING");
  assert.equal(conflict.scope, created.host.id);
  assert.ok(conflict.runId);
  assert.equal(probeCount, 1);

  for (const mutation of [
    { method: "PUT", body: JSON.stringify({ name: "changed-during-check" }) },
    { method: "DELETE", body: "{}" }
  ]) {
    const blocked = await fetch(`${api.base}/api/hosts/${encodeURIComponent(created.host.id)}`, {
      method: mutation.method,
      headers: { "content-type": "application/json" },
      body: mutation.body
    });
    assert.equal(blocked.status, 409);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error, "HOST_CHECK_IN_PROGRESS");
    assert.equal(blockedBody.runId, conflict.runId);
  }
  releaseProbe();
  const completed = await firstRequest;
  assert.equal(completed.status, 200);
  const result = await completed.json();
  assert.equal(result.runId, conflict.runId);
  assert.equal(result.deepEvidence.state, "unavailable");
});

test("API refuses non-loopback binding", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "localops-bind-test-"));
  const child = spawn(process.execPath, [serverScript], {
    env: { ...process.env, LOCALOPS_API_HOST: "0.0.0.0", LOCALOPS_API_PORT: "0", LOCALOPS_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await once(child, "exit");
  rmSync(dataDir, { recursive: true, force: true });
  assert.notEqual(code, 0);
  assert.match(stderr, /must be a loopback address/);
});
