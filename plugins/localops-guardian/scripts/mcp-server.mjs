import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "localops-guardian", version: "0.2.2" };
const DEFAULT_LOCALOPS_URL = "http://127.0.0.1:4317";
const READ_TIMEOUT_MS = 3000;
const CHECK_TIMEOUT_MS = 15000;
const STATUS_CARD_URI = "ui://localops-guardian/status-card.html";
const STATUS_CARD_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "status-card.html");
const SERVER_INSTRUCTIONS = "Read current status before diagnosing. Run a single-host light check only when the user asks to refresh/check or current evidence is absent. Recovery tools return dry-run plans only: never execute their commands without separate explicit authorization. If the local API is unavailable, report missing evidence rather than a server outage.";
const statusCardHtml = await readFile(STATUS_CARD_PATH, "utf8");

function localOpsToken() {
  const direct = process.env.LOCALOPS_API_TOKEN?.trim();
  if (direct) return direct;
  const userRoot = process.env.LOCALAPPDATA || process.env.APPDATA;
  const tokenFile = process.env.LOCALOPS_API_TOKEN_FILE || (userRoot ? join(userRoot, "LocalOps Guardian", "local-api-token") : "");
  if (!tokenFile) throw new Error("Start LocalOps once or configure LOCALOPS_API_TOKEN_FILE.");
  try {
    return readFileSync(tokenFile, "utf8").trim();
  } catch {
    throw new Error("LocalOps API token is unavailable. Start LocalOps once or configure LOCALOPS_API_TOKEN_FILE.");
  }
}

