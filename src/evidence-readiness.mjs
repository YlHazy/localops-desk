import { hostCollectionPlan } from "../shared/collection-coverage.mjs";

export function evidenceReadiness(dashboard, host) {
  const plan = hostCollectionPlan(dashboard?.mode, host, { practiceMode: dashboard?.practiceMode });
  if (plan.state === "offline") {
    return {
      state: "offline",
      canCollect: true,
      label: "离线练习就绪",
      detail: "只在本机生成虚构证据，零网络请求。",
      actionLabel: "生成练习证据"
    };
  }

  const hasSshAlias = Boolean(host?.sshAlias?.trim());
  if (plan.state === "combined") {
    return {
      state: "combined",
      canCollect: true,
      label: "HTTP + 只读 SSH 已就绪",
      detail: "会访问 Health URL，并执行固定的只读 SSH 命令。",
      actionLabel: "刷新 HTTP + SSH 证据"
    };
  }

  if (plan.state === "http") {
    return {
      state: "http",
      canCollect: true,
      label: "HTTP 已就绪",
      detail: hasSshAlias
        ? "本次只访问 Health URL；SSH alias 已保存，但当前启动不会使用。"
        : "本次只访问 Health URL；SSH 与资源证据保持未知。",
      actionLabel: "检查 Health URL"
    };
  }

  if (plan.state === "ssh-only") {
    return {
      state: "ssh-only",
      canCollect: true,
      label: "仅只读 SSH 就绪",
      detail: "可以采集管理通道与资源；未配置 Health URL，网页/API 保持未知。",
      actionLabel: "采集只读 SSH 证据"
    };
  }

  if (plan.state === "ssh-disabled") {
    return {
      state: "ssh-disabled",
      canCollect: false,
      label: "SSH 尚未启用",
      detail: "Alias 已保存，但当前启动不会使用 SSH；补 Health URL，或按启动说明显式启用只读 SSH。",
      actionLabel: "补充可用证据"
    };
  }

  return {
    state: "missing",
    canCollect: false,
    label: "尚无证据来源",
    detail: "建议先补 Health URL；需要资源证据时，再登记 SSH alias 并显式启用。",
    actionLabel: "补充可用证据"
  };
}
