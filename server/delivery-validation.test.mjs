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
  assert.match(appSource, /可安全讨论/);
  assert.match(appSource, /className="internal-report-details"/);
  assert.match(appSource, /这份材料包含服务器身份/);
  assert.match(appSource, /查看完整脱敏内容/);
  assert.match(appSource, /selectedBrief/);
  assert.doesNotMatch(appSource, /INTERNAL \/ 仅内部|MINIMAL \/ 可讨论/);
  assert.doesNotMatch(appSource, /适合复制给同事|请打开文本报告并手动复制/);
});

test("Codex connection explains bounded capability before developer endpoints", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /连接 Codex/);
  assert.match(appSource, /Codex 可以/);
  assert.match(appSource, /Codex 不可以/);
  assert.match(appSource, /不能|不可以/);
  assert.match(appSource, /className="agent-api-details"/);
  assert.match(appSource, /codex plugin add localops-guardian@localops-desk/);
});

test("secondary work pages keep the live status compact", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /selectedTab === "overview" \? "overview-tab" : "work-tab"/);
  assert.match(appSource, /className=\{`topbar \$\{selectedTab === "overview" \? "" : "compact"\}`\}/);
  assert.match(styles, /\.topbar\.compact/);
  assert.match(styles, /\.work-tab \.practice-banner/);
  assert.match(appSource, /lastCheckOutcome && selectedTab === "overview"/);
  assert.match(appSource, /navigation\.scrollTo/);
});

test("first watch uses beginner language for the recommended evidence source", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /健康检查地址 · 推荐/);
  assert.match(appSource, /只向这个地址发送 HTTP GET/);
  assert.doesNotMatch(appSource, /只写名称和 Health URL/);
});

test("expired evidence stays out of the current overview and pet glance", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  assert.match(appSource, /fresh \? resourceSignalSummary\(host\) : "待更新"/);
  assert.match(appSource, /selectedEvidenceCurrent \? selectedInternalSignal\.status : "待重新检查"/);
  assert.match(appSource, /上次检查记录（已过期）/);
  assert.match(petSource, /if \(!host \|\| !fresh\) return/);
  assert.match(petSource, /petIssueLine\(priorityHost, priorityFresh/);
  assert.match(petSource, /snapshotTrust\.state === "stale" \? "证据已过期"/);
});

