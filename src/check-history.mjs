export const checkHistoryFilters = [
  { id: "all", label: "全部" },
  { id: "attention", label: "需关注" },
  { id: "healthy", label: "正常" },
  { id: "automatic", label: "自动巡检" }
];

export function checkTriggerCopy(trigger) {
  if (trigger === "scheduled") return { label: "按计划自动巡检", detail: "由本地定时器按设定频率发起" };
  if (trigger === "scheduled-manual") return { label: "立即验证自动巡检", detail: "由你从调度页主动验证一次" };
  if (trigger === "manual-host") return { label: "手动检查单台", detail: "由你从服务器详情主动发起" };
  if (trigger === "manual") return { label: "手动检查全部", detail: "由你主动检查所有可采集服务器" };
  return { label: "其他本地检查", detail: "由当前版本无法识别的本地入口发起" };
}

export function checkKindCopy(kind) {
  return kind === "light" ? "轻量巡检" : "其他检查";
}

export function checkScopeCopy(hostScope) {
  return !hostScope || hostScope === "all" ? "全部可采集服务器" : "单台服务器";
}

export function checkDecisionCopy(status) {
  if (status === "healthy") return "已采集的信号均未越过告警阈值；仅代表本次证据范围内正常。";
  if (status === "warning") return "至少一项资源或依赖信号需要关注，但现有证据尚未确认服务中断。";
  if (status === "critical") return "至少一项入口或管理信号失败，本次按故障处理，需要人工确认。";
  return "本次证据不足，不能把服务器当作正常；应补充来源或重新检查。";
}

export function filterChecks(checks, filter) {
  if (filter === "attention") return checks.filter((check) => check.overallStatus !== "healthy");
  if (filter === "healthy") return checks.filter((check) => check.overallStatus === "healthy");
  if (filter === "automatic") return checks.filter((check) => check.trigger === "scheduled" || check.trigger === "scheduled-manual");
  return checks;
}

export function retainCheckSelection(checks, previousId) {
  if (previousId != null && checks.some((check) => check.id === previousId)) return previousId;
  return checks[0]?.id ?? null;
}
