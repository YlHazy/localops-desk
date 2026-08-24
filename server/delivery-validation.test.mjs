import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { inspectPetPng, scanPrivateIdentityText, validateDelivery } from "../scripts/validate-delivery.mjs";

test("repository plugin and delivery references are valid", () => {
  assert.deepEqual(validateDelivery(), { ok: true, errors: [] });
});

test("pet gate accepts only exact alpha-capable PNG metadata", () => {
  const valid = pngFixture({ width: 1536, height: 1872, colorType: 6 });
  assert.equal(inspectPetPng(valid).ok, true);

  const opaque = inspectPetPng(pngFixture({ width: 1536, height: 1872, colorType: 2 }));
  assert.equal(opaque.ok, false);
  assert.match(opaque.errors.join(" "), /no alpha/);

  const wrongSize = inspectPetPng(pngFixture({ width: 1151, height: 1367, colorType: 6 }));
  assert.equal(wrongSize.ok, false);
  assert.match(wrongSize.errors.join(" "), /expected 1536x1872/);
});

test("compact companion uses a bounded transparent Sentry Otter cutout", () => {
  const asset = new URL("../src/assets/localops-sentry-otter.png", import.meta.url);
  const metadata = inspectPetPng(readFileSync(asset), statSync(asset).size);
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  assert.equal(metadata.hasTransparency, true);
  assert.equal(metadata.width, 1136);
  assert.equal(metadata.height, 1385);
  assert.ok(metadata.fileSize < 2 * 1024 * 1024);
  assert.match(petSource, /localops-sentry-otter\.png/);
  assert.match(petSource, /<img src=\{sentryOtterUrl\} alt=""/);
  assert.doesNotMatch(petSource, /pet-ear|pet-eye|pet-mouth/);
});

test("private identity scanner recognizes former project infrastructure without storing it as a fixture", () => {
  const formerDomain = ["https://", "ai", "2law", ".cn/health"].join("");
  const formerProject = ["lex", "hub", "-prod-01"].join("");
  assert.deepEqual(scanPrivateIdentityText(`${formerDomain} ${formerProject}`), [
    "former product project identifier",
    "former product domain",
  ]);
  assert.deepEqual(scanPrivateIdentityText("sample-service localhost"), []);
});

test("report sharing keeps internal and minimal-disclosure paths visibly separate", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /INTERNAL \/ 仅内部/);
  assert.match(appSource, /确认复制包含服务器身份的内部材料/);
  assert.match(appSource, /MINIMAL \/ 可讨论/);
  assert.match(appSource, /selectedBrief/);
  assert.doesNotMatch(appSource, /适合复制给同事|请打开文本报告并手动复制/);
});

test("the desk cannot keep a healthy headline after evidence expires", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  assert.match(appSource, /trustworthyDashboard\(dashboard, now\)/);
  assert.match(appSource, /EVIDENCE HOLD \/ 证据封条/);
  assert.match(appSource, /上次结果已过期，不能证明当前正常/);
  assert.match(appSource, /currentDashboard\.counts/);
  assert.match(appSource, /<PetMode[\s\S]*now=\{now\}/);
  assert.match(petSource, /dashboard: DashboardStatus;\s+now: number;/);
  assert.doesNotMatch(petSource, /useState\(\(\) => Date\.now\(\)\)/);
  assert.doesNotMatch(appSource, /dashboard\.counts/);
});

test("every desk-opened pet participates in anonymous presence", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /window\.open\(petModePath\(crypto\.randomUUID\(\)\)/);
  assert.doesNotMatch(appSource, /window\.open\(`\$\{window\.location\.origin\}\/\?mode=pet`/);
});

test("desk and pet expose one truthful local-status recovery contract", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const syncSource = readFileSync(new URL("../src/desk-sync.mjs", import.meta.url), "utf8");
  assert.match(syncSource, /30 秒后自动重试/);
  assert.match(syncSource, /不会巡检或改动服务器/);
  assert.doesNotMatch(syncSource, /自动同步暂停/);
  assert.match(appSource, /setLastPetSyncAt\(syncedAt\)/);
  assert.match(appSource, /lastSyncedAt=\{lastPetSyncAt\}/);
  assert.match(appSource, /className="boot-recovery-card"/);
  assert.match(appSource, /className="sync-recovery-card"/);
  assert.match(petSource, /localRecoveryCopy\(lastSyncedAt, now\)/);
  assert.match(petSource, /<p>\{recovery\.boundary\}<\/p>/);
});

test("desk, pet, runtime, and portable build share one resource judgment contract", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("./runtime.mjs", import.meta.url), "utf8");
  const portableSource = readFileSync(new URL("../scripts/package-portable.mjs", import.meta.url), "utf8");
  assert.match(appSource, /resourceSignalStatus\(selectedHost\)/);
  assert.match(appSource, /resourceSignalSummary\(selectedHost\)/);
  assert.match(petSource, /hostGuidance\(priorityHost, !stale\)/);
  assert.match(runtimeSource, /classifyCollectedStatus\(http\.status, ssh\)/);
  assert.match(portableSource, /shared\/evidence-judgment\.mjs/);
});

test("desk and pet share automatic priority focus instead of trusting API row order", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const prioritySource = readFileSync(new URL("../src/host-priority.mjs", import.meta.url), "utf8");
  assert.match(appSource, /prioritizeHosts\(displayDashboard\?\.hosts \?\? \[\]\)/);
  assert.match(appSource, /selectFocusHost\(priorityHosts, selectedHostId\)/);
  assert.match(appSource, /手动查看 · 全局优先级未改变/);
  assert.match(appSource, /回到最高优先级/);
  assert.match(petSource, /prioritizeHosts\(dashboard\.hosts/);
  assert.match(prioritySource, /critical: 0, warning: 1, unknown: 2, healthy: 3/);
  assert.doesNotMatch(appSource, /prev \?\? (?:status|snapshot\.status)\.hosts\[0\]/);
});

function pngFixture({ width, height, colorType }) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.from([
      width >>> 24, width >>> 16, width >>> 8, width,
      height >>> 24, height >>> 16, height >>> 8, height,
      8, colorType, 0, 0, 0,
    ])),
    chunk("IDAT", Buffer.from([0])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, payload, Buffer.alloc(4)]);
}
