const base = process.env.LOCALOPS_API_BASE || "http://127.0.0.1:4317";

async function call(path, init) {
  const res = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

await call("/api/status");
await call("/api/checks/light", { method: "POST", body: "{}" });
await call("/api/reports/current");
await call("/api/agent/manifest");

console.log("LocalOps API smoke passed.");

