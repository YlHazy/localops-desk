import assert from "node:assert/strict";
import test from "node:test";
import { watchReadiness } from "./watch-readiness.mjs";

const coverage = (collectible, total = collectible, blocked = total - collectible) => ({ collectible, total, blocked, complete: collectible, partial: 0 });

test("watch readiness recommends the first missing daily-watch layer in order", () => {
  const empty = watchReadiness({ coverage: coverage(0, 0, 0), schedulerEnabled: false, desktopRuntime: false, notificationsEnabled: false });
  assert.equal(empty.readyCount, 0);
  assert.equal(empty.headline, "下一步：证据来源");
  assert.equal(empty.items[0].tone, "blocked");
  assert.match(empty.items[2].detail, /浏览器预览/);

  const manual = watchReadiness({ coverage: coverage(2, 3, 1), schedulerEnabled: false, desktopRuntime: true, notificationsEnabled: false });
  assert.equal(manual.readyCount, 1);
  assert.equal(manual.headline, "下一步：自动节奏");
  assert.equal(manual.items[0].tone, "attention");
  assert.match(manual.items[0].detail, /1 台仍会跳过/);
});

test("only a native opted-in alert channel completes the daily-watch relay", () => {
  const browser = watchReadiness({ coverage: coverage(2), schedulerEnabled: true, desktopRuntime: false, notificationsEnabled: true });
  assert.equal(browser.readyCount, 2);
  assert.equal(browser.complete, false);

  const complete = watchReadiness({ coverage: coverage(2), schedulerEnabled: true, desktopRuntime: true, notificationsEnabled: true });
  assert.equal(complete.readyCount, 3);
  assert.equal(complete.complete, true);
  assert.equal(complete.headline, "日常值守链路已接通");
});
