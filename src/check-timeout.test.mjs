import assert from "node:assert/strict";
import test from "node:test";
import { batchCheckTimeoutMs } from "./check-timeout.mjs";

test("batch timeout grows with bounded collector waves", () => {
  assert.equal(batchCheckTimeoutMs(0), 60_000);
  assert.equal(batchCheckTimeoutMs(4), 60_000);
  assert.equal(batchCheckTimeoutMs(5), 70_000);
  assert.equal(batchCheckTimeoutMs(20), 130_000);
  assert.equal(batchCheckTimeoutMs(10_000), 600_000);
  assert.throws(() => batchCheckTimeoutMs(-1), /non-negative integer/);
});
