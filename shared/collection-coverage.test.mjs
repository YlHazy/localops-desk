import assert from "node:assert/strict";
import test from "node:test";
import { collectionCoverage, hostCollectionPlan } from "./collection-coverage.mjs";

test("host collection plans separate configured evidence from a disabled alias", () => {
  assert.equal(hostCollectionPlan("safe-simulated", { healthUrl: "https://example.test/health", sshAlias: "" }).state, "http");
  assert.equal(hostCollectionPlan("safe-simulated", { healthUrl: "", sshAlias: "saved" }).state, "ssh-disabled");
  assert.equal(hostCollectionPlan("ssh-enabled", { healthUrl: "", sshAlias: "saved" }).state, "ssh-only");
  assert.equal(hostCollectionPlan("ssh-enabled", { healthUrl: "https://example.test/health", sshAlias: "saved" }).state, "combined");
});

test("coverage reports complete, partial, and blocked hosts without names or targets", () => {
  const coverage = collectionCoverage("safe-simulated", [
    { healthUrl: "https://one.test/health", sshAlias: "" },
    { healthUrl: "", sshAlias: "saved" },
    { healthUrl: "", sshAlias: "" },
    { isOfflineDemo: true }
  ]);
  assert.deepEqual(coverage, {
    total: 4,
    collectible: 2,
    blocked: 2,
    complete: 1,
    partial: 1,
    counts: { offline: 1, combined: 0, http: 1, "ssh-only": 0, "ssh-disabled": 1, missing: 1 }
  });
  assert.doesNotMatch(JSON.stringify(coverage), /one\.test|saved/);
});

test("an editable tag cannot impersonate a verified offline practice host", () => {
  const plan = hostCollectionPlan("safe-simulated", { tags: ["localops:offline-demo"], healthUrl: "", sshAlias: "" });
  assert.equal(plan.state, "missing");
  assert.equal(plan.canCollect, false);
});
