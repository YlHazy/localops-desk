export function deskSyncCopy(state, lastSyncedAt, now = Date.now()) {
  if (state === "syncing") {
    return { label: "正在同步本地状态", detail: "只读更新，不会触发巡检" };
  }
  if (state === "offline") {
    return { label: "自动同步暂停", detail: "保留上次结果，可立即重试" };
  }
  if (state !== "current" || !Number.isFinite(lastSyncedAt)) {
    return { label: "等待首次同步", detail: "连接本地 LocalOps API" };
  }
  const ageSeconds = Math.max(0, Math.floor((now - lastSyncedAt) / 1000));
  const age = ageSeconds < 15
    ? "刚刚"
    : ageSeconds < 60
      ? `${ageSeconds} 秒前`
      : `${Math.floor(ageSeconds / 60)} 分钟前`;
  return { label: `自动同步 · ${age}`, detail: "每 30 秒只读更新" };
}

export async function fetchDeskSnapshot(request) {
  const [status, recent, currentReport, schedulerState, startupState] = await Promise.all([
    request("/api/status"),
    request("/api/checks"),
    request("/api/reports/current"),
    request("/api/scheduler"),
    request("/api/startup")
  ]);
  return {
    status,
    checks: recent.checks,
    report: currentReport.report,
    scheduler: schedulerState.scheduler,
    startup: startupState.startup
  };
}

export function fetchPetSnapshot(request) {
  return request("/api/status");
}

export function schedulerDraftAfterSync(currentDraft, scheduler, preserveDraft) {
  if (preserveDraft) return currentDraft;
  return {
    enabled: scheduler.enabled,
    lightIntervalMinutes: scheduler.lightIntervalMinutes,
    retentionDays: scheduler.retentionDays
  };
}
