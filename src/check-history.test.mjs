import assert from "node:assert/strict";
import test from "node:test";
import { checkDecisionCopy, checkScopeCopy, checkTriggerCopy, filterChecks, retainCheckSelection } from "./check-history.mjs";

const checks = [
  { id: 3, trigger: "scheduled", overallStatus: "warning" },
  { id: 2, trigger: "manual-host", overallStatus: "healthy" },
  { id: 1, trigger: "scheduled-manual", overallStatus: "critical" }
];

test("check history translates internal triggers and scopes for beginners", () => {
  assert.equal(checkTriggerCopy("manual-host").label, "手动检查单台");
  assert.equal(checkTriggerCopy("scheduled-manual").label, "立即验证自动巡检");
  assert.equal(checkTriggerCopy("legacy").label, "其他本地检查");
  assert.equal(checkScopeCopy("all"), "全部可采集服务器");
  assert.equal(checkScopeCopy("host-1"), "单台服务器");
  assert.match(checkDecisionCopy("unknown"), /不能把服务器当作正常/);
});

test("check history filters do not lose the stable selected receipt", () => {
  assert.deepEqual(filterChecks(checks, "attention").map((item) => item.id), [3, 1]);
  assert.deepEqual(filterChecks(checks, "automatic").map((item) => item.id), [3, 1]);
  assert.equal(retainCheckSelection(checks, 2), 2);
  assert.equal(retainCheckSelection(checks, 9), 3);
  assert.equal(retainCheckSelection([], 2), null);
});
