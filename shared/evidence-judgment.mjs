export const resourceThresholds = Object.freeze({
  cpuPercent: Object.freeze({ label: "CPU", warning: 85, critical: 95 }),
  memoryPercent: Object.freeze({ label: "内存", warning: 85, critical: 95 }),
  diskPercent: Object.freeze({ label: "磁盘", warning: 75, critical: 90 })
});

const statusRank = Object.freeze({ unknown: 0, healthy: 1, warning: 2, critical: 3 });

export function httpSignalStatus(host) {
  const value = String(host?.httpStatus || "");
  if (!value || /not checked|not observed|no health url|未检查/i.test(value)) return "unknown";
  const statusCode = Number(value.match(/(?:^|HTTP\s+)(\d{3})\b/i)?.[1]);
  if (Number.isFinite(statusCode)) {
    if (statusCode >= 200 && statusCode < 300) return "healthy";
    if (statusCode >= 500) return "critical";
    return "warning";
  }
  if (/\bok\b|ready/i.test(value)) return "healthy";
  return "critical";
}

export function sshSignalStatus(host) {
  const value = String(host?.sshStatus || "");
  if (!value || value === "not checked" || value === "not configured" || value === "simulated disabled") return "unknown";
  return /^(ok|simulated ok)$/.test(value) ? "healthy" : "warning";
}

export function runtimeSignalStatus(host) {
  const value = String(host?.dockerStatus || "");
  if (!value || value === "not checked") return "unknown";
  return /^(docker checked|compose healthy)$/.test(value) ? "healthy" : "warning";
}

function observedResources(host) {
  return Object.entries(resourceThresholds).flatMap(([key, threshold]) => {
    const rawValue = host?.[key];
    if (rawValue === null || rawValue === undefined || rawValue === "") return [];
    const value = Number(rawValue);
    return Number.isFinite(value) && value >= 0
      ? [{ key, value, ...threshold }]
      : [];
  });
}

export function resourceSignalStatus(host) {
  const observed = observedResources(host);
  if (observed.length === 0) return "unknown";
  return observed.reduce((worst, item) => {
    const status = item.value >= item.critical
      ? "critical"
      : item.value >= item.warning
        ? "warning"
        : "healthy";
    return statusRank[status] > statusRank[worst] ? status : worst;
  }, "healthy");
}

export function resourceSignalSummary(host) {
  const observed = observedResources(host);
  if (observed.length === 0) return "未取得资源数据";
  const priority = observed
    .map((item) => ({
      ...item,
      status: item.value >= item.critical ? "critical" : item.value >= item.warning ? "warning" : "healthy"
    }))
    .sort((left, right) => statusRank[right.status] - statusRank[left.status] || right.value - left.value)[0];
  if (priority.status === "critical") return `${priority.label} ${priority.value}% · 高风险`;
  if (priority.status === "warning") return `${priority.label} ${priority.value}% · 接近阈值`;
  return `最高 ${priority.label} ${priority.value}% · 阈值内`;
}

export function classifyCollectedStatus(httpStatus, collected) {
  if (httpStatus === "critical") return "critical";
  if (collected?.sshStatus !== "ok") return httpStatus === "healthy" ? "warning" : "unknown";
  const resourceStatus = resourceSignalStatus(collected);
  if (resourceStatus === "critical") return "critical";
  if (httpStatus === "warning" || resourceStatus === "warning" || runtimeSignalStatus(collected) === "warning") return "warning";
  return httpStatus;
}
