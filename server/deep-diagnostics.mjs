const CONTAINER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

const deepCommands = Object.freeze({
  disk: "df -P /",
  inode: "df -Pi /",
  dockerUsage: "docker system df",
  containers: "docker ps -a --format '{{.Names}}\\t{{.Status}}'",
  failedUnits: "systemctl --failed --no-legend --plain",
  listening: "ss -lnt"
});

export function redactDiagnosticText(value, maxChars = 1800) {
  const redacted = String(value ?? "")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, "<redacted private key>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "<redacted jwt>")
    .replace(/:\/\/([^:\s/]+):([^@\s/]+)@/g, "://$1:<redacted>@")
    .replace(/(authorization\s*[:=]\s*)([^\s,;]+)/gi, "$1<redacted>")
    .replace(/(["']?(?:password|passwd|pwd|token|secret|access[_-]?key|api[_-]?key|private[_-]?key)["']?\s*[:=]\s*["']?)([^"'\s,;}]+)/gi, "$1<redacted>")
    .replace(/([?&](?:token|secret|access[_-]?key|api[_-]?key)=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\r/g, "")
    .trim();
  return redacted.length > maxChars ? `${redacted.slice(0, maxChars)}\n<truncated>` : redacted;
}

export function deepSshCommand(key, containerName = "") {
  if (key === "logs") {
    const name = String(containerName).trim();
    if (!CONTAINER_NAME_PATTERN.test(name)) throw new Error("Container name is not safe for bounded log collection.");
    return `docker logs --since 15m --tail 80 ${name}`;
  }
  const command = deepCommands[key];
  if (!command) throw new Error(`Deep diagnostic command is not allowlisted: ${key}`);
  return command;
}

function percentFromDf(output) {
  const line = String(output).split("\n").find((item) => /\s\d+%\s+\/$/.test(item.trim()));
  const match = line?.match(/\s(\d+)%\s+\/$/);
  return match ? Number(match[1]) : null;
}

export function parseContainerInventory(output) {
  return redactDiagnosticText(output, 4000)
    .split("\n")
    .slice(0, 40)
    .map((line) => {
      const [name = "", ...statusParts] = line.split(/\t+/);
      const status = statusParts.join(" ").trim();
      return CONTAINER_NAME_PATTERN.test(name.trim()) && status ? { name: name.trim(), status } : null;
    })
    .filter(Boolean);
}

function statusForPercent(value, warning, critical) {
  if (value == null) return "unknown";
  if (value >= critical) return "critical";
  if (value >= warning) return "warning";
  return "healthy";
}

function boundedExcerpt(value, maxLines = 12) {
  return redactDiagnosticText(value)
    .split("\n")
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line) => line.length > 240 ? `${line.slice(0, 240)}…` : line);
}

function offlinePracticeEvidence(hostId, layer) {
  if (hostId !== "localops-sample-warning" || layer !== "resources") return null;
  return {
    state: "complete",
    source: "offline-practice",
    title: "磁盘是唯一需要关注的信号",
    summary: "网页和服务状态正常；离线样例进一步确认了磁盘占用，没有模拟清理或重启。",
    findings: [
      { key: "disk", label: "系统盘", status: "warning", value: "76%", detail: "达到 75% 关注线，尚未进入 90% 高风险线。" },
      { key: "runtime", label: "服务", status: "healthy", value: "运行中", detail: "离线样例没有服务退出或反复重启信号。" }
    ],
    excerpt: [],
    coverage: { attempted: 2, completed: 2, failed: 0 },
    safetyBoundary: "离线生成；没有联网、没有读取日志，也没有执行清理或重启。"
  };
}

function unavailable(reason) {
  return {
    state: "unavailable",
    source: "none",
    title: "没有继续读取服务器内部信息",
    summary: reason,
    findings: [],
    excerpt: [],
    coverage: { attempted: 0, completed: 0, failed: 0 },
    safetyBoundary: "没有执行远程命令，也没有用缺失证据推断原因。"
  };
}

function planForLayer(layer) {
  if (layer === "resources") return ["disk", "inode", "dockerUsage"];
  if (layer === "entry" || layer === "runtime") return ["containers", "failedUnits", "listening"];
  return [];
}

export async function collectDeepEvidence({ host, layer, mode, execute }) {
  const practice = Array.isArray(host.tags) && host.tags.includes("localops:offline-demo");
  if (practice) return offlinePracticeEvidence(host.id, layer) || unavailable("这个离线场景没有对应的深层证据；状态保持未知。");
  if (mode !== "ssh-enabled") return unavailable("当前没有开启只读 SSH，因此只完成了网页/API 层判断。开启后仍只运行固定白名单命令。");
  if (!host.sshAlias?.trim()) return unavailable("这台服务器没有配置 SSH alias，无法读取进程、资源或近期日志。");
  const plan = planForLayer(layer);
  if (plan.length === 0) return unavailable("当前异常发生在连接或管理通道，继续发送 SSH 命令不能提供可信证据。");

  const settled = await Promise.allSettled(plan.map(async (key) => ({ key, output: await execute({ key }) })));
  const outputs = new Map();
  let failed = 0;
  for (const item of settled) {
    if (item.status === "fulfilled") outputs.set(item.value.key, redactDiagnosticText(item.value.output, 4000));
    else failed += 1;
  }
  const findings = [];
  let excerpt = [];
  let logAttempted = false;
  let logCompleted = false;

  if (layer === "resources") {
    const disk = percentFromDf(outputs.get("disk"));
    const inode = percentFromDf(outputs.get("inode"));
    findings.push({ key: "disk", label: "系统盘", status: statusForPercent(disk, 75, 90), value: disk == null ? "未取得" : `${disk}%`, detail: disk == null ? "磁盘命令没有返回可识别结果。" : "固定阈值：75% 关注，90% 高风险。" });
    findings.push({ key: "inode", label: "文件数量", status: statusForPercent(inode, 75, 90), value: inode == null ? "未取得" : `${inode}%`, detail: inode == null ? "inode 使用率没有返回可识别结果。" : "inode 满也会表现为磁盘无法写入。" });
    if (outputs.has("dockerUsage")) {
      const lines = boundedExcerpt(outputs.get("dockerUsage"), 5);
      findings.push({ key: "docker-usage", label: "Docker 占用", status: "unknown", value: "已读取", detail: "只展示汇总；LocalOps 不会自动 prune 或删除卷。" });
      excerpt = lines;
    }
  } else {
    const containers = parseContainerInventory(outputs.get("containers"));
    const suspect = containers.find((item) => /unhealthy|restarting|exited|dead/i.test(item.status));
    findings.push(suspect
      ? { key: "container", label: "服务进程", status: /dead|exited/i.test(suspect.status) ? "critical" : "warning", value: suspect.name, detail: redactDiagnosticText(suspect.status, 180) }
      : { key: "container", label: "服务进程", status: containers.length ? "healthy" : "unknown", value: containers.length ? `${containers.length} 个在清单中` : "未取得", detail: containers.length ? "没有发现 unhealthy、restarting、exited 或 dead 状态。" : "Docker 清单为空或不可用。" });
    const failedUnits = boundedExcerpt(outputs.get("failedUnits"), 4);
    findings.push({ key: "units", label: "系统服务", status: failedUnits.length ? "warning" : outputs.has("failedUnits") ? "healthy" : "unknown", value: failedUnits.length ? `${failedUnits.length} 项失败` : outputs.has("failedUnits") ? "无失败项" : "未取得", detail: failedUnits.length ? "发现 systemd 失败单元；请先核对是否属于当前应用。" : "systemd 没有返回失败单元。" });
    const listening = boundedExcerpt(outputs.get("listening"), 30);
    findings.push({ key: "ports", label: "监听端口", status: outputs.has("listening") ? "healthy" : "unknown", value: outputs.has("listening") ? `${Math.max(listening.length - 1, 0)} 项` : "未取得", detail: "只读取 TCP 监听摘要，不探测额外端口。" });
    if (suspect) {
      logAttempted = true;
      try {
        excerpt = boundedExcerpt(await execute({ key: "logs", containerName: suspect.name }));
        logCompleted = true;
      } catch {
        failed += 1;
      }
    }
  }

  const completed = outputs.size + (logCompleted ? 1 : 0);
  const attempted = plan.length + (logAttempted ? 1 : 0);
  const primary = findings.find((item) => item.status === "critical") || findings.find((item) => item.status === "warning") || findings[0];
  return {
    state: failed === 0 ? "complete" : completed > 0 ? "partial" : "unavailable",
    source: "ssh-read-only",
    title: primary ? `${primary.label}：${primary.value}` : "没有取得新的内部证据",
    summary: failed === 0 ? "已完成固定范围的内部只读检查。" : `有 ${failed} 项只读检查未完成，其余结果仍可查看。`,
    findings: findings.slice(0, 3),
    excerpt,
    coverage: { attempted, completed, failed },
    safetyBoundary: "仅运行固定白名单；日志限定最近 15 分钟、最多 80 行，脱敏并限长后返回，不写入数据库。"
  };
}
