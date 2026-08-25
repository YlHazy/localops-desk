import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { collectionCoverage, hostCollectionPlan } from "../shared/collection-coverage.mjs";
import { collectHost, demoHosts, readOnlySshPreview, sanitizeError } from "./runtime.mjs";
import { InputValidationError, validateSshAlias } from "./input-validation.mjs";
import { createPetPresenceTracker } from "./pet-presence.mjs";
import { petWindowCapability, setPetWindowTopmost } from "./pet-window.mjs";
import { configureStartupEntry, publicStartupState, startupEntrySnapshot } from "./windows-startup.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const host = process.env.LOCALOPS_API_HOST || "127.0.0.1";
const port = Number(process.env.LOCALOPS_API_PORT || "4317");
const mode = process.env.LOCALOPS_ENABLE_SSH === "1" ? "ssh-enabled" : "safe-simulated";
const loopbackApiHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (!loopbackApiHosts.has(host)) {
  throw new Error("LOCALOPS_API_HOST must be a loopback address in this MVP.");
}

const dataDir = process.env.LOCALOPS_DATA_DIR ? resolve(process.env.LOCALOPS_DATA_DIR) : join(root, "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "localops.sqlite");
const db = new DatabaseSync(dbPath);
const petPresence = createPetPresenceTracker();

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
    trigger TEXT NOT NULL DEFAULT 'manual',
    hostScope TEXT,
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
    hostName TEXT NOT NULL DEFAULT '',
    hostEnvironment TEXT NOT NULL DEFAULT '',
    hostRole TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    httpStatus TEXT NOT NULL,
    httpLatencyMs INTEGER,
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

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("host_checks", "httpLatencyMs", "INTEGER");
ensureColumn("host_checks", "hostName", "TEXT NOT NULL DEFAULT ''");
ensureColumn("host_checks", "hostEnvironment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("host_checks", "hostRole", "TEXT NOT NULL DEFAULT ''");
ensureColumn("check_runs", "trigger", "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn("check_runs", "hostScope", "TEXT");

const existingHosts = db.prepare("SELECT COUNT(*) AS count FROM hosts").get();
if (existingHosts.count === 0 && process.env.LOCALOPS_SEED_DEMO === "1") {
  const insert = db.prepare(`
    INSERT INTO hosts (id, name, environment, role, sshAlias, healthUrl, composeProject, tags, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const item of demoHosts) {
    insert.run(item.id, item.name, item.environment, item.role, item.sshAlias, item.healthUrl, item.composeProject, JSON.stringify(item.tags), now, now);
  }
}

const defaultSettings = {
  schedulerEnabled: "0",
  lightIntervalMinutes: "15",
  retentionDays: "7",
  schedulerConsecutiveFailures: "0",
  schedulerLastRunAt: "",
  schedulerNextRunAt: "",
  schedulerLastOutcome: "never",
  schedulerLastEventAt: "",
  schedulerLastMessage: "尚未运行自动巡检。",
  schedulerLastErrorCode: "",
  schedulerLastDurationMs: "",
  schedulerLastCheckedHosts: "0",
  schedulerLastSkippedHosts: "0"
};

function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, String(value), new Date().toISOString());
}

for (const [key, value] of Object.entries(defaultSettings)) {
  if (getSetting(key, null) == null) {
    setSetting(key, value);
  }
}

function settingNumber(key, fallback, { min = 1, max = 10080 } = {}) {
  const value = Number(getSetting(key, String(fallback)));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(payload);
}

function loopbackRequestHost(value) {
  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return loopbackApiHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

function browserOriginAllowed(origin, requestHost) {
  try {
    const parsed = new URL(origin);
    const sameOrigin = parsed.host.toLowerCase() === requestHost.toLowerCase();
    const devOrigin = loopbackRequestHost(origin) && parsed.port === "5177";
    return sameOrigin || devOrigin;
  } catch {
    return false;
  }
}

function validateBrowserBoundary(req, res) {
  const requestHost = req.headers.host || "";
  if (!loopbackRequestHost(requestHost)) {
    json(res, { error: "HOST_NOT_ALLOWED", message: "Request Host must resolve to a loopback name." }, 403);
    return false;
  }
  const origin = req.headers.origin;
  if (origin && !browserOriginAllowed(origin, requestHost)) {
    json(res, { error: "ORIGIN_NOT_ALLOWED", message: "Browser Origin must be loopback." }, 403);
    return false;
  }
  if (origin) res.setHeader("access-control-allow-origin", origin);
  const mutating = new Set(["POST", "PUT", "DELETE"]).has(req.method || "");
  if (mutating && !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    json(res, { error: "JSON_REQUIRED", message: "Mutating requests require application/json." }, 415);
    return false;
  }
  return true;
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
  return db.prepare("SELECT * FROM hosts ORDER BY environment, name").all().map((hostRow) => {
    const hostItem = { ...hostRow, tags: JSON.parse(hostRow.tags) };
    return { ...hostItem, isOfflineDemo: isManagedOfflineDemoHost(hostItem) };
  });
}

const offlineDemoIds = new Set(demoHosts.map((hostItem) => hostItem.id));
const legacyOfflineDemoNames = {
  "localops-sample-healthy": "Sample healthy service",
  "localops-sample-warning": "Sample attention service",
  "localops-sample-unknown": "Sample unobserved service"
};

class OfflinePracticeConflictError extends Error {
  constructor(message) {
    super(message);
    this.code = "OFFLINE_PRACTICE_CONFLICT";
    this.httpStatus = 409;
  }
}

class HostCheckInProgressError extends Error {
  constructor(active) {
    super(`服务器 ${active.scope} 正在巡检；完成前不会修改或删除它的配置。`);
    this.code = "HOST_CHECK_IN_PROGRESS";
    this.httpStatus = 409;
    this.runId = active.runId;
    this.scope = active.scope;
  }
}

function isManagedOfflineDemoHost(hostItem) {
  const expected = demoHosts.find((item) => item.id === hostItem.id);
  if (!expected) return false;
  const currentIdentity = hostItem.name === expected.name
    && hostItem.environment === expected.environment
    && hostItem.role === expected.role;
  const legacyIdentity = hostItem.name === legacyOfflineDemoNames[hostItem.id]
    && hostItem.environment === "sample"
    && hostItem.role === "offline UI demonstration";
  return (currentIdentity || legacyIdentity)
    && hostItem.sshAlias === ""
    && hostItem.healthUrl === ""
    && hostItem.composeProject === ""
    && Array.isArray(hostItem.tags)
    && hostItem.tags.length === expected.tags.length
    && expected.tags.every((tag) => hostItem.tags.includes(tag));
}

function offlinePracticeActive(hosts = getHosts()) {
  return hosts.length === demoHosts.length && hosts.every(isManagedOfflineDemoHost);
}

function installOfflinePractice() {
  const existing = getHosts();
  if (offlinePracticeActive(existing)) {
    return { installed: false, practiceMode: true, hostsAdded: 0, totalHosts: existing.length, networkTargets: 0 };
  }
  if (existing.length > 0) {
    throw new OfflinePracticeConflictError("离线练习只能在没有服务器配置时启用；现有配置不会被覆盖。");
  }
  const insert = db.prepare(`
    INSERT INTO hosts (id, name, environment, role, sshAlias, healthUrl, composeProject, tags, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of demoHosts) {
      insert.run(item.id, item.name, item.environment, item.role, item.sshAlias, item.healthUrl, item.composeProject, JSON.stringify(item.tags), now, now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { installed: true, practiceMode: true, hostsAdded: demoHosts.length, totalHosts: demoHosts.length, networkTargets: 0 };
}

function removeOfflinePractice() {
  const existing = getHosts();
  const practiceCandidates = existing.filter((hostItem) => offlineDemoIds.has(hostItem.id));
  if (practiceCandidates.length === 0) {
    return { removed: false, practiceMode: false, hostsRemoved: 0, checksRemoved: 0, schedulerDisabled: false };
  }
  if (practiceCandidates.length !== demoHosts.length || !practiceCandidates.every(isManagedOfflineDemoHost)) {
    throw new OfflinePracticeConflictError("检测到同名但不受 LocalOps 管理的数据，未执行删除。");
  }
  const active = activeLightChecks.values().next().value;
  if (active) throw new HostCheckInProgressError(active);

  const ids = demoHosts.map((item) => item.id);
  const placeholders = ids.map(() => "?").join(", ");
  const runIds = db.prepare(`SELECT DISTINCT runId FROM host_checks WHERE hostId IN (${placeholders})`).all(...ids).map((row) => row.runId);
  let checksRemoved = 0;
  let runsRemoved = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    checksRemoved = db.prepare(`DELETE FROM host_checks WHERE hostId IN (${placeholders})`).run(...ids).changes;
    db.prepare(`DELETE FROM hosts WHERE id IN (${placeholders})`).run(...ids);
    const removeEmptyRun = db.prepare("DELETE FROM check_runs WHERE id = ? AND NOT EXISTS (SELECT 1 FROM host_checks WHERE runId = ?)");
    for (const runId of runIds) {
      runsRemoved += removeEmptyRun.run(runId, runId).changes;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const schedulerDisabled = getHosts().length === 0 && schedulerSnapshot().enabled;
  if (getHosts().length === 0) {
    setSetting("schedulerEnabled", "0");
    setSetting("schedulerConsecutiveFailures", "0");
    stopScheduler();
  }
  return {
    removed: true,
    practiceMode: false,
    hostsRemoved: ids.length,
    checksRemoved,
    runsRemoved,
    schedulerDisabled
  };
}

function normalizeHostInput(input, existing = {}) {
  const now = new Date().toISOString();
  const name = String(input.name ?? existing.name ?? "").trim();
  if (!name) {
    throw new InputValidationError("服务器名称不能为空。");
  }
  const healthUrl = String(input.healthUrl ?? existing.healthUrl ?? "").trim();
  if (healthUrl) {
    let parsed;
    try {
      parsed = new URL(healthUrl);
    } catch {
      throw new InputValidationError("Health URL 必须是有效的 http:// 或 https:// 地址。");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new InputValidationError("Health URL 必须以 http:// 或 https:// 开头。");
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new InputValidationError("Health URL 不能包含账号密码、查询参数或 # 片段。");
    }
  }
  const sshAlias = validateSshAlias(input.sshAlias ?? existing.sshAlias ?? "");
  const tags = Array.isArray(input.tags)
    ? input.tags
    : String(input.tags ?? existing.tags?.join?.(",") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    id: existing.id || String(input.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "") || randomUUID(),
    name,
    environment: String(input.environment ?? existing.environment ?? "personal").trim() || "personal",
    role: String(input.role ?? existing.role ?? "server").trim() || "server",
    sshAlias,
    healthUrl,
    composeProject: String(input.composeProject ?? existing.composeProject ?? "").trim(),
    tags,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function createHost(input) {
  if (offlinePracticeActive()) {
    throw new OfflinePracticeConflictError("请先退出离线练习，再配置真实服务器。");
  }
  const hostItem = normalizeHostInput(input);
  db.prepare(`
    INSERT INTO hosts (id, name, environment, role, sshAlias, healthUrl, composeProject, tags, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(hostItem.id, hostItem.name, hostItem.environment, hostItem.role, hostItem.sshAlias, hostItem.healthUrl, hostItem.composeProject, JSON.stringify(hostItem.tags), hostItem.createdAt, hostItem.updatedAt);
  return hostItem;
}

function updateHost(id, input) {
  const existing = getHosts().find((item) => item.id === id);
  if (!existing) {
    throw new Error(`Host not found: ${id}`);
  }
  if (isManagedOfflineDemoHost(existing)) {
    throw new OfflinePracticeConflictError("离线练习对象不能单独修改；请退出练习后配置真实服务器。");
  }
  const active = conflictingLightCheck(id);
  if (active) throw new HostCheckInProgressError(active);
  const hostItem = normalizeHostInput(input, existing);
  db.prepare(`
    UPDATE hosts
    SET name = ?, environment = ?, role = ?, sshAlias = ?, healthUrl = ?, composeProject = ?, tags = ?, updatedAt = ?
    WHERE id = ?
  `).run(hostItem.name, hostItem.environment, hostItem.role, hostItem.sshAlias, hostItem.healthUrl, hostItem.composeProject, JSON.stringify(hostItem.tags), hostItem.updatedAt, id);
  reconcileSchedulerCoverage();
  return hostItem;
}

function deleteHost(id) {
  const existing = getHosts().find((item) => item.id === id);
  if (existing && isManagedOfflineDemoHost(existing)) {
    throw new OfflinePracticeConflictError("离线练习对象不能单独删除；请使用“退出离线练习”。");
  }
  const active = conflictingLightCheck(id);
  if (active) throw new HostCheckInProgressError(active);
  db.prepare("DELETE FROM host_checks WHERE hostId = ?").run(id);
  const result = db.prepare("DELETE FROM hosts WHERE id = ?").run(id);
  reconcileSchedulerCoverage();
  return { deleted: result.changes > 0 };
}

function latestHostChecks() {
  const rows = db.prepare(`
    SELECT h.id AS configuredHostId, hc.*, h.name, h.environment, h.role, h.sshAlias, h.healthUrl, h.composeProject, h.tags, cr.finishedAt AS lastCheckedAt, cr.durationMs
    FROM hosts h
    LEFT JOIN host_checks hc ON hc.id = (
      SELECT hc2.id FROM host_checks hc2 WHERE hc2.hostId = h.id ORDER BY hc2.id DESC LIMIT 1
    )
    LEFT JOIN check_runs cr ON cr.id = hc.runId
    ORDER BY h.environment, h.name
  `).all();

  return rows.map((row) => ({
    id: row.configuredHostId,
    name: row.name,
    environment: row.environment,
    role: row.role,
    sshAlias: row.sshAlias,
    healthUrl: row.healthUrl,
    composeProject: row.composeProject,
    tags: JSON.parse(row.tags),
    isOfflineDemo: isManagedOfflineDemoHost({
      id: row.configuredHostId,
      name: row.name,
      environment: row.environment,
      role: row.role,
      sshAlias: row.sshAlias,
      healthUrl: row.healthUrl,
      composeProject: row.composeProject,
      tags: JSON.parse(row.tags)
    }),
    status: row.status || "unknown",
    lastCheckedAt: row.lastCheckedAt || null,
    durationMs: row.durationMs ?? null,
    cpuPercent: row.cpuPercent ?? null,
    memoryPercent: row.memoryPercent ?? null,
    diskPercent: row.diskPercent ?? null,
    httpStatus: row.httpStatus || "not checked",
    httpLatencyMs: row.httpLatencyMs ?? null,
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

function statusSnapshot(hosts) {
  const staleAfterMs = Math.max(settingNumber("lightIntervalMinutes", 15, { min: 1, max: 1440 }) * 2 * 60 * 1000, 10 * 60 * 1000);
  const now = Date.now();
  const effectiveHosts = hosts.map((hostItem) => {
    const checkedAt = hostItem.lastCheckedAt ? new Date(hostItem.lastCheckedAt).getTime() : Number.NaN;
    const stale = !Number.isFinite(checkedAt) || now - checkedAt > staleAfterMs;
    if (!stale) return hostItem;
    return {
      ...hostItem,
      status: "unknown",
      summary: hostItem.lastCheckedAt
        ? "最近一次检查证据已过期，请重新巡检。"
        : "尚未运行过检查。"
    };
  });
  const observedAt = hosts
    .map((hostItem) => hostItem.lastCheckedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  return {
    generatedAt: new Date().toISOString(),
    observedAt,
    staleAfterMs,
    mode,
    practiceMode: effectiveHosts.length > 0 && effectiveHosts.every((hostItem) => hostItem.isOfflineDemo),
    counts: statusCounts(effectiveHosts),
    hosts: effectiveHosts
  };
}

function agentSafeSnapshot(snapshot) {
  return {
    ...snapshot,
    hosts: snapshot.hosts.map(({ healthUrl, sshAlias, composeProject, tags, evidence, ...hostItem }) => hostItem)
  };
}

function overallStatus(hostResults) {
  if (hostResults.some((item) => item.status === "critical")) return "critical";
  if (hostResults.some((item) => item.status === "warning")) return "warning";
  if (hostResults.some((item) => item.status === "unknown")) return "unknown";
  return "healthy";
}

const activeLightChecks = new Map();

class CheckAlreadyRunningError extends Error {
  constructor(active) {
    super(`A light check is already running for ${active.scope}.`);
    this.code = "CHECK_ALREADY_RUNNING";
    this.httpStatus = 409;
    this.runId = active.runId;
    this.scope = active.scope;
  }
}

function checkOutcomeLabel(status) {
  if (status === "healthy") return "本次未发现问题";
  if (status === "warning") return "有需要关注的信号";
  if (status === "critical") return "发现明确故障";
  return "仍有状态无法确认";
}

class NoCollectibleEvidenceError extends Error {
  constructor(coverage, scope) {
    super(scope === "all"
      ? "没有可采集的服务器。请先为至少一台服务器配置 Health URL，或显式启用已登记的只读 SSH。"
      : "这台服务器当前没有可用证据来源。请先配置 Health URL，或显式启用已登记的只读 SSH。");
    this.code = "NO_COLLECTIBLE_EVIDENCE";
    this.httpStatus = 409;
    this.coverage = coverage;
    this.scope = scope;
  }
}

function conflictingLightCheck(scope) {
  if (scope === "all") return activeLightChecks.values().next().value || null;
  return activeLightChecks.get("all") || activeLightChecks.get(scope) || null;
}

async function runLightCheck(options = {}) {
  const scope = options.hostId || "all";
  const active = conflictingLightCheck(scope);
  if (active) throw new CheckAlreadyRunningError(active);
  const activeRun = { runId: randomUUID(), scope };
  activeLightChecks.set(scope, activeRun);
  try {
    const startedAt = new Date();
    const allHosts = getHosts();
    const requestedHosts = options.hostId
      ? allHosts.filter((hostItem) => hostItem.id === options.hostId)
      : allHosts;
    if (options.hostId && requestedHosts.length === 0) {
      throw new Error(`Host not found: ${options.hostId}`);
    }
    const coverage = collectionCoverage(mode, requestedHosts);
    if (coverage.collectible === 0) throw new NoCollectibleEvidenceError(coverage, scope);
    const hosts = requestedHosts.filter((hostItem) => hostCollectionPlan(mode, hostItem).canCollect);
    const hostResults = [];
    for (const hostItem of hosts) {
      hostResults.push(await collectHost(hostItem, { mode, httpTimeoutMs: 5000 }));
    }
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const status = overallStatus(hostResults);
    const trigger = String(options.trigger || (options.hostId ? "manual-host" : "manual"));
    const hostScope = options.hostId || "all";
    const outcomeLabel = checkOutcomeLabel(status);
    const summary = coverage.blocked > 0
      ? `${hostResults.length} 台已取得证据，${coverage.blocked} 台因证据来源不可用而跳过；${outcomeLabel}。`
      : `${hostResults.length} 台已取得证据；${outcomeLabel}。`;
    const hostSnapshots = new Map(hosts.map((hostItem) => [hostItem.id, hostItem]));

    let run;
    db.exec("BEGIN IMMEDIATE");
    try {
      run = db.prepare(`
        INSERT INTO check_runs (kind, trigger, hostScope, startedAt, finishedAt, durationMs, overallStatus, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("light", trigger, hostScope, startedAt.toISOString(), finishedAt.toISOString(), durationMs, status, summary);

      const insertHostCheck = db.prepare(`
        INSERT INTO host_checks (runId, hostId, hostName, hostEnvironment, hostRole, status, httpStatus, httpLatencyMs, sshStatus, cpuPercent, memoryPercent, diskPercent, dockerStatus, evidenceJson, sanitizedError)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const result of hostResults) {
        const hostSnapshot = hostSnapshots.get(result.hostId);
        insertHostCheck.run(
          run.lastInsertRowid,
          result.hostId,
          hostSnapshot?.name || result.hostId,
          hostSnapshot?.environment || "unknown",
          hostSnapshot?.role || "server",
          result.status,
          result.httpStatus,
          result.httpLatencyMs,
          result.sshStatus,
          result.cpuPercent,
          result.memoryPercent,
          result.diskPercent,
          result.dockerStatus,
          JSON.stringify(result.evidence),
          result.summary
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { id: Number(run.lastInsertRowid), runId: activeRun.runId, status, summary, durationMs, coverage, hostResults };
  } finally {
    activeLightChecks.delete(scope);
  }
}

function recentChecks() {
  return db.prepare(`
    SELECT id, kind, trigger, hostScope, startedAt, finishedAt, durationMs, overallStatus, summary
    FROM check_runs
    ORDER BY id DESC
    LIMIT 20
  `).all();
}

function safeEvidenceList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed) || parsed.length === 0) return ["本次没有保存可展示的证据。"];
    return parsed.slice(0, 20).map((item) => sanitizeError(String(item)).slice(0, 2000));
  } catch {
    return ["保存的证据格式无法读取；原始内容未展示。"];
  }
}

function checkDetail(id) {
  const check = db.prepare(`
    SELECT id, kind, trigger, hostScope, startedAt, finishedAt, durationMs, overallStatus, summary
    FROM check_runs
    WHERE id = ?
  `).get(id);
  if (!check) {
    const error = new Error("这条检查记录不存在，可能已被本地保留策略清理。");
    error.code = "CHECK_RUN_NOT_FOUND";
    error.httpStatus = 404;
    throw error;
  }
  const rows = db.prepare(`
    SELECT hc.hostId, hc.hostName, hc.hostEnvironment, hc.hostRole, h.name, h.environment, h.role, hc.status, hc.httpStatus, hc.httpLatencyMs,
      hc.sshStatus, hc.cpuPercent, hc.memoryPercent, hc.diskPercent, hc.dockerStatus,
      hc.evidenceJson, hc.sanitizedError
    FROM host_checks hc
    LEFT JOIN hosts h ON h.id = hc.hostId
    WHERE hc.runId = ?
    ORDER BY CASE hc.status WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END,
      COALESCE(NULLIF(hc.hostName, ''), h.name, hc.hostId)
  `).all(id);
  return {
    check,
    hosts: rows.map((row) => ({
      hostId: row.hostId,
      hostName: row.hostName || row.name || row.hostId,
      environment: row.hostEnvironment || row.environment || "已移除",
      role: row.hostRole || row.role || "server",
      identitySnapshot: Boolean(row.hostName),
      status: row.status,
      summary: sanitizeError(row.sanitizedError || summarizeStatus(row.status)),
      httpStatus: sanitizeError(row.httpStatus || "not checked"),
      httpLatencyMs: row.httpLatencyMs ?? null,
      sshStatus: sanitizeError(row.sshStatus || "not checked"),
      cpuPercent: row.cpuPercent ?? null,
      memoryPercent: row.memoryPercent ?? null,
      diskPercent: row.diskPercent ?? null,
      dockerStatus: sanitizeError(row.dockerStatus || "not checked"),
      evidence: safeEvidenceList(row.evidenceJson)
    }))
  };
}

function runRetention(options = {}) {
  const retentionDays = settingNumber("retentionDays", 7, { min: 1, max: 365 });
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const oldRuns = db.prepare("SELECT id FROM check_runs WHERE finishedAt < ?").all(cutoff).map((row) => row.id);
  let deletedHostChecks = 0;
  let deletedRuns = 0;
  if (oldRuns.length) {
    const deleteHostChecks = db.prepare("DELETE FROM host_checks WHERE runId = ?");
    const deleteRun = db.prepare("DELETE FROM check_runs WHERE id = ?");
    for (const runId of oldRuns) {
      deletedHostChecks += deleteHostChecks.run(runId).changes;
      deletedRuns += deleteRun.run(runId).changes;
    }
  }
  const orphanChecks = db.prepare(`
    DELETE FROM host_checks
    WHERE hostId NOT IN (SELECT id FROM hosts)
  `).run().changes;
  if (options.vacuum) {
    db.exec("VACUUM");
  }
  return {
    retentionDays,
    cutoff,
    deletedRuns,
    deletedHostChecks,
    deletedOrphanHostChecks: orphanChecks,
    vacuumed: Boolean(options.vacuum),
    sizeBytes: statSync(dbPath).size
  };
}

let schedulerTimer = null;

function schedulerSnapshot() {
  const coverage = collectionCoverage(mode, getHosts());
  return {
    enabled: getSetting("schedulerEnabled", "0") === "1",
    lightIntervalMinutes: settingNumber("lightIntervalMinutes", 15, { min: 1, max: 1440 }),
    retentionDays: settingNumber("retentionDays", 7, { min: 1, max: 365 }),
    consecutiveFailures: settingNumber("schedulerConsecutiveFailures", 0, { min: 0, max: 999 }),
    lastRunAt: getSetting("schedulerLastRunAt", "") || null,
    nextRunAt: getSetting("schedulerNextRunAt", "") || null,
    lastOutcome: getSetting("schedulerLastOutcome", "never"),
    lastEventAt: getSetting("schedulerLastEventAt", "") || null,
    lastMessage: getSetting("schedulerLastMessage", "尚未运行自动巡检。"),
    lastErrorCode: getSetting("schedulerLastErrorCode", "") || null,
    lastDurationMs: getSetting("schedulerLastDurationMs", "") === "" ? null : settingNumber("schedulerLastDurationMs", 0, { min: 0, max: 86_400_000 }),
    lastCheckedHosts: settingNumber("schedulerLastCheckedHosts", 0, { min: 0, max: 100_000 }),
    lastSkippedHosts: settingNumber("schedulerLastSkippedHosts", 0, { min: 0, max: 100_000 }),
    coverage
  };
}

function recordSchedulerOutcome({ outcome, message, errorCode = "", durationMs = null, checkedHosts = 0, skippedHosts = 0, attemptedAt = null }) {
  const eventAt = new Date().toISOString();
  setSetting("schedulerLastOutcome", outcome);
  setSetting("schedulerLastEventAt", eventAt);
  setSetting("schedulerLastMessage", message);
  setSetting("schedulerLastErrorCode", errorCode);
  setSetting("schedulerLastDurationMs", durationMs == null ? "" : Math.max(0, Math.trunc(durationMs)));
  setSetting("schedulerLastCheckedHosts", checkedHosts);
  setSetting("schedulerLastSkippedHosts", skippedHosts);
  if (attemptedAt) setSetting("schedulerLastRunAt", attemptedAt);
}

function safeSchedulerFailure(error) {
  const value = String(error?.code || error?.message || "");
  if (/ENOSPC|disk full/i.test(value)) {
    return { code: "LOCAL_STORAGE_FULL", message: "本机存储空间不足，自动巡检无法保存结果；释放本机空间后立即验证一次。" };
  }
  if (/SQLITE_BUSY|database is locked/i.test(value)) {
    return { code: "LOCAL_HISTORY_BUSY", message: "本地检查记录暂时被占用；确认没有重复运行 LocalOps 后立即验证一次。" };
  }
  return { code: "SCHEDULER_RUNTIME_FAILURE", message: "自动巡检流程未完成；本次没有写入不完整结果，下一次会按退避间隔重试。" };
}

function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  setSetting("schedulerNextRunAt", "");
}

async function executeSchedulerCycle(trigger = "scheduled") {
  const attemptedAt = new Date().toISOString();
  try {
    const previousFailures = settingNumber("schedulerConsecutiveFailures", 0, { min: 0, max: 999 });
    const result = await runLightCheck({ trigger });
    setSetting("schedulerConsecutiveFailures", "0");
    let maintenanceWarning = null;
    try {
      runRetention();
    } catch (error) {
      maintenanceWarning = safeSchedulerFailure(error);
      console.error(`Scheduled retention failed: ${error?.message || error}`);
    }
    recordSchedulerOutcome({
      outcome: maintenanceWarning ? "maintenance-warning" : previousFailures > 0 ? "recovered" : "succeeded",
      message: maintenanceWarning
        ? `${result.summary} 但本地历史清理未完成；巡检证据仍有效。${maintenanceWarning.message}`
        : previousFailures > 0 ? `自动巡检已恢复。${result.summary}` : result.summary,
      errorCode: maintenanceWarning ? "LOCAL_HISTORY_MAINTENANCE" : "",
      durationMs: result.durationMs,
      checkedHosts: result.coverage.collectible,
      skippedHosts: result.coverage.blocked,
      attemptedAt
    });
  } catch (error) {
    if (error?.code === "CHECK_ALREADY_RUNNING") {
      recordSchedulerOutcome({
        outcome: "deferred",
        message: "已有巡检正在运行，本次自动巡检已安全顺延；没有重复发起网络请求。",
        errorCode: "CHECK_ALREADY_RUNNING",
        attemptedAt
      });
      return schedulerSnapshot();
    }
    if (error?.code === "NO_COLLECTIBLE_EVIDENCE") {
      setSetting("schedulerEnabled", "0");
      setSetting("schedulerConsecutiveFailures", "0");
      recordSchedulerOutcome({
        outcome: "stopped-no-evidence",
        message: "没有可用证据来源，自动巡检已停止；补充 Health URL 或显式启用只读 SSH 后再开启。",
        errorCode: "NO_COLLECTIBLE_EVIDENCE",
        attemptedAt
      });
      stopScheduler();
      return schedulerSnapshot();
    }
    const failures = settingNumber("schedulerConsecutiveFailures", 0, { min: 0, max: 999 }) + 1;
    const safeFailure = safeSchedulerFailure(error);
    setSetting("schedulerConsecutiveFailures", String(failures));
    recordSchedulerOutcome({ outcome: "failed", message: safeFailure.message, errorCode: safeFailure.code, attemptedAt });
    console.error(`Scheduled light check failed: ${error?.message || error}`);
  }
  return schedulerSnapshot();
}

function scheduleNextLightCheck(delayMs) {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
  }
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  setSetting("schedulerNextRunAt", nextRunAt);
  schedulerTimer = setTimeout(async () => {
    schedulerTimer = null;
    await executeSchedulerCycle("scheduled");
    if (getSetting("schedulerEnabled", "0") === "1") {
      const snapshot = schedulerSnapshot();
      const backoff = Math.min(Math.max(snapshot.consecutiveFailures, 1), 3);
      scheduleNextLightCheck(snapshot.lightIntervalMinutes * backoff * 60 * 1000);
    }
  }, Math.max(1000, delayMs));
  return schedulerSnapshot();
}

function configureScheduler(input = {}) {
  const enabling = input.enabled === true || (input.enabled == null && schedulerSnapshot().enabled);
  const coverage = collectionCoverage(mode, getHosts());
  if (enabling && coverage.collectible === 0) {
    throw new NoCollectibleEvidenceError(coverage, "all");
  }
  if (input.lightIntervalMinutes != null) {
    setSetting("lightIntervalMinutes", settingNumberFromInput(input.lightIntervalMinutes, 15, 1, 1440));
  }
  if (input.retentionDays != null) {
    setSetting("retentionDays", settingNumberFromInput(input.retentionDays, 7, 1, 365));
  }
  if (input.enabled != null) {
    setSetting("schedulerEnabled", input.enabled ? "1" : "0");
  }
  const snapshot = schedulerSnapshot();
  if (snapshot.enabled) {
    return scheduleNextLightCheck(snapshot.lightIntervalMinutes * 60 * 1000);
  }
  stopScheduler();
  return schedulerSnapshot();
}

async function runSchedulerNow() {
  const snapshot = schedulerSnapshot();
  if (!snapshot.enabled) {
    const error = new Error("自动巡检尚未启用。请先确认频率与证据覆盖，再保存巡检配置。");
    error.code = "SCHEDULER_NOT_ENABLED";
    error.httpStatus = 409;
    throw error;
  }
  stopScheduler();
  await executeSchedulerCycle("scheduled-manual");
  const result = schedulerSnapshot();
  if (result.enabled) {
    const backoff = Math.min(Math.max(result.consecutiveFailures, 1), 3);
    return scheduleNextLightCheck(result.lightIntervalMinutes * backoff * 60 * 1000);
  }
  return result;
}

function reconcileSchedulerCoverage() {
  const snapshot = schedulerSnapshot();
  if (!snapshot.enabled || snapshot.coverage.collectible > 0) return snapshot;
  setSetting("schedulerEnabled", "0");
  setSetting("schedulerConsecutiveFailures", "0");
  recordSchedulerOutcome({
    outcome: "stopped-no-evidence",
    message: "最后一个可用证据来源已移除，自动巡检已停止；原有检查结果保持不变。",
    errorCode: "NO_COLLECTIBLE_EVIDENCE"
  });
  stopScheduler();
  return schedulerSnapshot();
}

function settingNumberFromInput(value, fallback, min, max) {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return String(Math.min(Math.max(normalized, min), max));
}

function reportPercent(value) {
  return value == null ? "未采集" : `${value}%`;
}

function currentReport(snapshot = statusSnapshot(latestHostChecks())) {
  const hosts = snapshot.hosts;
  const counts = snapshot.counts;
  const suspectHosts = hosts.filter((item) => item.status !== "healthy");
  const configuredHttpHosts = hosts.filter((item) => item.healthUrl && item.status !== "unknown");
  const allHttpFailed = configuredHttpHosts.length > 0 && configuredHttpHosts.every((item) => !/^2\d\d|3\d\d/.test(item.httpStatus));
  const lines = [];
  lines.push(`LocalOps Desk 诊断报告`);
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push(`采集模式：${mode}`);
  lines.push(`最近观测：${snapshot.observedAt || "尚未巡检"}；证据有效期：${Math.round(snapshot.staleAfterMs / 60000)} 分钟`);
  lines.push(`状态统计：正常 ${counts.healthy} / 关注 ${counts.warning} / 异常 ${counts.critical} / 未知 ${counts.unknown}`);
  lines.push(`优先关注：${suspectHosts.length ? suspectHosts.map((item) => `${item.name}(${item.status})`).join(", ") : "暂无"}`);
  if (allHttpFailed) {
    lines.push("全局提示：所有具备新鲜证据的 HTTP 健康检查都失败，先排查本机网络、代理、DNS 或运行环境限制，再判断远端整体故障。");
  }
  lines.push("");
  for (const hostItem of hosts) {
    lines.push(`- ${hostItem.name} [${hostItem.status}]`);
    lines.push(`  HTTP: ${hostItem.httpStatus}${hostItem.httpLatencyMs == null ? "" : `, ${hostItem.httpLatencyMs}ms`}; SSH: ${hostItem.sshStatus}; Docker: ${hostItem.dockerStatus}`);
    lines.push(`  资源: CPU ${reportPercent(hostItem.cpuPercent)}, 内存 ${reportPercent(hostItem.memoryPercent)}, 磁盘 ${reportPercent(hostItem.diskPercent)}`);
    lines.push(`  摘要: ${hostItem.summary}`);
  }
  lines.push("");
  lines.push("判断矩阵：HTTP 失败且 SSH 可用时优先查应用/Nginx/Docker/ALB/依赖；HTTP 正常但 SSH 异常时优先查管理通道；两者都失败时再考虑实例、网络、安全组或本地出口。");
  lines.push("建议：先处理 red/critical，再处理 yellow/warning；任何重启、迁移、DNS/TLS、对象或数据操作都必须走单独授权。");
  return lines.join("\n");
}

function dryRunAction(input) {
  const hostId = input.hostId || "unknown-host";
  const actionKey = input.actionKey || "inspect-service";
  const supportedActions = new Set(["inspect-service", "reload-nginx", "restart-compose-service"]);
  if (!supportedActions.has(actionKey)) {
    throw new InputValidationError("actionKey must be inspect-service, reload-nginx, or restart-compose-service.");
  }
  const hostItem = getHosts().find((item) => item.id === hostId);
  if (!hostItem) {
    const error = new Error(`Host not found: ${hostId}`);
    error.code = "HOST_NOT_FOUND";
    error.httpStatus = 404;
    throw error;
  }
  const practice = isManagedOfflineDemoHost(hostItem);
  const ssh = actionKey === "inspect-service" && !practice
    ? validateSshAlias(hostItem.sshAlias, { allowEmpty: false })
    : "<ssh-alias>";

  const plans = {
    "inspect-service": {
      actionKey,
      riskTier: "read-only",
      title: `只读诊断：${hostItem.name}`,
      executionState: practice ? "blocked-template" : "read-only-ready",
      copyAllowed: !practice,
      safetyBoundary: practice
        ? "离线练习只展示命令结构，不包含可连接目标。"
        : "仅包含白名单只读命令；复制后仍由用户在独立终端决定是否运行。",
      commands: readOnlySshPreview(ssh),
      verification: ["确认命令只读。", "确认输出经过脱敏。", "确认不会读取 .env 或打印密钥。"],
      ...(practice ? { blockedReason: "离线练习没有 SSH 目标，因此只展示不可执行的命令结构。" } : {})
    },
    "reload-nginx": {
      actionKey,
      riskTier: "medium",
      title: `Reload Nginx：${hostItem.name}`,
      executionState: "blocked-template",
      copyAllowed: false,
      safetyBoundary: "变更类预案固定使用占位符，不携带真实 SSH alias，也不提供一键复制。",
      commands: ["ssh <ssh-alias> 'sudo nginx -t'", "ssh <ssh-alias> 'sudo systemctl reload nginx'"],
      verification: ["先通过 nginx -t。", "reload 后检查 HTTP health。", "失败时不继续执行后续动作。"],
      blockedReason: "MVP 只生成 dry-run，不执行真实 reload。"
    },
    "restart-compose-service": {
      actionKey,
      riskTier: "high",
      title: `重启 Compose 服务：${hostItem.name}`,
      executionState: "blocked-template",
      copyAllowed: false,
      safetyBoundary: "重启预案只显示占位符结构；必须在独立授权、版本和回滚核对后重新生成。",
      commands: [
        "ssh <ssh-alias> 'cd /opt/<app>/compose && docker compose ps'",
        "ssh <ssh-alias> 'cd /opt/<app>/compose && docker compose restart <service>'"
      ],
      verification: ["重启前记录当前 release。", "重启后检查 readiness。", "保留回滚边界。"],
      blockedReason: "MVP 禁止真实重启；后续需二次确认和审计。"
    }
  };

  return plans[actionKey];
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
      { method: "GET", path: "/api/hosts", description: "List local host configuration." },
      { method: "POST", path: "/api/hosts", description: "Create a host configuration without secrets." },
      { method: "PUT", path: "/api/hosts/:id", description: "Update a host configuration without secrets." },
      { method: "DELETE", path: "/api/hosts/:id", description: "Delete a local host configuration." },
      { method: "POST", path: "/api/checks/light", description: "Run a bounded light check." },
      { method: "POST", path: "/api/checks/light/:hostId", description: "Run a bounded light check for one host." },
      { method: "GET", path: "/api/checks/:id", description: "Read one sanitized local check receipt and its host evidence." },
      { method: "GET", path: "/api/scheduler", description: "Read local scheduler state." },
      { method: "PUT", path: "/api/scheduler", description: "Configure local scheduler interval and retention." },
      { method: "POST", path: "/api/scheduler/run-now", description: "Run one scheduler-owned verification cycle now." },
      { method: "GET", path: "/api/startup", description: "Read current-user LocalOps startup state without filesystem paths." },
      { method: "PUT", path: "/api/startup", description: "Explicitly enable or disable the owned current-user LocalOps startup entry." },
      { method: "PUT", path: "/api/pet-window/:sessionId", description: "Explicitly keep the active Windows Edge pet above other windows or restore it." },
      { method: "POST", path: "/api/maintenance/retention", description: "Apply local SQLite retention cleanup." },
      { method: "POST", path: "/api/actions/dry-run", description: "Generate a non-mutating action plan." },
      { method: "GET", path: "/api/reports/current", description: "Read current diagnostic report." },
      { method: "GET", path: "/api/agent/status", description: "Read status, recent checks, and current report in one agent-friendly payload." }
    ]
  };
}

const server = createServer(async (req, res) => {
  try {
    if (!validateBrowserBoundary(req, res)) return;
    if (req.method === "OPTIONS") return json(res, {});
    const url = new URL(req.url || "/", `http://${host}:${port}`);

    if (!url.pathname.startsWith("/api/")) {
      return serveStatic(res, url.pathname);
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      const hosts = latestHostChecks();
      return json(res, statusSnapshot(hosts));
    }
    if (req.method === "GET" && url.pathname === "/api/pet-presence") {
      return json(res, { presence: petPresence.summary() });
    }
    const petPresenceMatch = url.pathname.match(/^\/api\/pet-presence\/([^/]+)$/);
    if (petPresenceMatch && req.method === "GET") {
      return json(res, { presence: petPresence.read(decodeURIComponent(petPresenceMatch[1])) });
    }
    if (petPresenceMatch && req.method === "PUT") {
      const input = await readBody(req);
      return json(res, { presence: petPresence.update(decodeURIComponent(petPresenceMatch[1]), input.state) });
    }
    const petWindowMatch = url.pathname.match(/^\/api\/pet-window\/([^/]+)$/);
    if (petWindowMatch && req.method === "PUT") {
      const sessionId = decodeURIComponent(petWindowMatch[1]);
      if (!petPresence.read(sessionId).present) {
        return json(res, { error: "PET_WINDOW_SESSION_INACTIVE", message: "The LocalOps pet session is not active." }, 409);
      }
      const input = await readBody(req);
      if (typeof input.topmost !== "boolean") throw new InputValidationError("topmost must be a boolean.");
      const capability = petWindowCapability();
      if (!capability.supported) return json(res, { window: { ...capability, topmost: false } }, 400);
      return json(res, { window: await setPetWindowTopmost({ root, topmost: input.topmost }) });
    }
    if (req.method === "GET" && url.pathname === "/api/hosts") {
      return json(res, { hosts: getHosts() });
    }
    if (req.method === "POST" && url.pathname === "/api/practice/offline") {
      await readBody(req);
      return json(res, { practice: installOfflinePractice() }, 201);
    }
    if (req.method === "DELETE" && url.pathname === "/api/practice/offline") {
      await readBody(req);
      return json(res, { practice: removeOfflinePractice() });
    }
    if (req.method === "POST" && url.pathname === "/api/hosts") {
      return json(res, { host: createHost(await readBody(req)) }, 201);
    }
    const hostMatch = url.pathname.match(/^\/api\/hosts\/([^/]+)$/);
    if (hostMatch && req.method === "PUT") {
      return json(res, { host: updateHost(decodeURIComponent(hostMatch[1]), await readBody(req)) });
    }
    if (hostMatch && req.method === "DELETE") {
      return json(res, deleteHost(decodeURIComponent(hostMatch[1])));
    }
    if (req.method === "GET" && url.pathname === "/api/checks") {
      return json(res, { checks: recentChecks() });
    }
    const checkDetailMatch = url.pathname.match(/^\/api\/checks\/(\d+)$/);
    if (checkDetailMatch && req.method === "GET") {
      return json(res, { detail: checkDetail(Number(checkDetailMatch[1])) });
    }
    if (req.method === "POST" && url.pathname === "/api/checks/light") {
      return json(res, await runLightCheck(await readBody(req)));
    }
    const lightHostMatch = url.pathname.match(/^\/api\/checks\/light\/([^/]+)$/);
    if (lightHostMatch && req.method === "POST") {
      return json(res, await runLightCheck({
        ...(await readBody(req)),
        hostId: decodeURIComponent(lightHostMatch[1]),
        trigger: "manual-host"
      }));
    }
    if (req.method === "POST" && url.pathname === "/api/checks/deep") {
      return json(res, {
        mode: "dry-run",
        summary: "Deep checks are deferred in MVP. Planned checks: DB size summary, Docker resource summary, recent error digest, retention audit."
      });
    }
    if (req.method === "GET" && url.pathname === "/api/scheduler") {
      return json(res, { scheduler: schedulerSnapshot() });
    }
    if (req.method === "PUT" && url.pathname === "/api/scheduler") {
      return json(res, { scheduler: configureScheduler(await readBody(req)) });
    }
    if (req.method === "POST" && url.pathname === "/api/scheduler/run-now") {
      await readBody(req);
      return json(res, { scheduler: await runSchedulerNow() });
    }
    if (req.method === "GET" && url.pathname === "/api/startup") {
      return json(res, { startup: publicStartupState(await startupEntrySnapshot({ root })) });
    }
    if (req.method === "PUT" && url.pathname === "/api/startup") {
      const input = await readBody(req);
      if (typeof input.enabled !== "boolean") {
        throw new InputValidationError("enabled must be a boolean.");
      }
      const startup = await configureStartupEntry({ root }, input.enabled);
      return json(res, { startup: publicStartupState(startup) });
    }
    if (req.method === "POST" && url.pathname === "/api/maintenance/retention") {
      return json(res, { retention: runRetention(await readBody(req)) });
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
    if (req.method === "GET" && url.pathname === "/api/agent/status") {
      const hosts = latestHostChecks();
      const snapshot = statusSnapshot(hosts);
      return json(res, {
        ...agentSafeSnapshot(snapshot),
        scheduler: schedulerSnapshot(),
        checks: recentChecks().slice(0, 5),
        report: currentReport(snapshot)
      });
    }

    return json(res, { error: "Not found" }, 404);
  } catch (error) {
    const status = Number(error?.httpStatus) || 500;
    return json(res, {
      error: error?.code || "REQUEST_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
      ...(error?.runId ? { runId: error.runId, scope: error.scope } : {}),
      ...(error?.coverage ? { coverage: error.coverage } : {})
    }, status);
  }
});

server.listen(port, host, () => {
  const scheduler = reconcileSchedulerCoverage();
  if (scheduler.enabled) {
    scheduleNextLightCheck(scheduler.lightIntervalMinutes * 60 * 1000);
  }
  const address = server.address();
  const listeningPort = address && typeof address === "object" ? address.port : port;
  console.log(`LocalOps API listening on http://${host}:${listeningPort} (${mode})`);
});
