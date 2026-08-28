const base = process.env.LOCALOPS_API_BASE || "http://127.0.0.1:4317";
const token = process.env.LOCALOPS_API_TOKEN;
if (!token) throw new Error("LOCALOPS_API_TOKEN is required for API smoke checks.");

async function call(path, init) {
  const res = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    ...init
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

await call("/api/status");
const hostName = `smoke-local-${Date.now()}`;
const created = await call("/api/hosts", {
  method: "POST",
  body: JSON.stringify({
    name: hostName,
    environment: "smoke",
    role: "local api",
    sshAlias: "smoke-local",
    healthUrl: `${base}/api/agent/manifest`,
    composeProject: "",
    tags: ["smoke"]
  })
});
await call(`/api/hosts/${encodeURIComponent(created.host.id)}`, {
  method: "PUT",
  body: JSON.stringify({
    ...created.host,
    role: "local api edited",
    tags: ["smoke", "edited"]
  })
});
await call("/api/checks/light", { method: "POST", body: "{}" });
await call(`/api/checks/light/${encodeURIComponent(created.host.id)}`, { method: "POST", body: "{}" });
await call("/api/scheduler");
await call("/api/scheduler", {
  method: "PUT",
  body: JSON.stringify({ enabled: false, lightIntervalMinutes: 15, retentionDays: 7 })
});
await call("/api/maintenance/retention", {
  method: "POST",
  body: JSON.stringify({ vacuum: false })
});
await call("/api/reports/current");
await call("/api/agent/manifest");
await call("/api/agent/status");
await call("/api/actions/dry-run", {
  method: "POST",
  body: JSON.stringify({ hostId: created.host.id, actionKey: "inspect-service" })
});
await call(`/api/hosts/${encodeURIComponent(created.host.id)}`, { method: "DELETE" });

console.log("LocalOps API smoke passed.");
