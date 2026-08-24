import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateSshAlias } from "./input-validation.mjs";

const execFileAsync = promisify(execFile);

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
    memoryPercent: 46,
    diskPercent: 52,
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
    memoryPercent: 68,
    diskPercent: 76,
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
    memoryPercent: null,
    diskPercent: null,
    dockerStatus: "not checked",
    summary: "离线演示：没有观测证据，状态保持未知。",
    evidence: ["这是本机离线生成的演示证据。", "未知状态不会被伪装成正常。"]
  }
};

export const readOnlySshCommands = Object.freeze({
  uptime: "uptime",
  memory: "free -m",
  disk: "df -P /",
  docker: "docker ps --format '{{.Names}} {{.Status}}'"
});

export function readOnlySshPreview(sshAlias) {
  const target = sshAlias === "<ssh-alias>"
    ? sshAlias
    : validateSshAlias(sshAlias, { allowEmpty: false });
  return Object.values(readOnlySshCommands).map((command) => {
    const remoteCommand = command.includes("'") ? `"${command}"` : command;
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
    const response = await fetch(host.healthUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "user-agent": "LocalOps-Desk/0.1"
      }
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

function sanitizeError(message) {
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
  const result = await execFileAsync("ssh", [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=5",
    sshAlias,
    command
  ], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 128,
    windowsHide: true
  });
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

async function collectSshReadOnly(host) {
  const evidence = [];
  try {
    const [uptime, memory, disk, docker] = await Promise.all([
      runSshReadOnly(host, "uptime", 5000),
      runSshReadOnly(host, "memory", 5000),
      runSshReadOnly(host, "disk", 5000),
      runSshReadOnly(host, "docker", 5000).catch((error) => `docker unavailable: ${sanitizeError(error.message)}`)
    ]);
    evidence.push(`SSH uptime: ${uptime.split("\n")[0]}`);
    evidence.push(`SSH memory: ${memory.split("\n")[0]}; ${memory.split("\n")[1] || ""}`.trim());
    evidence.push(`SSH disk: ${disk.split("\n").slice(0, 2).join(" | ")}`);
    evidence.push(`SSH docker: ${docker.split("\n").slice(0, 4).join(" | ") || "no docker output"}`);
    return {
      sshStatus: "ok",
      memoryPercent: parseMemoryPercent(memory),
      diskPercent: parseDiskPercent(disk),
      dockerStatus: docker.startsWith("docker unavailable") ? "docker unavailable" : "docker checked",
      evidence
    };
  } catch (error) {
    return {
      sshStatus: sanitizeError(error.message || "ssh failed"),
      memoryPercent: null,
      diskPercent: null,
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
    memoryPercent: null,
    diskPercent: null,
    dockerStatus: "not checked",
    summary: "真实 SSH 未启用，仅完成 HTTP 健康检查。",
    evidence: ["LOCALOPS_ENABLE_SSH 未开启。", "资源和 Docker 指标将在只读 SSH collector 阶段启用。"]
  };

  if (options.mode === "ssh-enabled") {
    const ssh = await collectSshReadOnly(host);
    const status = http.status === "critical"
      ? "critical"
      : ssh.sshStatus === "ok"
        ? http.status
        : http.status === "healthy"
          ? "warning"
          : "unknown";
    return {
      hostId: host.id,
      status,
      httpStatus: http.httpStatus,
      httpLatencyMs: http.httpLatencyMs,
      sshStatus: ssh.sshStatus,
      cpuPercent: null,
      memoryPercent: ssh.memoryPercent,
      diskPercent: ssh.diskPercent,
      dockerStatus: ssh.dockerStatus,
      summary: status === "healthy"
        ? "HTTP 与 SSH 只读检查正常。"
        : status === "warning"
          ? "HTTP 正常但 SSH 管理通道或资源检查需要关注。"
          : "HTTP 或 SSH 检查异常，需要结合证据排查。",
      evidence: [
        ...http.evidence,
        ...ssh.evidence,
        "SSH collector 使用固定 allowlist 命令、BatchMode、超时和输出脱敏。"
      ]
    };
  }

  const status = http.status === "healthy" && profile.status === "healthy"
    ? "healthy"
    : http.status === "critical"
      ? "critical"
      : profile.status === "warning" || http.status === "warning"
        ? "warning"
        : profile.status || http.status;

  return {
    hostId: host.id,
    status,
    httpStatus: http.httpStatus,
    httpLatencyMs: http.httpLatencyMs,
    sshStatus: profile.sshStatus,
    cpuPercent: profile.cpuPercent,
    memoryPercent: profile.memoryPercent,
    diskPercent: profile.diskPercent,
    dockerStatus: profile.dockerStatus,
    summary: status === "healthy"
      ? "HTTP 健康检查正常，模拟资源检查正常。"
      : http.status === "critical"
        ? "HTTP 健康检查失败，优先确认公网服务链路。"
        : profile.summary,
    evidence: [...http.evidence, ...profile.evidence]
  };
}
