import { dashboardEvidenceIsFresh } from "./desk-sync.mjs";
import { hostGuidance } from "./guardian-guidance.mjs";
import { httpSignalStatus, resourceSignalStatus, runtimeSignalStatus, sshSignalStatus } from "../shared/evidence-judgment.mjs";

export { httpSignalStatus, resourceSignalStatus, runtimeSignalStatus, sshSignalStatus };

const statusLabels = {
  healthy: "正常",
  warning: "需处理",
  critical: "故障",
  unknown: "未知"
};

const signalLabels = {
  http: "网页/API",
  ssh: "SSH 管理通道",
  runtime: "运行时/容器",
  resource: "资源压力"
};

function freshnessLabel(dashboard, now) {
  if (!dashboard.observedAt) return "没有观测证据";
  const ageMs = now - new Date(dashboard.observedAt).getTime();
  if (!dashboardEvidenceIsFresh(dashboard, now)) return "证据已过期";
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  return minutes === 0 ? "刚刚取得证据" : `${minutes} 分钟前取得证据`;
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
  const fresh = dashboardEvidenceIsFresh(dashboard, now);
  const status = fresh && statusLabels[host.status] ? host.status : "unknown";
  const guidance = hostGuidance({ ...host, status }, fresh);
  const evidence = [
    shareableSignal(signalLabels.http, fresh ? httpSignalStatus(host) : "unknown"),
    shareableSignal(signalLabels.ssh, fresh ? sshSignalStatus(host) : "unknown"),
    shareableSignal(signalLabels.runtime, fresh ? runtimeSignalStatus(host) : "unknown"),
    shareableSignal(signalLabels.resource, fresh ? resourceSignalStatus(host) : "unknown")
  ].join("\n");
  return [
    "LocalOps 值守讨论摘要",
    "对象：当前选中的 1 台服务器（本地名称、环境和角色已省略）",
    `状态：${statusLabels[status]}`,
    `证据时效：${freshnessLabel(dashboard, now)}`,
    `当前判断：${guidance.reason}`,
    "分类证据：",
    evidence,
    `建议：${guidance.title}。${guidance.detail}`,
    `避免：${guidance.avoid}`,
    "隐私：未包含服务器名称、环境、角色、地址、SSH alias、命令或原始证据。",
    "边界：只讨论诊断与验证步骤，不执行重启、部署、删除或配置变更。"
  ].join("\n");
}

export function codexDiscussionLink(brief) {
  const prompt = `[@LocalOps Guardian] 请基于下面的本地最小披露摘要解释最可能的故障层、缺失证据和下一条安全验证动作。不要执行任何变更。\n\n${brief}`;
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}
