import assert from "node:assert/strict";
import test from "node:test";
import { codexDiscussionLink, discussionBrief, httpSignalStatus, runtimeSignalStatus, sshSignalStatus } from "./discussion-brief.mjs";

test("discussion brief structurally excludes local identity and raw evidence", () => {
  const privateMarkers = [
    "PRIVATE_CUSTOMER_HOST",
    "PRIVATE_PRODUCTION_ENV",
    "PRIVATE_DATABASE_ROLE",
    "PRIVATE_SSH_ALIAS",
    "https://private.example.test/health",
    "PRIVATE_COMPOSE_PROJECT",
    "PRIVATE_RAW_EVIDENCE",
    "PRIVATE_SUMMARY"
  ];
  const dashboard = {
    observedAt: "2026-08-24T00:00:00.000Z",
    staleAfterMs: 30 * 60 * 1000
  };
  const host = {
    status: "warning",
    name: privateMarkers[0],
    environment: privateMarkers[1],
    role: privateMarkers[2],
    sshAlias: privateMarkers[3],
    healthUrl: privateMarkers[4],
    composeProject: privateMarkers[5],
    httpStatus: "HTTP 200 PRIVATE_HTTP_DETAIL",
    sshStatus: "Permission denied PRIVATE_SSH_DETAIL",
    dockerStatus: "docker unavailable PRIVATE_RUNTIME_DETAIL",
    evidence: [privateMarkers[6]],
    summary: privateMarkers[7]
  };
  const brief = discussionBrief(dashboard, host, Date.parse("2026-08-24T00:05:00.000Z"));
  for (const marker of privateMarkers) assert.equal(brief.includes(marker), false, `brief leaked ${marker}`);
  assert.doesNotMatch(brief, /PRIVATE_(HTTP|SSH|RUNTIME)_DETAIL/);
  assert.match(brief, /本地名称、环境和角色已省略/);
  assert.match(brief, /网页\/API：有效证据显示正常/);
  assert.match(brief, /SSH 管理通道：存在需要复核的信号/);
  assert.match(brief, /隐私：未包含服务器名称/);
});

test("Codex deep link contains only the reviewable minimal-disclosure prompt", () => {
  const brief = discussionBrief({ observedAt: null, staleAfterMs: 1 }, {
    status: "unknown",
    httpStatus: "not checked",
    sshStatus: "not checked",
    dockerStatus: "not checked"
  });
  const link = codexDiscussionLink(brief);
  assert.match(link, /^codex:\/\/new\?prompt=/);
  const prompt = decodeURIComponent(new URL(link).searchParams.get("prompt"));
  assert.match(prompt, /最小披露摘要/);
  assert.match(prompt, /未知状态不按正常处理/);
  assert.match(prompt, /不要执行任何变更/);
  assert.doesNotMatch(prompt, /https?:\/\/|sshAlias|composeProject/);
});

test("offline practice evidence uses the same healthy classifiers as the desk", () => {
  const practiceHost = {
    httpStatus: "simulated 200 ready",
    sshStatus: "simulated ok",
    dockerStatus: "compose healthy"
  };
  assert.equal(httpSignalStatus(practiceHost), "healthy");
  assert.equal(sshSignalStatus(practiceHost), "healthy");
  assert.equal(runtimeSignalStatus(practiceHost), "healthy");
});

test("expired discussion evidence downgrades every shareable signal atomically", () => {
  const brief = discussionBrief({
    observedAt: "2026-08-24T00:00:00.000Z",
    staleAfterMs: 60_000
  }, {
    status: "healthy",
    httpStatus: "HTTP 200 from private.example.test",
    sshStatus: "ok",
    dockerStatus: "docker checked"
  }, Date.parse("2026-08-24T00:01:00.001Z"));

  assert.match(brief, /状态：未知/);
  assert.match(brief, /证据时效：证据已过期/);
  assert.equal((brief.match(/没有足够的新鲜证据/g) ?? []).length, 3);
  assert.doesNotMatch(brief, /有效证据显示正常|有效证据显示失败|存在需要复核的信号/);
  assert.match(brief, /未知状态不按正常处理/);
});
