const allowedTabs = new Set(["overview", "hosts", "checks", "scheduler"]);

function safeHostId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

export function petDeskPath({ hostId = null, tab = "overview", source = "pet", revision = null } = {}) {
  const params = new URLSearchParams();
  const safeId = safeHostId(hostId);
  if (hostId != null && !safeId) throw new Error("Invalid LocalOps focus host.");
  if (safeId) params.set("focusHost", safeId);
  if (allowedTabs.has(tab)) params.set("tab", tab);
  params.set("source", source === "pet-alert" ? "pet-alert" : "pet");
  if (Number.isSafeInteger(revision) && revision > 0) params.set("revision", String(revision));
  return `/#${params.toString()}`;
}

export function petDeskIntent(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const hostId = safeHostId(params.get("focusHost"));
  const requestedTab = params.get("tab");
  return {
    hostId,
    tab: allowedTabs.has(requestedTab) ? requestedTab : hostId ? "overview" : null,
    source: params.get("source") === "pet-alert" ? "pet-alert" : params.get("source") === "pet" ? "pet" : null
  };
}
