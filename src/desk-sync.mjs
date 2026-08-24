function syncAge(lastSyncedAt, now) {
  const ageSeconds = Math.max(0, Math.floor((now - lastSyncedAt) / 1000));
  return ageSeconds < 15
    ? "刚刚"
    : ageSeconds < 60
      ? `${ageSeconds} 秒前`
      : `${Math.floor(ageSeconds / 60)} 分钟前`;
}

export function localRecoveryCopy(lastSyncedAt, now = Date.now()) {
  const retained = Number.isFinite(lastSyncedAt)
    ? `保留上次成功读取（${syncAge(lastSyncedAt, now)}）`
    : "尚未成功读取本地状态";
  return {
    label: "本地状态暂时断开",
    detail: `${retained}；30 秒后自动重试`,
    boundary: "立即重试只会读取本地状态，不会巡检或改动服务器"
  };
}

export function deskSyncCopy(state, lastSyncedAt, now = Date.now()) {
  if (state === "syncing") {
    return { label: "正在同步本地状态", detail: "只读更新，不会触发巡检" };
  }
  if (state === "offline") {
    return localRecoveryCopy(lastSyncedAt, now);
  }
  if (state !== "current" || !Number.isFinite(lastSyncedAt)) {
    return { label: "等待首次同步", detail: "连接本地 LocalOps API" };
  }
  return { label: `自动同步 · ${syncAge(lastSyncedAt, now)}`, detail: "每 30 秒只读更新" };
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

export function dashboardEvidenceIsFresh(dashboard, now = Date.now()) {
  const observedAt = dashboard.observedAt ? new Date(dashboard.observedAt).getTime() : Number.NaN;
  return Number.isFinite(observedAt)
    && Number.isFinite(dashboard.staleAfterMs)
    && dashboard.staleAfterMs >= 0
    && now - observedAt <= dashboard.staleAfterMs;
}

export function trustworthyDashboard(dashboard, now = Date.now()) {
  if (dashboardEvidenceIsFresh(dashboard, now)) return dashboard;
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
