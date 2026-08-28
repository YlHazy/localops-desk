import assert from "node:assert/strict";
import test from "node:test";
import { classifyCollectedStatus, httpSignalStatus, resourceSignalStatus, resourceSignalSummary, sshSignalStatus } from "./evidence-judgment.mjs";

test("resource judgment uses one explicit warning and critical contract", () => {
  assert.equal(resourceSignalStatus({}), "unknown");
  assert.equal(resourceSignalStatus({ cpuPercent: null, memoryPercent: null, diskPercent: null }), "unknown");
  assert.equal(resourceSignalStatus({ cpuPercent: 30, memoryPercent: 68, diskPercent: 74 }), "healthy");
  assert.equal(resourceSignalStatus({ cpuPercent: 30, memoryPercent: 68, diskPercent: 75 }), "warning");
  assert.equal(resourceSignalStatus({ cpuPercent: 30, memoryPercent: 68, diskPercent: 90 }), "critical");
  assert.equal(resourceSignalSummary({ cpuPercent: 31, memoryPercent: 68, diskPercent: 76 }), "磁盘 76% · 接近阈值");
});

test("HTTP judgment preserves unknown, warning, and critical distinctions", () => {
  assert.equal(httpSignalStatus({ httpStatus: "not checked" }), "unknown");
  assert.equal(httpSignalStatus({ httpStatus: "200 OK" }), "healthy");
  assert.equal(httpSignalStatus({ httpStatus: "404 Not Found" }), "warning");
  assert.equal(httpSignalStatus({ httpStatus: "503 Service Unavailable" }), "critical");
  assert.equal(httpSignalStatus({ httpStatus: "timeout" }), "critical");
});

test("an intentionally unconfigured SSH source stays unknown instead of becoming a warning", () => {
  assert.equal(sshSignalStatus({ sshStatus: "not configured" }), "unknown");
  assert.equal(sshSignalStatus({ sshStatus: "simulated disabled" }), "unknown");
});

test("collected status cannot stay green when resource or runtime evidence warns", () => {
  const base = { sshStatus: "ok", dockerStatus: "docker checked", memoryPercent: 42, diskPercent: 40 };
  assert.equal(classifyCollectedStatus("healthy", base), "healthy");
  assert.equal(classifyCollectedStatus("healthy", { ...base, diskPercent: 76 }), "warning");
  assert.equal(classifyCollectedStatus("healthy", { ...base, diskPercent: 91 }), "critical");
  assert.equal(classifyCollectedStatus("healthy", { ...base, dockerStatus: "docker unavailable" }), "warning");
  assert.equal(classifyCollectedStatus("critical", base), "critical");
});
