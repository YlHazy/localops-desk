import assert from "node:assert/strict";
import test from "node:test";
import { diagnoseHost } from "./host-diagnosis.mjs";

const healthy = {
  httpStatus: "200 OK",
  sshStatus: "ok",
  dockerStatus: "docker checked",
  cpuPercent: 21,
  memoryPercent: 47,
  diskPercent: 52
};

test("diagnosis locates reachable resource pressure without inventing an outage", () => {
  const result = diagnoseHost({ ...healthy, diskPercent: 76 });
  assert.equal(result.layer, "resources");
  assert.equal(result.confidence, "high");
  assert.match(result.headline, /磁盘 76%/);
  assert.match(result.detail, /仍可访问/);
  assert.match(result.next, /不要直接清理或重启/);
});

test("diagnosis separates an entry failure from a combined connectivity failure", () => {
  const entry = diagnoseHost({ ...healthy, httpStatus: "503 Service Unavailable" });
  assert.equal(entry.layer, "entry");
  assert.match(entry.detail, /代理、应用或依赖服务/);

  const combined = diagnoseHost({ ...healthy, httpStatus: "timeout", sshStatus: "Permission denied" });
  assert.equal(combined.layer, "connectivity");
  assert.match(combined.next, /不要直接重启/);
});

test("diagnosis keeps incomplete evidence explicitly limited", () => {
  const result = diagnoseHost({
    httpStatus: "not checked",
    sshStatus: "not configured",
    dockerStatus: "not checked",
    cpuPercent: null,
    memoryPercent: null,
    diskPercent: null
  });
  assert.equal(result.layer, "unknown");
  assert.equal(result.confidence, "limited");
  assert.equal(result.signals.filter((signal) => signal.status === "unknown").length, 4);
  assert.match(result.detail, /没有把未知结果当作正常/);
});
