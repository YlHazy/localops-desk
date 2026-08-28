import assert from "node:assert/strict";
import test from "node:test";
import { mapWithConcurrency } from "./bounded-concurrency.mjs";

test("bounded concurrency preserves result order without exceeding the worker limit", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([40, 5, 20, 10, 1], 2, async (delay, index) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return index * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results, [0, 10, 20, 30, 40]);
});

test("bounded concurrency validates inputs and handles an empty batch", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => null), []);
  await assert.rejects(() => mapWithConcurrency({}, 2, async () => null), /array/);
  await assert.rejects(() => mapWithConcurrency([], 0, async () => null), /positive integer/);
  await assert.rejects(() => mapWithConcurrency([], 1, null), /function/);
});