test("server detail keeps actions and facts primary while folding bounded diagnosis evidence", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  const diagnosisSource = readFileSync(new URL("../shared/host-diagnosis.mjs", import.meta.url), "utf8");
  assert.match(appSource, /\/api\/diagnostics\/\$\{encodeURIComponent\(hostId\)\}/);
  assert.match(appSource, /自动查原因/);
  assert.match(appSource, /className="detail-primary-actions"/);
  assert.match(appSource, /<dl className="server-facts">/);
  assert.match(appSource, /<details className={`diagnostic-proof/);
  assert.match(appSource, /<summary><strong>技术详情<\/strong>/);
  assert.match(appSource, /selectedDiagnosis\.diagnosis\.layer === "entry"/);
  assert.match(appSource, /审阅 Nginx 重载/);
  assert.match(appSource, /查看只读检查/);
  assert.match(appSource, /无法连接本地 LocalOps 服务/);
  assert.doesNotMatch(appSource, /查看排查步骤/);
  assert.doesNotMatch(appSource, /memoryPercent \?\? "—"\}%/);
  assert.doesNotMatch(appSource, /diskPercent \?\? "—"\}%/);
  assert.match(serverSource, /trigger: "manual-diagnosis"/);
  assert.match(serverSource, /diagnoseHost\(hostResult\)/);
  assert.match(serverSource, /collectDeepEvidence/);
  assert.match(serverSource, /没有执行重启、清理、部署或配置变更/);
  assert.doesNotMatch(diagnosisSource, /host\.name|host\.healthUrl|host\.sshAlias|host\.composeProject|host\.evidence/);
});

test("pet local disconnect routes the main action to local recovery", () => {
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const petStyles = readFileSync(new URL("../src/pet-v2.css", import.meta.url), "utf8");
  assert.match(petSource, /syncError\s*\? onRetrySync\(\)/);
  assert.match(petSource, /syncError\s*\? "本地连接断开"/);
  assert.match(petSource, /title=\{syncError \? `\$\{recovery\.detail\} \$\{recovery\.boundary\}`/);
  assert.match(petStyles, /grid-template-rows: 36px minmax\(0, 1fr\) 44px 38px/);
  assert.match(petStyles, /max-height: 236px/);
});

test("the desk cannot keep a healthy headline after evidence expires", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const discussionSource = readFileSync(new URL("../src/discussion-brief.mjs", import.meta.url), "utf8");
  assert.match(appSource, /trustworthyDashboard\(dashboard, now\)/);
  assert.match(appSource, /上次检查已过期/);
  assert.match(appSource, /<h1>\{currentMessage\.title\}<\/h1>/);
  assert.match(appSource, /hostEvidenceTimestamp\(dashboard, selectedHost\)/);
  assert.match(appSource, /<PetMode[\s\S]*now=\{now\}/);
  assert.match(petSource, /trustworthyDashboard\(dashboard, now\)/);
  assert.match(petSource, /hostEvidenceIsFresh\(dashboard, priorityHost, now\)/);
  assert.match(discussionSource, /hostEvidenceIsFresh\(dashboard, host, now\)/);
  assert.match(petSource, /dashboard: DashboardStatus;\s+now: number;/);
  assert.doesNotMatch(petSource, /useState\(\(\) => Date\.now\(\)\)/);
  assert.doesNotMatch(appSource, /dashboard\.counts/);
});

test("every desk-opened pet participates in anonymous presence", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /window\.open\(petModePath\(crypto\.randomUUID\(\), "existing"\)/);
  assert.doesNotMatch(appSource, /window\.open\(`\$\{window\.location\.origin\}\/\?mode=pet`/);
});

test("pet close behavior distinguishes a launcher-owned API from an existing LocalOps service", () => {
  const launcherSource = readFileSync(new URL("../scripts/launch-pet.mjs", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const lifecycleSource = readFileSync(new URL("../src/pet-lifecycle.mjs", import.meta.url), "utf8");
  assert.match(launcherSource, /runtimeMode: petRuntimeModeForApi\(alreadyRunning\)/);
  assert.match(launcherSource, /await waitForOwnedApiReady\(url, apiProcess\)/);
  assert.match(petSource, /petLifecycleCopy\(petRuntimeMode\(window\.location\.search\)\)/);
  assert.match(lifecycleSource, /关闭桌宠后，它启动的本地值守约 10 秒内结束/);
  assert.match(lifecycleSource, /已有 LocalOps 服务继续运行/);
  assert.doesNotMatch(lifecycleSource, /healthUrl|sshAlias|composeProject|evidence/);
});

test("pet alerts support a quiet receipt and open the focused desk without sending identity to the API", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const watchSource = readFileSync(new URL("../src/pet-watch.mjs", import.meta.url), "utf8");
  const navigationSource = readFileSync(new URL("../src/pet-navigation.mjs", import.meta.url), "utf8");
  const desktopSource = readFileSync(new URL("../desktop/main.mjs", import.meta.url), "utf8");
  const preloadSource = readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
  assert.match(petSource, /setAlertReceipt\(\{ outcome: "suppressed"/);
  assert.match(petSource, /className={`pet-sheet-layer \$\{expanded \? "open" : ""\}`}/);
  assert.match(petSource, /打开控制台/);
  assert.match(petSource, /visibleCounts\.unknown/);
  assert.match(petSource, /permissionSurface: window\.localOpsDesktop \? "windows" : "browser"/);
  assert.match(petSource, /kind: "status"[\s\S]*critical: current\.critical[\s\S]*warning: current\.warning[\s\S]*unknown: current\.unknown/);
  assert.match(desktopSource, /preload: appPath\("desktop", "preload\.cjs"\)/);
  assert.match(preloadSource, /require\("electron"\)/);
  assert.doesNotMatch(preloadSource, /\bimport\b/);
  assert.match(preloadSource, /showNotification: \(request\) => ipcRenderer\.invoke\("desktop:show-notification", request\)/);
  assert.match(desktopSource, /desktopAlertCopy\(request\)/);
  assert.match(desktopSource, /tray\.displayBalloon\(\{ \.\.\.copy, largeIcon: false, respectQuietTime: true \}\)/);
  assert.match(desktopSource, /tray\.on\("balloon-click", \(\) => showDesk\(\)\)/);
  assert.match(desktopSource, /rejectsUnsafeNotification/);
  assert.match(watchSource, /outcome: "suppressed"/);
  assert.doesNotMatch(watchSource, /Edge 站点权限/);
  assert.match(appSource, /petDeskIntent\(window\.location\.hash\)/);
  assert.match(navigationSource, /return `\/#\$\{params\.toString\(\)}`/);
  assert.doesNotMatch(navigationSource, /healthUrl|sshAlias|composeProject|evidence/);
  assert.doesNotMatch(preloadSource, /title|body|content|host|address|command|evidence/);
});

test("value watch settings derive a three-layer relay from bounded local state", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const watchSource = readFileSync(new URL("../src/watch-readiness.mjs", import.meta.url), "utf8");
  const preferenceSource = readFileSync(new URL("../src/pet-watch.mjs", import.meta.url), "utf8");
  assert.match(appSource, /\["scheduler", Settings2, "提醒与值守"\]/);
  assert.match(appSource, /watch-readiness-summary/);
  assert.match(appSource, /watch-setting-row/);
  assert.match(appSource, /watch-advanced/);
  assert.doesNotMatch(appSource, /watch-checklist/);
  assert.doesNotMatch(appSource, /coverage-ledger/);
  assert.match(appSource, /开启并测试/);
  assert.match(appSource, /finishNotificationCalibration/);
  assert.match(appSource, /readNotificationPreference\(window\.localStorage\)/);
  assert.match(appSource, /readNotificationCalibration\(window\.localStorage\)/);
  assert.match(appSource, /event\.key === petNotificationPreferenceKey/);
  assert.match(appSource, /event\.key === petNotificationCalibrationKey/);
  assert.match(watchSource, /coverage\.collectible > 0/);
  assert.match(watchSource, /desktopRuntime && notificationsEnabled && notificationsCalibrated/);
  assert.match(watchSource, /当前是浏览器预览；原生托盘提醒只在桌面版可校准/);
  assert.match(preferenceSource, /localops\.pet\.notifications/);
  assert.match(preferenceSource, /localops\.pet\.notifications-calibrated/);
  assert.match(petSource, /readNotificationPreference\(window\.localStorage\)/);
  assert.doesNotMatch(watchSource, /healthUrl|sshAlias|composeProject|hostName|command|address/);
});

