const statusLabels = {
  healthy: "正常",
  warning: "需处理",
  critical: "故障",
  unknown: "未知"
};

const signalLabels = {
  http: "网页/API",
  ssh: "SSH 管理通道",
  runtime: "运行时/容器"
};

export function httpSignalStatus(host) {
  if (!host.httpStatus || /not checked|未检查/i.test(host.httpStatus)) return "unknown";
  return /HTTP 2\d\d|\bok\b|simulated 2\d\d/i.test(host.httpStatus) ? "healthy" : "critical";
}

export function sshSignalStatus(host) {
  if (!host.sshStatus || host.sshStatus === "not checked") return "unknown";
  return /^(ok|simulated ok)$/.test(host.sshStatus) ? "healthy" : host.sshStatus === "simulated disabled" ? "unknown" : "warning";
}

export function runtimeSignalStatus(host) {
  if (!host.dockerStatus || host.dockerStatus === "not checked") return "unknown";
  return /^(docker checked|compose healthy)$/.test(host.dockerStatus) ? "healthy" : "warning";
}

function freshnessLabel(dashboard, now) {
  if (!dashboard.observedAt) return "没有观测证据";
  const ageMs = now - new Date(dashboard.observedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > dashboard.staleAfterMs) return "证据已过期";
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  return minutes === 0 ? "刚刚取得证据" : `${minutes} 分钟前取得证据`;
}

function judgment(status) {
  if (status === "critical") return "至少一类基础检查明确失败，需要先定位失败层。";
  if (status === "warning") return "服务可能仍可用，但至少一类信号需要复核。";
  if (status === "unknown") return "当前证据不足，不能把未知状态当作正常。";
  return "最近一次有效观测没有发现基础检查异常。";
}

function nextStep(status) {
  if (status === "critical") return "先生成只读检查预案。不要直接重启，先确认失败层和验证命令。";
  if (status === "warning") return "复核异常信号。刷新当前对象，再比较 HTTP、SSH 与运行时证据。";
  if (status === "unknown") return "取得一份新证据。运行单机轻巡检；未知状态不按正常处理。";
  return "保持值守。当前没有操作理由，等待下一次巡检即可。";
}

function shareableSignal(label, status) {
  const copy = {
    healthy: "有效证据显示正常",
    warning: "存在需要复核的信号",
    critical: "有效证据显示失败",
    unknown: "没有足够的新鲜证据"
  };
  return `- ${label}：${copy[status] || copy.unknown}`;
}

export function discussionBrief(dashboard, host, now = Date.now()) {
  const status = statusLabels[host.status] ? host.status : "unknown";
  const evidence = [
    shareableSignal(signalLabels.http, httpSignalStatus(host)),
    shareableSignal(signalLabels.ssh, sshSignalStatus(host)),
    shareableSignal(signalLabels.runtime, runtimeSignalStatus(host))
  ].join("\n");
  return [
    "LocalOps 值守讨论摘要",
    "对象：当前选中的 1 台服务器（本地名称、环境和角色已省略）",
    `状态：${statusLabels[status]}`,
    `证据时效：${freshnessLabel(dashboard, now)}`,
    `当前判断：${judgment(status)}`,
    "分类证据：",
    evidence,
    `建议：${nextStep(status)}`,
    "隐私：未包含服务器名称、环境、角色、地址、SSH alias、命令或原始证据。",
    "边界：只讨论诊断与验证步骤，不执行重启、部署、删除或配置变更。"
  ].join("\n");
}

export function codexDiscussionLink(brief) {
  const prompt = `[@LocalOps Guardian] 请基于下面的本地最小披露摘要解释最可能的故障层、缺失证据和下一条安全验证动作。不要执行任何变更。\n\n${brief}`;
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}
