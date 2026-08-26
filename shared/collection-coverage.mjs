function offlineHost(host, practiceMode) {
  return Boolean(practiceMode || host?.isOfflineDemo);
}

export function hostCollectionPlan(mode, host, options = {}) {
  if (offlineHost(host, options.practiceMode)) return { state: "offline", canCollect: true };
  const hasHealthUrl = Boolean(host?.healthUrl?.trim());
  const hasSshAlias = Boolean(host?.sshAlias?.trim());
  const sshEnabled = mode === "ssh-enabled";
  if (hasHealthUrl && hasSshAlias && sshEnabled) return { state: "combined", canCollect: true };
  if (hasHealthUrl) return { state: "http", canCollect: true };
  if (hasSshAlias && sshEnabled) return { state: "ssh-only", canCollect: true };
  if (hasSshAlias) return { state: "ssh-disabled", canCollect: false };
  return { state: "missing", canCollect: false };
}

export function collectionCoverage(mode, hosts = [], options = {}) {
  const counts = {
    offline: 0,
    combined: 0,
    http: 0,
    "ssh-only": 0,
    "ssh-disabled": 0,
    missing: 0
  };
  for (const host of hosts) counts[hostCollectionPlan(mode, host, options).state] += 1;
  const collectible = counts.offline + counts.combined + counts.http + counts["ssh-only"];
  return {
    total: hosts.length,
    collectible,
    blocked: hosts.length - collectible,
    complete: counts.offline + counts.combined,
    partial: counts.http + counts["ssh-only"],
    counts
  };
}
