import { httpSignalStatus, resourceSignalStatus, runtimeSignalStatus, sshSignalStatus } from "../shared/evidence-judgment.mjs";

export function hostGuidance(host, fresh = true) {
  if (!fresh) {
    return {
      title: "重新检查",
      reason: "上次检查已过期。",
      detail: "重新检查后再看当前状态。",
      avoid: "先不要重启或修改配置。"
    };
  }

  const signals = {
    http: httpSignalStatus(host),
    ssh: sshSignalStatus(host),
    runtime: runtimeSignalStatus(host),
    resource: resourceSignalStatus(host)
  };

  if (host.status === "critical") {
    const reason = signals.http === "critical"
      ? "网页/API 无法访问。"
      : signals.resource === "critical"
        ? "CPU、内存或磁盘已超过危险值。"
        : "关键检查失败。";
    return {
      title: "排查原因",
      reason,
      detail: "先运行只读排查，确认故障位置。",
      avoid: "先不要重启、部署或修改配置。"
    };
  }

  if (host.status === "warning") {
    const reason = signals.http === "warning"
        ? "网页/API 返回异常状态。"
      : signals.resource === "warning"
        ? "资源使用接近设定上限。"
        : signals.ssh === "warning"
          ? "SSH 未连通，资源状态可能不完整。"
          : signals.runtime === "warning"
            ? "服务或容器状态需要确认。"
            : "发现一项异常信号。";
    return {
      title: "重新检查",
      reason,
      detail: "重新检查；问题仍在时再排查原因。",
      avoid: "先不要重启服务。"
    };
  }

  if (host.status === "unknown") {
    return {
      title: "运行检查",
      reason: "还没有当前检查结果。",
      detail: "先检查一次；如果缺少监控地址，再去补充配置。",
      avoid: "没有结果时不会显示为正常。"
    };
  }

  const hasUnknownSignal = Object.values(signals).includes("unknown");
  return {
    title: "状态正常",
    reason: hasUnknownSignal
      ? "已检查的项目正常，未配置的项目仍显示未知。"
      : "网页、SSH、服务和资源均正常。",
    detail: "不用处理。",
    avoid: "无需操作。"
  };
}
