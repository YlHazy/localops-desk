import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverScript = join(scriptDir, "mcp-server.mjs");

async function mockLocalOps() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/agent/status") {
      return res.end(JSON.stringify({ generatedAt: "2026-08-10T00:00:01.000Z", observedAt: "2026-08-10T00:00:00.000Z", staleAfterMs: 1800000, mode: "safe-simulated", counts: { critical: 0, warning: 1, unknown: 0, healthy: 2 }, hosts: [{ name: "demo-01", status: "warning", summary: "SSH alias 不可用" }] }));
    }
    if (req.url?.startsWith("/api/checks/light")) {
      return res.end(JSON.stringify({ summary: "1 host checked, overall warning." }));
    }
    if (req.url === "/api/reports/current") return res.end(JSON.stringify({ report: "diagnostic evidence" }));
    if (req.url === "/api/actions/dry-run") return res.end(JSON.stringify({ title: "只读诊断", riskTier: "read-only", commands: ["ssh demo uptime"], blockedReason: "dry-run only" }));
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

function startMcp(url, extraEnv = {}) {
  const child = spawn(process.execPath, [serverScript], { env: { ...process.env, LOCALOPS_URL: url, ...extraEnv }, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout, terminal: false });
  const replies = [];
  lines.on("line", (line) => replies.push(JSON.parse(line)));
  async function call(id, method, params) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const reply = replies.find((item) => item.id === id);
      if (reply) return reply;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for MCP reply ${id}`);
  }
  return { child, call };
}

test("exposes bounded LocalOps tools and calls only expected API routes", async (t) => {
  const mock = await mockLocalOps();
  const mcp = startMcp(mock.url);
  t.after(() => {
    mcp.child.kill();
    mock.server.close();
  });

  const initialized = await mcp.call(1, "initialize", { protocolVersion: "2024-11-05" });
  assert.equal(initialized.result.serverInfo.name, "localops-guardian");
  assert.match(initialized.result.instructions, /dry-run plans only/);
  assert.deepEqual(initialized.result.capabilities.resources, { listChanged: false });

  const listed = await mcp.call(2, "tools/list", {});
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "localops_get_status",
    "localops_show_status_card",
    "localops_run_light_check",
    "localops_get_diagnostic_report",
    "localops_plan_recovery_action"
  ]);
  assert.deepEqual(listed.result.tools.find((tool) => tool.name === "localops_run_light_check").inputSchema.required, ["hostId"]);
  assert.equal(listed.result.tools.find((tool) => tool.name === "localops_show_status_card")._meta.ui.resourceUri, "ui://localops-guardian/status-card.html");

  const resources = await mcp.call(8, "resources/list", {});
  assert.deepEqual(resources.result.resources.map((resource) => resource.uri), ["ui://localops-guardian/status-card.html"]);
  assert.equal(resources.result.resources[0].mimeType, "text/html;profile=mcp-app");
  const resource = await mcp.call(9, "resources/read", { uri: "ui://localops-guardian/status-card.html" });
  assert.equal(resource.result.contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(resource.result.contents[0].text, /prioritizedHosts\.slice\(0, 6\)/);
  assert.match(resource.result.contents[0].text, /另有 \$\{hiddenHosts\.length\} 台/);
  assert.match(resource.result.contents[0].text, /ui\/notifications\/tool-result/);
  const unknownResource = await mcp.call(10, "resources/read", { uri: "ui://localops-guardian/missing.html" });
  assert.equal(unknownResource.error.code, -32602);

  const status = await mcp.call(3, "tools/call", { name: "localops_get_status", arguments: {} });
  assert.match(status.result.content[0].text, /故障 0 \/ 关注 1/);
  const card = await mcp.call(11, "tools/call", { name: "localops_show_status_card", arguments: {} });
  assert.equal(card.result.structuredContent.hosts[0].name, "demo-01");

  await mcp.call(4, "tools/call", { name: "localops_run_light_check", arguments: { hostId: "demo-01" } });
  const missingHost = await mcp.call(7, "tools/call", { name: "localops_run_light_check", arguments: {} });
  assert.equal(missingHost.result.isError, true);
  assert.match(missingHost.result.content[0].text, /hostId is required/);
  await mcp.call(5, "tools/call", { name: "localops_get_diagnostic_report", arguments: {} });
  const plan = await mcp.call(6, "tools/call", { name: "localops_plan_recovery_action", arguments: { hostId: "demo-01", actionKey: "inspect-service" } });
  assert.match(plan.result.content[0].text, /DRY-RUN/);
  assert.ok(mock.requests.some((request) => request.method === "POST" && request.url === "/api/checks/light/demo-01"));
  assert.equal(mock.requests.filter((request) => request.url === "/api/agent/status").length, 2);
  assert.ok(mock.requests.some((request) => request.method === "POST" && request.url === "/api/actions/dry-run"));
});

test("rejects non-loopback API URLs even when the removed legacy escape hatch is present", async (t) => {
  const mcp = startMcp("https://example.com", { LOCALOPS_ALLOW_REMOTE_API: "1" });
  t.after(() => mcp.child.kill());
  const reply = await mcp.call(1, "tools/call", { name: "localops_get_status", arguments: {} });
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, /Remote LocalOps APIs are disabled/);
});
