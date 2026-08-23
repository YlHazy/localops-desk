import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { portableRoot, verifyPortablePackage } from "./package-portable.mjs";

async function mutateJson(base, path, method) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Portable ${method} ${path} failed (${response.status}): ${body.message || body.error}`);
  return body;
}

async function verifyRuntime() {
  await verifyPortablePackage();
  const dataDir = await mkdtemp(join(tmpdir(), "localops-portable-verify-"));
  const child = spawn(process.execPath, [join(portableRoot, "server", "index.mjs")], {
    cwd: portableRoot,
    env: {
      ...process.env,
      LOCALOPS_API_HOST: "127.0.0.1",
      LOCALOPS_API_PORT: "0",
      LOCALOPS_DATA_DIR: dataDir,
      LOCALOPS_SEED_DEMO: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const lines = createInterface({ input: child.stdout, terminal: false });
    let port = null;
    const deadline = Date.now() + 7_500;
    while (port == null && Date.now() < deadline) {
      const winner = await Promise.race([
        once(lines, "line").then(([line]) => ({ line })),
        once(child, "exit").then(([code]) => ({ code })),
        new Promise((resolveDelay) => setTimeout(() => resolveDelay({}), 100))
      ]);
      const match = winner.line?.match(/127\.0\.0\.1:(\d+)/);
      if (match) port = Number(match[1]);
      if (winner.code != null) throw new Error(`Portable API exited with ${winner.code}: ${stderr}`);
    }
    if (port == null) throw new Error(`Portable API did not start: ${stderr}`);
    const base = `http://127.0.0.1:${port}`;
    const [home, manifest, status] = await Promise.all([
      fetch(`${base}/`),
      fetch(`${base}/api/agent/manifest`).then((item) => item.json()),
      fetch(`${base}/api/status`).then((item) => item.json())
    ]);
    if (!home.ok || !String(home.headers.get("content-type")).startsWith("text/html")) throw new Error("Portable home page is unavailable.");
    if (manifest.name !== "LocalOps Desk Agent API" || manifest.safety?.arbitraryShell !== false) throw new Error("Portable API manifest is not recognizable.");
    if (!Array.isArray(status.hosts) || status.hosts.length !== 0) throw new Error("Portable runtime did not start empty by default.");

    const installed = await mutateJson(base, "/api/practice/offline", "POST");
    if (!installed.practice?.practiceMode || installed.practice.networkTargets !== 0) throw new Error("Portable offline practice did not install with a zero-target contract.");
    const practiceStatus = await fetch(`${base}/api/status`).then((item) => item.json());
    if (!practiceStatus.practiceMode || practiceStatus.hosts?.length !== 3) throw new Error("Portable offline practice status is incomplete.");
    if (!practiceStatus.hosts.every((hostItem) => hostItem.isOfflineDemo && !hostItem.healthUrl && !hostItem.sshAlias && !hostItem.composeProject)) {
      throw new Error("Portable offline practice contains a connection target or unmanaged host.");
    }
    const checked = await mutateJson(base, "/api/checks/light", "POST");
    if (checked.hostResults?.length !== 3 || !checked.hostResults.every((result) => result.evidence?.join(" ").includes("离线"))) {
      throw new Error("Portable offline practice check did not return three offline evidence results.");
    }
    const removed = await mutateJson(base, "/api/practice/offline", "DELETE");
    if (!removed.practice?.removed || removed.practice.hostsRemoved !== 3) throw new Error("Portable offline practice did not remove its managed hosts.");
    const [clearedStatus, clearedChecks] = await Promise.all([
      fetch(`${base}/api/status`).then((item) => item.json()),
      fetch(`${base}/api/checks`).then((item) => item.json())
    ]);
    if (clearedStatus.hosts?.length !== 0 || clearedStatus.practiceMode || clearedChecks.checks?.length !== 0) {
      throw new Error("Portable offline practice cleanup did not restore the empty runtime.");
    }
    console.log(`Portable runtime verified on ${base}: built UI, recognizable API, empty default, zero-network practice lifecycle.`);
  } finally {
    if (child.exitCode == null) {
      child.kill();
      await once(child, "exit");
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

await verifyRuntime();
