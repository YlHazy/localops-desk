import assert from "node:assert/strict";
import test from "node:test";
import { petLifecycleCopy, petRuntimeMode } from "./pet-lifecycle.mjs";

const sessionId = "7dc0de3a-345d-4e34-a61c-c30c693bea66";

test("pet runtime mode requires a valid launcher session and a bounded ownership marker", () => {
  assert.equal(petRuntimeMode(`?mode=pet&session=${sessionId}&runtime=owned`), "owned");
  assert.equal(petRuntimeMode(`?mode=pet&session=${sessionId}&runtime=existing`), "existing");
  assert.equal(petRuntimeMode(`?mode=pet&session=${sessionId}&runtime=desktop`), "desktop");
  assert.equal(petRuntimeMode(`?mode=pet&session=${sessionId}&runtime=service`), "unknown");
  assert.equal(petRuntimeMode("?mode=pet&runtime=owned"), "preview");
});

test("pet lifecycle copy makes close behavior explicit without claiming hidden background work", () => {
  assert.match(petLifecycleCopy("desktop").detail, /系统托盘.+退出 LocalOps/);
  assert.match(petLifecycleCopy("owned").detail, /关闭桌宠.+约 10 秒内结束/);
  assert.match(petLifecycleCopy("existing").detail, /已有 LocalOps 服务继续运行/);
  assert.match(petLifecycleCopy("preview").detail, /Windows 启动器/);
  assert.match(petLifecycleCopy("unknown").detail, /没有足够信息/);
});
