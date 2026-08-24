import assert from "node:assert/strict";
import test from "node:test";
import { hostGuidance } from "./guardian-guidance.mjs";

const healthySignals = {
  httpStatus: "200 OK",
  sshStatus: "ok",
  dockerStatus: "docker checked",
  cpuPercent: 22,
  memoryPercent: 48,
  diskPercent: 51
};

test("resource warning explains why a reachable service still needs attention", () => {
  const guidance = hostGuidance({ ...healthySignals, status: "warning", diskPercent: 76 });
  assert.match(guidance.reason, /资源占用接近关注阈值/);
  assert.match(guidance.detail, /刷新当前服务器/);
  assert.match(guidance.avoid, /不要.*直接重启/);
});

test("entry warning takes priority when resource pressure is also present", () => {
  const guidance = hostGuidance({ ...healthySignals, status: "warning", httpStatus: "404 Not Found", diskPercent: 76 });
  assert.match(guidance.reason, /网页\/API 返回了非成功状态/);
  assert.doesNotMatch(guidance.reason, /资源占用/);
});

test("guidance prioritizes failed entry evidence and blocks speculative mutation", () => {
  const guidance = hostGuidance({ ...healthySignals, status: "critical", httpStatus: "503 Service Unavailable" });
  assert.match(guidance.reason, /网页\/API 入口明确失败/);
  assert.match(guidance.title, /只读检查预案/);
  assert.match(guidance.avoid, /不要直接重启、部署或修改配置/);
});

test("expired and partial evidence never becomes a broad healthy claim", () => {
  const expired = hostGuidance({ ...healthySignals, status: "healthy" }, false);
  assert.match(expired.reason, /证据已经过期/);
  assert.match(expired.avoid, /不要沿用过期结论/);

  const partial = hostGuidance({
    status: "healthy",
    httpStatus: "200 OK",
    sshStatus: "simulated disabled",
    dockerStatus: "not checked",
    cpuPercent: null,
    memoryPercent: null,
    diskPercent: null
  });
  assert.match(partial.reason, /仍保持未知/);
  assert.doesNotMatch(partial.reason, /均未显示异常/);
});
