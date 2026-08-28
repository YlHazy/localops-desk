import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifyCollectedStatus, resourceSignalStatus } from "../shared/evidence-judgment.mjs";
import { validateSshAlias } from "./input-validation.mjs";
import { deepSshCommand } from "./deep-diagnostics.mjs";
import { nginxActionCommand } from "./safe-actions.mjs";
import { createConcurrencyGate } from "./bounded-concurrency.mjs";

const execFileAsync = promisify(execFile);
const withOutboundPermit = createConcurrencyGate(3);

export function collectedSummary(status, httpStatus, resourceStatus) {
  if (status === "healthy") return "HTTP 与 SSH 只读检查正常。";
  if (httpStatus === "critical") return "HTTP 健康检查明确失败，需要先定位入口或上游依赖。";
  if (httpStatus === "warning") return "HTTP 健康检查返回非成功状态，需要先复核入口证据。";
  if (resourceStatus === "critical") return "HTTP 可用，但资源使用率进入高风险区间。";
  if (resourceStatus === "warning") return "HTTP 可用，但资源使用率接近关注阈值。";
  if (status === "warning") return "HTTP 正常但 SSH 管理通道或资源检查需要关注。";
  return "HTTP 或 SSH 检查异常，需要结合证据排查。";
}

function uncollectedSshSummary(httpStatus, sshEnabled, hasSshAlias) {
  if (httpStatus === "healthy") {
    if (hasSshAlias && !sshEnabled) return "HTTP 健康检查正常；SSH alias 已保存但当前未启用，资源状态未知。";
    return "HTTP 健康检查正常；未采集 SSH 与资源证据。";
  }
  if (httpStatus === "critical") return "HTTP 健康检查失败，优先确认公网服务链路。";
  if (httpStatus === "warning") return "HTTP 健康检查返回非成功状态，需要先复核入口证据。";
  if (hasSshAlias && !sshEnabled) return "SSH alias 已保存但当前未启用；未配置 Health URL，状态保持未知。";
  return "尚无可用证据来源，状态保持未知。";
}

export function sshOnlyCollectedSummary(sshStatus, resourceStatus) {
  if (sshStatus !== "ok") return "只读 SSH 检查失败；未配置 Health URL，网页/API 仍保持未知。";
  if (resourceStatus === "critical") return "只读 SSH 已完成，但资源使用率进入高风险区间；网页/API 未配置。";
  if (resourceStatus === "warning") return "只读 SSH 已完成，但资源使用率接近关注阈值；网页/API 未配置。";
  return "只读 SSH 已完成；未配置 Health URL，网页/API 保持未知。";
}

export const demoHosts = [
  {
    id: "localops-sample-healthy",
    name: "示例 · 正常服务",
    environment: "离线练习",
    role: "虚构演示对象",
    sshAlias: "",
    healthUrl: "",
    composeProject: "",
    tags: ["localops:offline-demo"]
  },
  {
    id: "localops-sample-warning",
    name: "示例 · 需要关注",
    environment: "离线练习",
    role: "虚构演示对象",
    sshAlias: "",
    healthUrl: "",
    composeProject: "",
    tags: ["localops:offline-demo"]
  },
  {
    id: "localops-sample-unknown",
    name: "示例 · 尚未观测",
    environment: "离线练习",
    role: "虚构演示对象",
    sshAlias: "",
    healthUrl: "",
    composeProject: "",
    tags: ["localops:offline-demo"]
  }
];

const offlineDemoProfiles = {
  "localops-sample-healthy": {
    status: "healthy",
    httpStatus: "simulated 200 ready",
    httpLatencyMs: 24,
    sshStatus: "simulated ok",
    cpuPercent: 18,
    load1: 0.18,
    load5: 0.24,
    load15: 0.2,
    memoryPercent: 46,
    diskPercent: 52,
    uptimeText: "12 天 4 小时",
    containerCount: 4,
    unhealthyContainerCount: 0,
    dockerStatus: "compose healthy",
    summary: "离线演示：服务正常，资源压力正常。",
    evidence: ["这是本机离线生成的演示证据。", "没有发起 HTTP、SSH 或其他网络请求。"]
  },
  "localops-sample-warning": {
    status: "warning",
    httpStatus: "simulated 200 ready",
    httpLatencyMs: 37,
    sshStatus: "simulated ok",
    cpuPercent: 31,
    load1: 1.12,
    load5: 0.98,
    load15: 0.71,
    memoryPercent: 68,
    diskPercent: 76,
    uptimeText: "28 天 7 小时",
    containerCount: 6,
    unhealthyContainerCount: 0,
    dockerStatus: "compose healthy",
    summary: "离线演示：服务可用，但磁盘接近关注阈值。",
    evidence: ["这是本机离线生成的演示证据。", "磁盘 76% 仅用于展示关注状态。"]
  },
  "localops-sample-unknown": {
    status: "unknown",
    httpStatus: "simulated not observed",
    httpLatencyMs: null,
    sshStatus: "simulated disabled",
    cpuPercent: null,
    load1: null,
    load5: null,
    load15: null,
    memoryPercent: null,
    diskPercent: null,
    uptimeText: null,
    containerCount: null,
    unhealthyContainerCount: null,
    dockerStatus: "not checked",
    summary: "离线演示：没有观测证据，状态保持未知。",
    evidence: ["这是本机离线生成的演示证据。", "未知状态不会被伪装成正常。"]
  }
};

