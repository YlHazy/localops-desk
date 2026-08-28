export function schedulerOutcomeCopy(scheduler) {
  const outcome = scheduler?.lastOutcome || "never";
  if (outcome === "succeeded") {
    return { tone: "healthy", label: "最近成功", title: "自动巡检按计划完成", detail: scheduler.lastMessage, action: scheduler.enabled ? "run-now" : "none" };
  }
  if (outcome === "recovered") {
    return { tone: "healthy", label: "已恢复", title: "自动巡检已从失败中恢复", detail: scheduler.lastMessage, action: scheduler.enabled ? "run-now" : "none" };
  }
  if (outcome === "maintenance-warning") {
    return { tone: "warning", label: "巡检成功 · 清理异常", title: "证据已更新，本地历史清理未完成", detail: scheduler.lastMessage, action: scheduler.enabled ? "run-now" : "none" };
  }
  if (outcome === "failed") {
    return { tone: "warning", label: "需要恢复", title: "最近一次自动巡检未完成", detail: scheduler.lastMessage, action: scheduler.enabled ? "run-now" : "none" };
  }
  if (outcome === "deferred") {
    return { tone: "unknown", label: "已顺延", title: "已有巡检占用采集通道", detail: scheduler.lastMessage, action: scheduler.enabled ? "run-now" : "none" };
  }
  if (outcome === "stopped-no-evidence") {
    return { tone: "warning", label: "已自动停表", title: "当前没有可用证据来源", detail: scheduler.lastMessage, action: "configure-hosts" };
  }
  return {
    tone: "unknown",
    label: "尚未运行",
    title: scheduler?.enabled ? "等待第一次自动巡检" : "自动巡检尚未开始",
    detail: scheduler?.lastMessage || "保存并启用巡检配置后，这里会记录最近结果与恢复状态。",
    action: scheduler?.enabled ? "run-now" : "none"
  };
}
