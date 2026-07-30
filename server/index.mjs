import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { collectHost, seedHosts } from "./runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "localops.sqlite"));
const host = process.env.LOCALOPS_API_HOST || "127.0.0.1";
const port = Number(process.env.LOCALOPS_API_PORT || "4317");
const mode = process.env.LOCALOPS_ENABLE_SSH === "1" ? "ssh-enabled" : "safe-simulated";

db.exec(`
  CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    environment TEXT NOT NULL,
    role TEXT NOT NULL,
    sshAlias TEXT NOT NULL,
    healthUrl TEXT NOT NULL,
    composeProject TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS check_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    finishedAt TEXT NOT NULL,
    durationMs INTEGER NOT NULL,
    overallStatus TEXT NOT NULL,
    summary TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS host_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL,
    hostId TEXT NOT NULL,
    status TEXT NOT NULL,
    httpStatus TEXT NOT NULL,
    sshStatus TEXT NOT NULL,
    cpuPercent INTEGER,
    memoryPercent INTEGER,
    diskPercent INTEGER,
    dockerStatus TEXT NOT NULL,
    evidenceJson TEXT NOT NULL,
    sanitizedError TEXT,
    FOREIGN KEY(runId) REFERENCES check_runs(id),
    FOREIGN KEY(hostId) REFERENCES hosts(id)
  );
`);