test("desktop pinning is session-scoped, reversible, and bounded to one exact Edge title", () => {
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("./pet-window.mjs", import.meta.url), "utf8");
  const helperSource = readFileSync(new URL("../scripts/set-pet-topmost.ps1", import.meta.url), "utf8");
  assert.match(petSource, /requestPetWindowTopmost\(petSessionId, enabled\)/);
  assert.match(petSource, /取消置顶/);
  assert.match(readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8"), /await requestPetWindowTopmost\(sessionId, false\)/);
  assert.match(serverSource, /set-pet-topmost\.ps1/);
  assert.match(helperSource, /Get-Process -Name "msedge"/);
  assert.match(helperSource, /MainWindowTitle -ceq \$WindowTitle/);
  assert.match(helperSource, /SetWindowPos/);
  assert.doesNotMatch(helperSource, /\bregistry\b|\bservice\b|\bschtasks\b|Invoke-Expression|Start-Process/i);
});

test("packaged SSH launcher opts in only for the child process and restores the shell", () => {
  const launcherSource = readFileSync(new URL("../scripts/start-packaged-ssh.ps1", import.meta.url), "utf8");
  assert.match(launcherSource, /Test-Path -LiteralPath \$taskExecutable -PathType Leaf/);
  assert.match(launcherSource, /\$env:LOCALOPS_ENABLE_SSH = '1'/);
  assert.match(launcherSource, /Start-Process -FilePath \$taskExecutable -PassThru/);
  assert.match(launcherSource, /Remove-Item Env:LOCALOPS_ENABLE_SSH/);
  assert.match(launcherSource, /\$env:LOCALOPS_ENABLE_SSH = \$taskPreviousMode/);
  assert.doesNotMatch(launcherSource, /setx|registry|schtasks|service|Invoke-Expression|DownloadString|Invoke-WebRequest/i);
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
  assert.match(petSource, /recovery\.detail/);
  assert.match(petSource, /recovery\.boundary/);
});

test("desk, pet, runtime, and portable build share one resource judgment contract", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("./runtime.mjs", import.meta.url), "utf8");
  const portableSource = readFileSync(new URL("../scripts/package-portable.mjs", import.meta.url), "utf8");
  assert.match(appSource, /resourceSignalStatus\(selectedHost\)/);
  assert.match(appSource, /resourceSignalSummary\(selectedHost\)/);
  assert.match(petSource, /hostGuidance\(priorityHost, priorityFresh\)/);
  assert.match(runtimeSource, /classifyCollectedStatus\(http\.status, ssh\)/);
  assert.match(portableSource, /shared\/evidence-judgment\.mjs/);
  assert.match(portableSource, /shared\/host-diagnosis\.mjs/);
});