export const readOnlySshCommands = Object.freeze({
  uptime: "uptime",
  cpu: "LC_ALL=C top -bn1 | head -n 5",
  memory: "free -m",
  disk: "df -P /",
  docker: "docker ps --format '{{.Names}} {{.Status}}'",
  dockerSudo: "sudo -n docker ps --format '{{.Names}} {{.Status}}'"
});

export function readOnlySshPreview(sshAlias) {
  const target = sshAlias === "<ssh-alias>"
    ? sshAlias
    : validateSshAlias(sshAlias, { allowEmpty: false });
  return Object.values(readOnlySshCommands).map((command) => {
    const remoteCommand = /[|<>&;]/.test(command) || command.includes("'") ? `"${command}"` : command;
    return `ssh ${target} ${remoteCommand}`;
  });
}

function statusFromHttp(ok, statusCode) {
  if (ok) return "healthy";
  if (statusCode === 0) return "unknown";
  if (statusCode >= 500) return "critical";
  return "warning";
}

async function collectHttp(host, timeoutMs = 5000) {
  if (!host.healthUrl) {
    return {
      status: "unknown",
      httpStatus: "no health url",
      httpLatencyMs: null,
      evidence: ["未配置 HTTP 健康检查 URL。"]
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await withOutboundPermit(async () => {
      const result = await fetch(host.healthUrl, {
        method: "GET",
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": "LocalOps-Desk/0.1" }
      });
      await result.body?.cancel();
      return { ok: result.ok, status: result.status, statusText: result.statusText };
    });
    const latency = Date.now() - startedAt;
    clearTimeout(timer);
    return {
      status: statusFromHttp(response.ok, response.status),
      httpStatus: `${response.status} ${response.statusText || "response"}`.trim(),
      httpLatencyMs: latency,
      evidence: [`HTTP ${response.status} from the configured health endpoint in ${latency}ms.`]
    };
  } catch (error) {
    clearTimeout(timer);
    const latency = Date.now() - startedAt;
    const message = error?.name === "AbortError" ? "timeout" : sanitizeError(error?.message || "request failed");
    return {
      status: "critical",
      httpStatus: message,
      httpLatencyMs: latency,
      evidence: [`HTTP probe failed for the configured health endpoint: ${message} after ${latency}ms.`]
    };
  }
}

export function sanitizeError(message) {
  return String(message)
    .replace(/(password|passwd|pwd|token|secret|access[_-]?key|key)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/:\/\/([^:\s/]+):([^@\s/]+)@/g, "://$1:<redacted>@")
    .replace(/Could not resolve hostname ([^:\s]+):[\s\S]*/i, "Could not resolve hostname $1 (SSH alias not found or DNS unresolved).");
}

function trimOutput(output, maxChars = 2000) {
  const cleaned = sanitizeError(output || "").replace(/\r/g, "").trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}\n<truncated>` : cleaned;
}

async function runSshReadOnly(host, commandKey, timeoutMs = 5000) {
  const command = readOnlySshCommands[commandKey];
  if (!command) {
    throw new Error(`SSH command is not allowlisted: ${commandKey}`);
  }
  if (!host.sshAlias) {
    throw new Error("SSH alias is not configured.");
  }
  const sshAlias = validateSshAlias(host.sshAlias, { allowEmpty: false });
  const result = await withOutboundPermit(() => execFileAsync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    sshAlias,
    command
  ], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 128,
    windowsHide: true
  }));
  return trimOutput(`${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`);
}

function parseMemoryPercent(output) {
  const line = output.split("\n").find((item) => item.toLowerCase().startsWith("mem:"));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const total = Number(parts[1]);
  const used = Number(parts[2]);
  return total > 0 ? Math.round((used / total) * 100) : null;
}

function parseDiskPercent(output) {
  const line = output.split("\n").find((item) => item.includes("%") && item.includes("/"));
  const match = line?.match(/\s(\d+)%\s+/);
  return match ? Number(match[1]) : null;
}

export function parseCpuPercent(output) {
  const idle = String(output || "").match(/%?Cpu(?:\(s\)|\d*)[^\n]*?(\d+(?:\.\d+)?)\s*id\b/i)?.[1];
  if (idle == null) return null;
  return Math.max(0, Math.min(100, Math.round((100 - Number(idle)) * 10) / 10));
}

export function parseUptimeLoad(output) {
  const text = String(output || "").replace(/\r/g, "").split("\n")[0]?.trim() || "";
  const load = text.match(/load averages?:\s*(\d+(?:\.\d+)?)[,\s]+\s*(\d+(?:\.\d+)?)[,\s]+\s*(\d+(?:\.\d+)?)/i);
  const uptimeText = text.match(/\bup\s+(.+?),\s+\d+\s+users?,\s+load averages?:/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
  return {
    load1: load ? Number(load[1]) : null,
    load5: load ? Number(load[2]) : null,
    load15: load ? Number(load[3]) : null,
    uptimeText
  };
}

function parseDockerInventory(output, available) {
  if (!available) return { containerCount: null, unhealthyContainerCount: null };
  const lines = String(output || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    containerCount: lines.length,
    unhealthyContainerCount: lines.filter((line) => /unhealthy|restarting|exited|dead/i.test(line)).length
  };
}

async function collectSshReadOnly(host) {
  const evidence = [];
  try {
    const [uptime, cpu, memory, disk, dockerResult] = await Promise.all([
      runSshReadOnly(host, "uptime", 5000),
      runSshReadOnly(host, "cpu", 5000).catch(() => ""),
      runSshReadOnly(host, "memory", 5000),
      runSshReadOnly(host, "disk", 5000),
      runSshReadOnly(host, "docker", 5000)
        .then((output) => ({ output, access: "direct" }))
        .catch(() => runSshReadOnly(host, "dockerSudo", 5000)
          .then((output) => ({ output, access: "sudo-readonly" })))
        .catch((error) => ({ output: `docker unavailable: ${sanitizeError(error.message)}`, access: "unavailable" }))
    ]);
    const docker = dockerResult.output;
    const load = parseUptimeLoad(uptime);
    const containers = parseDockerInventory(docker, dockerResult.access !== "unavailable");
    evidence.push(`SSH uptime: ${uptime.split("\n")[0]}`);
    if (cpu) evidence.push(`SSH CPU: ${cpu.split("\n").find((line) => /Cpu/i.test(line)) || "top returned no CPU row"}`);
    evidence.push(`SSH memory: ${memory.split("\n")[0]}; ${memory.split("\n")[1] || ""}`.trim());
    evidence.push(`SSH disk: ${disk.split("\n").slice(0, 2).join(" | ")}`);
    evidence.push(`SSH docker: ${docker.split("\n").slice(0, 4).join(" | ") || "no docker output"}`);
    if (dockerResult.access === "sudo-readonly") {
      evidence.push("Docker evidence used the allowlisted sudo -n read-only fallback after direct access was denied.");
    }
    return {
      sshStatus: "ok",
      cpuPercent: parseCpuPercent(cpu),
      ...load,
      memoryPercent: parseMemoryPercent(memory),
      diskPercent: parseDiskPercent(disk),
      ...containers,
      dockerStatus: dockerResult.access === "unavailable" ? "docker unavailable" : containers.unhealthyContainerCount ? "docker unhealthy containers" : "docker checked",
      evidence
    };
  } catch (error) {
    return {
      sshStatus: sanitizeError(error.message || "ssh failed"),
      cpuPercent: null,
      load1: null,
      load5: null,
      load15: null,
      memoryPercent: null,
      diskPercent: null,
      uptimeText: null,
      containerCount: null,
      unhealthyContainerCount: null,
      dockerStatus: "not checked",
      evidence: [`SSH read-only collector failed: ${sanitizeError(error.message || "unknown error")}`]
    };
  }
}

export async function collectHost(host, options) {
  const demoProfile = Array.isArray(host.tags) && host.tags.includes("localops:offline-demo")
    ? offlineDemoProfiles[host.id]
    : null;
  if (demoProfile) {
    return {
      hostId: host.id,
      ...demoProfile,
      evidence: [...demoProfile.evidence]
    };
  }
  const http = await collectHttp(host, options.httpTimeoutMs);
  const profile = {
    sshStatus: "simulated disabled",
    cpuPercent: null,
    load1: null,
    load5: null,
    load15: null,
    memoryPercent: null,
    diskPercent: null,
    uptimeText: null,
    containerCount: null,
    unhealthyContainerCount: null,
    dockerStatus: "not checked",
    summary: "真实 SSH 未启用，仅完成 HTTP 健康检查。",
    evidence: ["LOCALOPS_ENABLE_SSH 未开启。", "资源和 Docker 指标将在只读 SSH collector 阶段启用。"]
  };

  if (options.mode === "ssh-enabled" && host.sshAlias?.trim()) {
    const ssh = await collectSshReadOnly(host);
    const resourceStatus = resourceSignalStatus(ssh);
    const status = classifyCollectedStatus(http.status, ssh);
    return {
      hostId: host.id,
      status,
      httpStatus: http.httpStatus,
      httpLatencyMs: http.httpLatencyMs,
      sshStatus: ssh.sshStatus,
      cpuPercent: ssh.cpuPercent,
      load1: ssh.load1,
      load5: ssh.load5,
      load15: ssh.load15,
      memoryPercent: ssh.memoryPercent,
      diskPercent: ssh.diskPercent,
      uptimeText: ssh.uptimeText,
      containerCount: ssh.containerCount,
      unhealthyContainerCount: ssh.unhealthyContainerCount,
      dockerStatus: ssh.dockerStatus,
      summary: host.healthUrl?.trim()
        ? collectedSummary(status, http.status, resourceStatus)
        : sshOnlyCollectedSummary(ssh.sshStatus, resourceStatus),
      evidence: [
        ...http.evidence,
        ...ssh.evidence,
        ...(resourceStatus === "unknown" ? [] : ["资源分级使用固定阈值：磁盘 75%/90%，CPU 与内存 85%/95%（关注/高风险）。"]),
        "SSH collector 使用固定 allowlist 命令、BatchMode、超时和输出脱敏。"
      ]
    };
  }

  const sshEnabled = options.mode === "ssh-enabled";
  const hasSshAlias = Boolean(host.sshAlias?.trim());
  const status = http.status;

  return {
    hostId: host.id,
    status,
    httpStatus: http.httpStatus,
    httpLatencyMs: http.httpLatencyMs,
    sshStatus: sshEnabled ? "not configured" : profile.sshStatus,
    cpuPercent: profile.cpuPercent,
    load1: profile.load1,
    load5: profile.load5,
    load15: profile.load15,
    memoryPercent: profile.memoryPercent,
    diskPercent: profile.diskPercent,
    uptimeText: profile.uptimeText,
    containerCount: profile.containerCount,
    unhealthyContainerCount: profile.unhealthyContainerCount,
    dockerStatus: profile.dockerStatus,
    summary: uncollectedSshSummary(http.status, sshEnabled, hasSshAlias),
    evidence: [
      ...http.evidence,
      ...(sshEnabled
        ? ["此服务器未配置 SSH alias；没有执行 SSH 命令，资源与 Docker 保持未知。"]
        : profile.evidence)
    ]
  };
}

export async function runDeepSshReadOnly(host, commandKey, containerName = "", timeoutMs = 20000) {
  if (!host.sshAlias) throw new Error("SSH alias is not configured.");
  const sshAlias = validateSshAlias(host.sshAlias, { allowEmpty: false });
  const command = deepSshCommand(commandKey, containerName);
  const result = await withOutboundPermit(() => execFileAsync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    sshAlias,
    command
  ], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 128,
    windowsHide: true
  }));
  return trimOutput(`${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`, 4000);
}

export async function runNginxActionStep(host, step, timeoutMs = 20000) {
  if (!host.sshAlias) throw new Error("SSH alias is not configured.");
  const sshAlias = validateSshAlias(host.sshAlias, { allowEmpty: false });
  const command = nginxActionCommand(step);
  const result = await withOutboundPermit(() => execFileAsync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    sshAlias,
    command
  ], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 128,
    windowsHide: true
  }));
  return trimOutput(`${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`, 2000);
}
