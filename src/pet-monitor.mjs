const levelScore = {
  healthy: 0,
  unknown: 1,
  warning: 2,
  critical: 3,
  offline: 4
};

export function monitorSignal(dashboard, offline = false) {
  if (offline) {
    return { level: "offline", score: levelScore.offline, critical: 0, warning: 0, unknown: 0 };
  }
  const critical = Number(dashboard?.counts?.critical) || 0;
  const warning = Number(dashboard?.counts?.warning) || 0;
  const unknown = Number(dashboard?.counts?.unknown) || 0;
  const level = critical > 0 ? "critical" : warning > 0 ? "warning" : unknown > 0 ? "unknown" : "healthy";
  return { level, score: levelScore[level], critical, warning, unknown };
}

export function worseningNotice(previous, current) {
  if (!previous || current.level === "healthy") return null;
  const becameWorse = current.score > previous.score;
  const sameLevelMoreAffected = current.score === previous.score && (
    current.critical > previous.critical || current.warning > previous.warning || current.unknown > previous.unknown
  );
  if (!becameWorse && !sameLevelMoreAffected) return null;

  if (current.level === "offline") {
    return {
      title: "LocalOps 本地值守中断",
      body: "桌宠暂时读不到本地监控，请打开窗口查看恢复建议。"
    };
  }
  return {
    title: current.level === "critical" ? "LocalOps 发现明确故障" : "LocalOps 发现需要关注的信号",
    body: `故障 ${current.critical} · 关注 ${current.warning} · 待确认 ${current.unknown}。打开桌宠查看证据。`
  };
}

export function petSnapshotTrust(hasError, stale, hasObservation) {
  if (hasError) {
    return {
      state: "offline",
      label: hasObservation ? "本地同步中断 · 仅显示上次证据" : "本地同步中断 · 尚无可用证据",
      current: false
    };
  }
  if (!hasObservation) {
    return { state: "unknown", label: "尚未取得观测证据", current: false };
  }
  if (stale) {
    return { state: "stale", label: "证据已过期 · 不能视为当前状态", current: false };
  }
  return { state: "current", label: "证据仍在有效期内", current: true };
}
