const statusRank = Object.freeze({ critical: 0, warning: 1, unknown: 2, healthy: 3 });

export function prioritizeHosts(hosts) {
  return [...(Array.isArray(hosts) ? hosts : [])]
    .sort((left, right) => statusRank[left.status] - statusRank[right.status] || left.name.localeCompare(right.name));
}

export function selectFocusHost(prioritizedHosts, selectedHostId) {
  if (!Array.isArray(prioritizedHosts) || prioritizedHosts.length === 0) return null;
  if (!selectedHostId) return prioritizedHosts[0];
  return prioritizedHosts.find((host) => host.id === selectedHostId) ?? prioritizedHosts[0];
}

export function selectVisibleHost(prioritizedHosts, selectedHostId, limit = 2) {
  if (!Array.isArray(prioritizedHosts)) throw new TypeError("hosts must be an array");
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("visible host limit must be a positive integer");
  const visibleHosts = prioritizedHosts.slice(0, limit);
  return {
    visibleHosts,
    selectedHost: visibleHosts.find((host) => host.id === selectedHostId) ?? visibleHosts[0] ?? null
  };
}

export function retainFocusSelection(hosts, selectedHostId) {
  if (!selectedHostId || !Array.isArray(hosts)) return null;
  return hosts.some((host) => host.id === selectedHostId) ? selectedHostId : null;
}

export function manualFocusSelection(prioritizedHosts, targetHostId) {
  if (!targetHostId || !Array.isArray(prioritizedHosts) || prioritizedHosts.length === 0) return null;
  if (!prioritizedHosts.some((host) => host.id === targetHostId)) return null;
  return targetHostId === prioritizedHosts[0].id ? null : targetHostId;
}
