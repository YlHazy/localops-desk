import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { collectHost } from "./runtime.mjs";

async function closeTestServer(server) {
  if (!server.listening) return;
  const closed = once(server, "close");
  server.close();
  server.closeAllConnections?.();
  await closed;
}

test("offline demo profile bypasses HTTP and SSH collectors even when targets are injected", async (t) => {
  let requestCount = 0;
  const probe = createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(200).end("unexpected");
  });
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  t.after(() => closeTestServer(probe));

  const result = await collectHost({
    id: "localops-sample-healthy",
    tags: ["localops:offline-demo"],
    healthUrl: `http://127.0.0.1:${probe.address().port}/must-not-run`,
    sshAlias: "-must-not-run",
  }, { mode: "ssh-enabled", httpTimeoutMs: 100 });

  assert.equal(result.status, "healthy");
  assert.equal(result.httpStatus, "simulated 200 ready");
  assert.equal(requestCount, 0);
});
