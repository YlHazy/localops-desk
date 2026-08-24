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

export function collectionModeCopy(dashboard) {
  if (dashboard.practiceMode) {
    return {
      label: "离线练习",
      detail: "虚构对象、虚构证据，零网络请求。",
      compact: "离线练习 · 零网络"
    };
  }
  if (dashboard.mode === "ssh-enabled") {
    return {
      label: "HTTP + 只读 SSH",
      detail: "访问已配置目标；SSH 只执行允许的读取命令。",
      compact: "HTTP + 只读 SSH"
    };
  }
  return {
    label: "仅 HTTP",
    detail: "只访问你填写的 Health URL；不会发起 SSH。",
    compact: "仅 HTTP（如已配置）"
  };
}

export function trustworthyDashboard(dashboard, now = Date.now()) {
  const observedAt = dashboard.observedAt ? new Date(dashboard.observedAt).getTime() : Number.NaN;
  const fresh = Number.isFinite(observedAt)
    && Number.isFinite(dashboard.staleAfterMs)
    && dashboard.staleAfterMs >= 0
    && now - observedAt <= dashboard.staleAfterMs;
  if (fresh) return dashboard;
  return {
    ...dashboard,
    counts: {
      healthy: 0,
      warning: 0,
      critical: 0,
      unknown: dashboard.hosts.length
    },
    hosts: dashboard.hosts.map((host) => ({ ...host, status: "unknown" }))
  };
}

export function schedulerDraftAfterSync(currentDraft, scheduler, preserveDraft) {
  if (preserveDraft) return currentDraft;
  return {
    enabled: scheduler.enabled,
    lightIntervalMinutes: scheduler.lightIntervalMinutes,
    retentionDays: scheduler.retentionDays
  };
}