test("desk and pet share automatic priority focus instead of trusting API row order", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const prioritySource = readFileSync(new URL("../src/host-priority.mjs", import.meta.url), "utf8");
  assert.match(appSource, /prioritizeHosts\(displayDashboard\?\.hosts \?\? \[\]\)/);
  assert.match(appSource, /selectFocusHost\(priorityHosts, selectedHostId\)/);
  assert.match(appSource, /setDetailsOpen\(true\)/);
  assert.match(appSource, /className={`home-grid \$\{detailsOpen \? "details-open" : ""\}`}/);
  assert.match(petSource, /prioritizeHosts\(trustedDashboard\.hosts\)/);
  assert.match(prioritySource, /critical: 0, warning: 1, unknown: 2, healthy: 3/);
  assert.doesNotMatch(appSource, /prev \?\? (?:status|snapshot\.status)\.hosts\[0\]/);
});

test("desk, pet, and runtime share host-scoped evidence readiness", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("./runtime.mjs", import.meta.url), "utf8");
  const readinessSource = readFileSync(new URL("../src/evidence-readiness.mjs", import.meta.url), "utf8");
  assert.match(appSource, /evidenceReadiness\(dashboard, selectedHost\)/);
  assert.match(appSource, /selectedReadiness\.canCollect/);
  assert.match(appSource, /资源状态尚未检查/);
  assert.match(petSource, /evidenceReadiness\(dashboard, focusHost\)/);
  assert.match(petSource, /入口正常，资源还没检查/);
  assert.match(runtimeSource, /options\.mode === "ssh-enabled" && host\.sshAlias\?\.trim\(\)/);
  assert.match(readinessSource, /state: "ssh-disabled"/);
  assert.doesNotMatch(appSource, /hosts\.some\(\(host\) => Boolean\(host\.healthUrl \|\| host\.sshAlias\)\)/);
});

test("batch checks, scheduler, desk, pet, and portable build share collection coverage", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const petSource = readFileSync(new URL("../src/PetMode.tsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  const coverageSource = readFileSync(new URL("../shared/collection-coverage.mjs", import.meta.url), "utf8");
  const portableSource = readFileSync(new URL("../scripts/package-portable.mjs", import.meta.url), "utf8");
  assert.match(appSource, /batchCoverage\.collectible/);
  assert.match(appSource, /自动检查会跳过/);
  assert.match(petSource, /collectionCoverage\(dashboard\.mode, dashboard\.hosts/);
  assert.match(serverSource, /hostCollectionPlan\(mode, hostItem\)\.canCollect/);
  assert.match(serverSource, /NO_COLLECTIBLE_EVIDENCE/);
  assert.doesNotMatch(coverageSource, /tags\.includes/);
  assert.match(portableSource, /shared\/collection-coverage\.mjs/);
});

test("scheduler outcomes are persisted by the server and rendered with an explicit recovery action", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  const outcomeSource = readFileSync(new URL("../src/scheduler-outcome.mjs", import.meta.url), "utf8");
  assert.match(serverSource, /schedulerLastOutcome/);
  assert.match(serverSource, /scheduled-manual/);
  assert.match(serverSource, /SCHEDULER_RUNTIME_FAILURE/);
  assert.match(serverSource, /BEGIN IMMEDIATE/);
  assert.match(serverSource, /maintenance-warning/);
  assert.match(appSource, /\/api\/scheduler\/run-now/);
  assert.match(appSource, /checking \? "检查中" : "立即检查"/);
  assert.match(outcomeSource, /stopped-no-evidence/);
  assert.doesNotMatch(serverSource, /schedulerLastMessage[^\n]*error\?\.message/);
});

test("check history renders a local-only evidence receipt instead of raw internal fields", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  const historySource = readFileSync(new URL("../src/check-history.mjs", import.meta.url), "utf8");
  assert.match(serverSource, /GET.*\/api\/checks\/:id/);
  assert.match(serverSource, /safeEvidenceList/);
  assert.match(serverSource, /CHECK_RUN_NOT_FOUND/);
  assert.doesNotMatch(serverSource.match(/function checkDetail[\s\S]*?\n}\n/)?.[0] || "", /sshAlias|healthUrl|composeProject|tags/);
  assert.match(appSource, /最近 20 次检查保存在本机；查看记录不会重新连接服务器/);
  assert.match(appSource, /friendlyCheckSummary\(check\.summary\)/);
  assert.match(appSource, /本次结论/);
  assert.match(appSource, /history-host-card/);
  assert.match(historySource, /不能把服务器当作正常/);
});

test("action plans distinguish read-only templates from mutating commands", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(appSource, /dryRun\.riskTier !== "read-only"/);
  assert.match(appSource, /这是会改变服务器的操作/);
  assert.match(appSource, /服务重启仍未开放/);
  assert.match(appSource, /actionCapability\?\.enabled/);
  assert.match(appSource, /dryRun\?\.actionKey === "inspect-service" \? "selected"/);
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
