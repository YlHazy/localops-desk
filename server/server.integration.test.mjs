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
      headers: { host: hostHeader }
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
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout, terminal: false });
  const deadline = Date.now() + 5000;
  let port = null;
  while (Date.now() < deadline && port == null) {
    const winner = await Promise.race([
      once(lines, "line").then(([line]) => ({ line })),
      once(child, "exit").then(([code]) => ({ code })),
      new Promise((resolve) => setTimeout(() => resolve({}), 100))
    ]);
    const match = winner.line?.match(/127\.0\.0\.1:(\d+)/);
    if (match) port = Number(match[1]);
    if (winner.code != null) throw new Error(`LocalOps API exited with ${winner.code}: ${stderr}`);
  }
  if (port == null) throw new Error(`Timed out starting LocalOps API: ${stderr}`);
  t.after(async () => {
    if (child.exitCode == null) {
      child.kill();
      await once(child, "exit");
    }
    rmSync(dataDir, { recursive: true, force: true });
  });
  return { child, base: `http://127.0.0.1:${port}`, dataDir };
}

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
  assert.deepEqual(status.hosts.map((host) => host.id), ["localops-sample-warning", "localops-sample-healthy", "localops-sample-unknown"]);
  assert.ok(status.hosts.every((host) => host.status === "unknown"));

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
});

test("legacy seed flag no longer inserts project-specific hosts", async (t) => {
  const api = await startApi(t, { LOCALOPS_SEED_HOSTS: "1" });
  const response = await fetch(`${api.base}/api/status`);
  const status = await response.json();
  assert.deepEqual(status.hosts, []);
});

test("host input rejects unsafe SSH aliases with a 400 response", async (t) => {
  const api = await startApi(t);
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
    body: JSON.stringify({ name: "safe-agent-host", environment: "test", role: "fixture", tags: [], ...secretMarkers })
  });
  assert.equal(created.status, 201);
  const host = (await created.json()).host;
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
  assert.doesNotMatch(agentText, /private-alias-marker|private-compose-marker|legacy-secret-marker|\/api\/agent\/manifest/);
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

test("dry-run plans require a configured host", async (t) => {
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
  const noAliasPlan = await fetch(`${api.base}/api/actions/dry-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId: "http-only", actionKey: "inspect-service" })
  });
  assert.equal(noAliasPlan.status, 400);
  assert.equal((await noAliasPlan.json()).error, "INVALID_INPUT");
});

test("overlapping checks share the same in-memory run identity and do not duplicate collection", async (t) => {
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
  const firstRequest = fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  await probeStarted;
  const overlapping = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(overlapping.status, 409);
  const conflict = await overlapping.json();
  assert.equal(conflict.error, "CHECK_ALREADY_RUNNING");
  assert.equal(conflict.scope, created.host.id);
  assert.ok(conflict.runId);
  assert.equal(probeCount, 1);
  releaseProbe();
  const completed = await firstRequest;
  assert.equal(completed.status, 200);
  const result = await completed.json();
  assert.equal(result.runId, conflict.runId);
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
