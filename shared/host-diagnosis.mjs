import {
  httpSignalStatus,
  resourceSignalStatus,
  resourceThresholds,
  runtimeSignalStatus,
  sshSignalStatus
} from "./evidence-judgment.mjs";

const signalCopy = Object.freeze({
  healthy: "正常",
  warning: "异常",
  critical: "故障",
  unknown: "未确认"
});

function resourceFinding(host) {
  const observed = Object.entries(resourceThresholds).flatMap(([key, threshold]) => {
    const value = Number(host?.[key]);
    if (!Number.isFinite(value) || host?.[key] == null) return [];
    const status = value >= threshold.critical ? "critical" : value >= threshold.warning ? "warning" : "healthy";
    return [{ ...threshold, value, status }];
  });
  return observed.sort((left, right) => {
    const rank = { critical: 2, warning: 1, healthy: 0 };
    return rank[right.status] - rank[left.status] || right.value - left.value;
  })[0] ?? null;
}

export function diagnoseHost(host) {
  const signals = {
    http: httpSignalStatus(host),
    ssh: sshSignalStatus(host),
    runtime: runtimeSignalStatus(host),
    resource: resourceSignalStatus(host)
  };
  const signalSummary = [
    { key: "http", label: "网页/API", status: signals.http, text: signalCopy[signals.http] },
    { key: "ssh", label: "SSH", status: signals.ssh, text: signalCopy[signals.ssh] },
    { key: "runtime", label: "服务", status: signals.runtime, text: signalCopy[signals.runtime] },
    { key: "resource", label: "资源", status: signals.resource, text: signalCopy[signals.resource] }
  ];
  const resources = resourceFinding(host);

  if (signals.http === "critical" && signals.ssh === "warning") {
    return {
      layer: "connectivity",
      confidence: "medium",
      headline: "网页/API 无法访问，SSH 也未连通",
      detail: "入口故障已经确认；SSH 异常可能来自网络、主机状态或本机配置，需要继续只读确认。",
      next: "先核对主机连通性和 SSH 配置，不要直接重启服务。",
      signals: signalSummary
    };
  }
  if (signals.http === "critical") {
    return {
      layer: "entry",
      confidence: "high",
      headline: "问题首先出现在网页/API 入口",
      detail: signals.ssh === "healthy" ? "SSH 可以连接，故障更可能位于代理、应用或依赖服务。" : "入口检查失败，管理通道尚未提供足够信息。",
      next: "查看只读排查步骤，确认代理和服务状态。",
      signals: signalSummary
    };
  }
  if (signals.resource === "critical" || signals.resource === "warning") {
    const threshold = resources?.status === "critical" ? resources.critical : resources?.warning;
    return {
      layer: "resources",
      confidence: "high",
      headline: resources ? `${resources.label} ${resources.value}%，已达到${resources.status === "critical" ? "危险" : "关注"}值` : "资源使用异常",
      detail: signals.http === "healthy" ? "网页/API 目前仍可访问，异常集中在资源使用。" : "资源信号异常，网页/API 状态仍需确认。",
      next: resources && threshold != null ? `设定值是 ${threshold}%；先确认增长来源，不要直接清理或重启。` : "先确认增长来源，不要直接清理或重启。",
      signals: signalSummary
    };
  }
  if (signals.runtime === "warning") {
    return {
      layer: "runtime",
      confidence: "medium",
      headline: "服务或容器状态异常",
      detail: signals.http === "healthy" ? "入口仍可访问，但后台服务状态需要确认。" : "服务状态异常，入口证据还不完整。",
      next: "查看只读排查步骤，确认具体服务状态。",
      signals: signalSummary
    };
  }
  if (signals.http === "warning") {
    return {
      layer: "entry",
      confidence: "high",
      headline: "网页/API 返回异常状态",
      detail: "服务有响应，但返回结果不在正常范围。",
      next: "先确认健康检查路径和应用状态。",
      signals: signalSummary
    };
  }
  if (signals.ssh === "warning") {
    return {
      layer: "management",
      confidence: "medium",
      headline: "SSH 管理通道未连通",
      detail: signals.http === "healthy" ? "网页/API 正常，当前问题集中在管理通道。" : "SSH 未连通，服务器运行状态还不能完整确认。",
      next: "先核对本机 SSH 配置和访问权限。",
      signals: signalSummary
    };
  }
  if (Object.values(signals).every((status) => status === "healthy")) {
    return {
      layer: "none",
      confidence: "high",
      headline: "重新检查没有发现问题",
      detail: "网页、SSH、服务和资源均正常。",
      next: "不用处理，继续值守即可。",
      signals: signalSummary
    };
  }
  return {
    layer: "unknown",
    confidence: "limited",
    headline: "现有信息还不能定位原因",
    detail: "至少一项状态未确认，没有把未知结果当作正常。",
    next: "补充监控来源后重新排查。",
    signals: signalSummary
  };
}