const existingHosts = db.prepare("SELECT COUNT(*) AS count FROM hosts").get();
if (existingHosts.count === 0) {
  const insert = db.prepare(`
    INSERT INTO hosts (id, name, environment, role, sshAlias, healthUrl, composeProject, tags, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const item of seedHosts) {
    insert.run(item.id, item.name, item.environment, item.role, item.sshAlias, item.healthUrl, item.composeProject, JSON.stringify(item.tags), now, now);
  }
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "http://127.0.0.1:5177",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(payload);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function serveStatic(res, pathname) {
  const distDir = join(root, "dist");
  if (!existsSync(distDir)) {
    return json(res, { error: "UI build not found. Run npm run build first." }, 404);
  }

  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = normalize(join(distDir, relative));
  const safeRoot = normalize(distDir);
  const filePath = target.startsWith(safeRoot) && existsSync(target) && statSync(target).isFile()
    ? target
    : join(distDir, "index.html");
  const ext = extname(filePath);
  res.writeHead(200, {
    "content-type": contentTypes[ext] || "application/octet-stream",
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable"
  });
  res.end(readFileSync(filePath));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getHosts() {
  return db.prepare("SELECT * FROM hosts ORDER BY environment, name").all().map((hostRow) => ({
    ...hostRow,
    tags: JSON.parse(hostRow.tags)
  }));
}

function latestHostChecks() {
  const rows = db.prepare(`
    SELECT hc.*, h.name, h.environment, h.role, h.sshAlias, h.healthUrl, h.composeProject, cr.finishedAt AS lastCheckedAt, cr.durationMs
    FROM hosts h
    LEFT JOIN host_checks hc ON hc.id = (
      SELECT hc2.id FROM host_checks hc2 WHERE hc2.hostId = h.id ORDER BY hc2.id DESC LIMIT 1
    )
    LEFT JOIN check_runs cr ON cr.id = hc.runId
    ORDER BY h.environment, h.name
  `).all();

  return rows.map((row) => ({
    id: row.hostId || row.id,
    name: row.name,
    environment: row.environment,
    role: row.role,
    sshAlias: row.sshAlias,
    healthUrl: row.healthUrl,
    composeProject: row.composeProject,
    status: row.status || "unknown",
    lastCheckedAt: row.lastCheckedAt || null,
    durationMs: row.durationMs ?? null,
    cpuPercent: row.cpuPercent ?? null,
    memoryPercent: row.memoryPercent ?? null,
    diskPercent: row.diskPercent ?? null,
    httpStatus: row.httpStatus || "not checked",
    sshStatus: row.sshStatus || "not checked",
    dockerStatus: row.dockerStatus || "not checked",
    summary: row.sanitizedError || summarizeStatus(row.status || "unknown"),
    evidence: row.evidenceJson ? JSON.parse(row.evidenceJson) : ["尚未采集。"]
  }));
}

function summarizeStatus(status) {
  if (status === "healthy") return "所有基础检查正常。";
  if (status === "warning") return "存在需要关注的资源或依赖信号。";
  if (status === "critical") return "服务存在关键异常，需要立即确认。";
  return "暂无足够证据判断。";
}

function statusCounts(hosts) {
  return hosts.reduce((acc, host) => {
    acc[host.status] = (acc[host.status] || 0) + 1;
    return acc;
  }, { healthy: 0, warning: 0, critical: 0, unknown: 0 });
}

function overallStatus(hostResults) {
  if (hostResults.some((item) => item.status === "critical")) return "critical";
  if (hostResults.some((item) => item.status === "warning")) return "warning";
  if (hostResults.some((item) => item.status === "unknown")) return "unknown";
  return "healthy";
}

async function runLightCheck() {
  const startedAt = new Date();
  const hosts = getHosts();
  const hostResults = [];
  for (const hostItem of hosts) {
    hostResults.push(await collectHost(hostItem, { mode }));
  }
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status = overallStatus(hostResults);
  const summary = `${hostResults.length} hosts checked, overall ${status}.`;

  const run = db.prepare(`
    INSERT INTO check_runs (kind, startedAt, finishedAt, durationMs, overallStatus, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("light", startedAt.toISOString(), finishedAt.toISOString(), durationMs, status, summary);

  const insertHostCheck = db.prepare(`
    INSERT INTO host_checks (runId, hostId, status, httpStatus, sshStatus, cpuPercent, memoryPercent, diskPercent, dockerStatus, evidenceJson, sanitizedError)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of hostResults) {
    insertHostCheck.run(
      run.lastInsertRowid,
      result.hostId,
      result.status,
      result.httpStatus,
      result.sshStatus,
      result.cpuPercent,
      result.memoryPercent,
      result.diskPercent,
      result.dockerStatus,
      JSON.stringify(result.evidence),
      result.summary
    );
  }

  return { id: Number(run.lastInsertRowid), status, summary, durationMs, hostResults };
}

function recentChecks() {
  return db.prepare(`
    SELECT id, kind, startedAt, finishedAt, durationMs, overallStatus, summary
    FROM check_runs
    ORDER BY id DESC
    LIMIT 20
  `).all();
}

function currentReport() {
  const hosts = latestHostChecks();
  const lines = [];
  lines.push(`LocalOps Desk 诊断报告`);
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push(`采集模式：${mode}`);
  lines.push("");
  for (const hostItem of hosts) {
    lines.push(`- ${hostItem.name} [${hostItem.status}]`);
    lines.push(`  HTTP: ${hostItem.httpStatus}; SSH: ${hostItem.sshStatus}; Docker: ${hostItem.dockerStatus}`);
    lines.push(`  资源: CPU ${hostItem.cpuPercent ?? "N/A"}%, 内存 ${hostItem.memoryPercent ?? "N/A"}%, 磁盘 ${hostItem.diskPercent ?? "N/A"}%`);
    lines.push(`  摘要: ${hostItem.summary}`);
  }
  lines.push("");
  lines.push("建议：先确认 public HTTP 与 SSH 管理通道是否同时失败；如果只有 HTTP 失败，优先看应用/Nginx/ALB；如果只有 SSH 失败，优先看管理通道、安全组或本地网络。");
  return lines.join("\n");
}

function dryRunAction(input) {
  const hostId = input.hostId || "unknown-host";
  const actionKey = input.actionKey || "inspect-service";
  const hostItem = getHosts().find((item) => item.id === hostId);
  const ssh = hostItem?.sshAlias || "<ssh-alias>";

  const plans = {
    "inspect-service": {
      actionKey,
      riskTier: "read-only",
      title: `只读诊断：${hostItem?.name || hostId}`,
      commands: [
        `ssh ${ssh} 'uptime'`,
        `ssh ${ssh} 'free -m'`,
        `ssh ${ssh} 'df -h /'`,
        `ssh ${ssh} 'docker compose ps'`
      ],
      verification: ["确认命令只读。", "确认输出经过脱敏。", "确认不会读取 .env 或打印密钥。"]
    },
    "reload-nginx": {
      actionKey,
      riskTier: "low",
      title: `Reload Nginx：${hostItem?.name || hostId}`,
      commands: [`ssh ${ssh} 'sudo nginx -t'`, `ssh ${ssh} 'sudo systemctl reload nginx'`],
      verification: ["先通过 nginx -t。", "reload 后检查 HTTP health。", "失败时不继续执行后续动作。"],
      blockedReason: "MVP 只生成 dry-run，不执行真实 reload。"
    },
    "restart-compose-service": {
      actionKey,
      riskTier: "medium",
      title: `重启 Compose 服务：${hostItem?.name || hostId}`,
      commands: [
        `ssh ${ssh} 'cd /opt/<app>/compose && docker compose ps'`,
        `ssh ${ssh} 'cd /opt/<app>/compose && docker compose restart <service>'`
      ],
      verification: ["重启前记录当前 release。", "重启后检查 readiness。", "保留回滚边界。"],
      blockedReason: "MVP 禁止真实重启；后续需二次确认和审计。"
    }
  };

  return plans[actionKey] || plans["inspect-service"];
}

function agentManifest() {
  return {
    name: "LocalOps Desk Agent API",
    version: "0.1.0",
    safety: {
      bind: `${host}:${port}`,
      sshDefault: mode === "ssh-enabled" ? "enabled" : "disabled",
      arbitraryShell: false,
      secretStorage: false,
      destructiveActions: false
    },
    endpoints: [
      { method: "GET", path: "/api/status", description: "Read latest dashboard status." },
      { method: "POST", path: "/api/checks/light", description: "Run a bounded light check." },
      { method: "POST", path: "/api/actions/dry-run", description: "Generate a non-mutating action plan." },
      { method: "GET", path: "/api/reports/current", description: "Read current diagnostic report." }
    ]
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, {});
    const url = new URL(req.url || "/", `http://${host}:${port}`);

    if (!url.pathname.startsWith("/api/")) {
      return serveStatic(res, url.pathname);
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      const hosts = latestHostChecks();
      return json(res, { generatedAt: new Date().toISOString(), mode, counts: statusCounts(hosts), hosts });
    }
    if (req.method === "GET" && url.pathname === "/api/hosts") {
      return json(res, { hosts: getHosts() });
    }
    if (req.method === "GET" && url.pathname === "/api/checks") {
      return json(res, { checks: recentChecks() });
    }
    if (req.method === "POST" && url.pathname === "/api/checks/light") {
      return json(res, await runLightCheck());
    }
    if (req.method === "POST" && url.pathname === "/api/checks/deep") {
      return json(res, {
        mode: "dry-run",
        summary: "Deep checks are deferred in MVP. Planned checks: DB size summary, Docker resource summary, recent error digest, retention audit."
      });
    }
    if (req.method === "POST" && url.pathname === "/api/actions/dry-run") {
      return json(res, dryRunAction(await readBody(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/reports/current") {
      return json(res, { report: currentReport() });
    }
    if (req.method === "GET" && url.pathname === "/api/agent/manifest") {
      return json(res, agentManifest());
    }

    return json(res, { error: "Not found" }, 404);
  } catch (error) {
    return json(res, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`LocalOps API listening on http://${host}:${port} (${mode})`);
});
