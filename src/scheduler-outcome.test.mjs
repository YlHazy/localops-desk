import assert from "node:assert/strict";
import test from "node:test";
import { schedulerOutcomeCopy } from "./scheduler-outcome.mjs";

const base = { enabled: true, lastMessage: "backend fact" };

test("scheduler outcome copy keeps success, recovery, failure, and deferral distinct", () => {
  assert.equal(schedulerOutcomeCopy({ ...base, lastOutcome: "succeeded" }).label, "最近成功");
  assert.equal(schedulerOutcomeCopy({ ...base, lastOutcome: "recovered" }).label, "已恢复");
  assert.match(schedulerOutcomeCopy({ ...base, lastOutcome: "maintenance-warning" }).title, /历史清理未完成/);
  assert.equal(schedulerOutcomeCopy({ ...base, lastOutcome: "failed" }).tone, "warning");
  assert.equal(schedulerOutcomeCopy({ ...base, lastOutcome: "deferred" }).label, "已顺延");
  assert.equal(schedulerOutcomeCopy({ ...base, lastOutcome: "failed" }).detail, "backend fact");
});

test("loss of evidence routes recovery to host configuration instead of retrying", () => {
  const copy = schedulerOutcomeCopy({ ...base, enabled: false, lastOutcome: "stopped-no-evidence" });
  assert.equal(copy.action, "configure-hosts");
  assert.match(copy.title, /没有可用证据来源/);
});
