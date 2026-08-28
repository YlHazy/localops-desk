import assert from "node:assert/strict";
import test from "node:test";
import { createConcurrencyGate, mapWithConcurrency } from "./bounded-concurrency.mjs";

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

test("process gate is FIFO, bounded, and releases permits after failure", async () => {
  const gate = createConcurrencyGate(2);
  let active = 0;
  let peak = 0;
  const entered = [];
  const work = Array.from({ length: 6 }, (_, index) => gate(async () => {
    active += 1;
    peak = Math.max(peak, active);
    entered.push(index);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (index === 2) throw new Error("expected");
    return index;
  }));
  const results = await Promise.allSettled(work);
  assert.equal(peak, 2);
  assert.deepEqual(entered, [0, 1, 2, 3, 4, 5]);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("bounded concurrency validates inputs and handles an empty batch", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => null), []);
  await assert.rejects(() => mapWithConcurrency({}, 2, async () => null), /array/);
  await assert.rejects(() => mapWithConcurrency([], 0, async () => null), /positive integer/);
  await assert.rejects(() => mapWithConcurrency([], 1, null), /function/);
});