const tools = [
  {
    name: "localops_get_status",
    description: "Read the latest LocalOps server status and recent evidence without starting a new check.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Read LocalOps status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "localops_show_status_card",
    description: "Show the current LocalOps status as a compact interactive server card. Use this only when the user asks to see or open the status view; use localops_get_status for analysis without UI.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    _meta: {
      ui: { resourceUri: STATUS_CARD_URI },
      "openai/outputTemplate": STATUS_CARD_URI,
      "openai/toolInvocation/invoking": "读取服务器状态…",
      "openai/toolInvocation/invoked": "服务器状态已显示"
    },
    annotations: { title: "Show LocalOps status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "localops_run_light_check",
    description: "Run one bounded LocalOps light check for exactly one configured host. This can perform configured HTTP and allowlisted read-only SSH collectors and records local check history.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string", minLength: 1, description: "Required LocalOps host ID. Read status first to choose the host." }
      },
      additionalProperties: false
    },
    annotations: { title: "Run a light server check", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "localops_get_diagnostic_report",
    description: "Read LocalOps' current plain-text diagnostic report and evidence-based troubleshooting matrix.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Read diagnostic report", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "localops_plan_recovery_action",
    description: "Generate a non-executing LocalOps recovery plan. The returned commands are displayed only and must not be executed without separate authorization.",
    inputSchema: {
      type: "object",
      required: ["hostId", "actionKey"],
      properties: {
        hostId: { type: "string", minLength: 1, description: "LocalOps host ID." },
        actionKey: {
          type: "string",
          enum: ["inspect-service", "reload-nginx", "restart-compose-service"],
          description: "The recovery plan template to generate."
        }
      },
      additionalProperties: false
    },
    annotations: { title: "Plan a recovery action", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];

function localOpsBaseUrl() {
  const base = new URL(process.env.LOCALOPS_URL || DEFAULT_LOCALOPS_URL);
  if (!new Set(["http:", "https:"]).has(base.protocol)) {
    throw new Error("LOCALOPS_URL must use http:// or https://.");
  }
  if (base.username || base.password) {
    throw new Error("LOCALOPS_URL must not contain credentials.");
  }
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
  if (!loopbackHosts.has(base.hostname)) {
    throw new Error("Remote LocalOps APIs are disabled. Use a loopback URL; authenticated remote transport is not available in this MVP.");
  }
  return base;
}

async function request(path, init = {}, requestTimeoutMs = READ_TIMEOUT_MS) {
  const url = new URL(path, localOpsBaseUrl());
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${localOpsToken()}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LocalOps API ${response.status}: ${text.slice(0, 240) || response.statusText}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function textResult(text, structuredContent) {
  const result = { content: [{ type: "text", text }] };
  if (structuredContent && typeof structuredContent === "object") result.structuredContent = structuredContent;
  return result;
}

function statusText(payload) {
  const counts = payload?.counts || {};
  const lines = [
    `LocalOps ${payload?.mode || "unknown"} · 最近观测 ${payload?.observedAt || "尚未巡检"}`,
    `故障 ${counts.critical || 0} / 关注 ${counts.warning || 0} / 未检查 ${counts.unknown || 0} / 正常 ${counts.healthy || 0}`
  ];
  for (const host of payload?.hosts || []) {
    lines.push(`- ${host.name} [${host.status}]: ${host.summary || "无摘要"}`);
  }
  return lines.join("\n");
}

async function callTool(name, args = {}) {
  if (name === "localops_get_status") {
    const payload = await request("/api/agent/status");
    return textResult(statusText(payload), payload);
  }
  if (name === "localops_show_status_card") {
    const payload = await request("/api/agent/status");
    return textResult(statusText(payload), payload);
  }
  if (name === "localops_run_light_check") {
    const hostId = typeof args.hostId === "string" ? args.hostId.trim() : "";
    if (!hostId) throw new Error("hostId is required; read LocalOps status first and select one host.");
    const path = `/api/checks/light/${encodeURIComponent(hostId)}`;
    const check = await request(path, { method: "POST", body: JSON.stringify({ trigger: "codex-pet" }) }, CHECK_TIMEOUT_MS);
    return textResult(check?.summary || "Light check completed.", check);
  }
  if (name === "localops_get_diagnostic_report") {
    const payload = await request("/api/reports/current");
    return textResult(payload?.report || "LocalOps did not return a diagnostic report.", payload);
  }
  if (name === "localops_plan_recovery_action") {
    const hostId = typeof args.hostId === "string" ? args.hostId.trim() : "";
    const allowedActions = new Set(["inspect-service", "reload-nginx", "restart-compose-service"]);
    if (!hostId) throw new Error("hostId is required.");
    if (!allowedActions.has(args.actionKey)) throw new Error("actionKey is not supported.");
    const plan = await request("/api/actions/dry-run", {
      method: "POST",
      body: JSON.stringify({ hostId, actionKey: args.actionKey })
    });
    const lines = [plan.title, `风险级别：${plan.riskTier}`, ...(plan.commands || []).map((command) => `DRY-RUN: ${command}`)];
    if (plan.blockedReason) lines.push(`执行边界：${plan.blockedReason}`);
    return textResult(lines.join("\n"), plan);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS } });
  }
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools } });
  if (method === "resources/list") {
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        resources: [{
          uri: STATUS_CARD_URI,
          name: "LocalOps server status card",
          description: "Compact interactive status for the most important configured servers.",
          mimeType: "text/html;profile=mcp-app"
        }]
      }
    });
  }
  if (method === "resources/read") {
    if (params.uri !== STATUS_CARD_URI) {
      return send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown LocalOps UI resource." } });
    }
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        contents: [{
          uri: STATUS_CARD_URI,
          mimeType: "text/html;profile=mcp-app",
          text: statusCardHtml,
          _meta: { ui: { prefersBorder: false } }
        }]
      }
    });
  }
  if (method === "tools/call") {
    try {
      const result = await callTool(params.name, params.arguments || {});
      return send({ jsonrpc: "2.0", id, result });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown LocalOps error";
      return send({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: messageText }] } });
    }
  }
  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

const input = createInterface({ input: process.stdin, terminal: false });
let queue = Promise.resolve();
input.on("line", (line) => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    try {
      await handle(JSON.parse(line));
    } catch (error) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: error instanceof Error ? error.message : "Invalid JSON" } });
    }
  });
});
