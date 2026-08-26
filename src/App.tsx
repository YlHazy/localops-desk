import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Globe2,
  FileText,
  History,
  MessageCircle,
  MonitorUp,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deskSyncCopy, fetchDeskSnapshot, fetchPetSnapshot, hostEvidenceIsFresh, hostEvidenceTimestamp, localRecoveryCopy, schedulerDraftAfterSync, trustworthyDashboard } from "./desk-sync.mjs";
import type { DeskSyncState } from "./desk-sync.mjs";
import { checkDecisionCopy, checkHistoryFilters, checkKindCopy, checkScopeCopy, checkTriggerCopy, filterChecks, friendlyCheckSummary, retainCheckSelection } from "./check-history.mjs";
import type { CheckHistoryFilter } from "./check-history.mjs";
import { codexDiscussionLink, discussionBrief } from "./discussion-brief.mjs";
import { evidenceReadiness } from "./evidence-readiness.mjs";
import { manualFocusSelection, prioritizeHosts, retainFocusSelection, selectFocusHost } from "./host-priority.mjs";
import { PetMode } from "./PetMode";
import { createLatestRequestGate, resolveLatestRequest } from "./latest-request-gate.mjs";
import { operationUiState } from "./operation-state.mjs";
import type { PendingOperation } from "./operation-state.mjs";
import { petDeskIntent, petDeskPath } from "./pet-navigation.mjs";
import type { PetDeskTab } from "./pet-navigation.mjs";
import { isPetSessionId, petModePath } from "./pet-presence.mjs";
import { petNotificationCalibrationKey, petNotificationPreferenceKey, readNotificationCalibration, readNotificationPreference, writeNotificationCalibration, writeNotificationPreference } from "./pet-watch.mjs";
import { requestPetWindowTopmost } from "./pet-window.mjs";
import { schedulerOutcomeCopy } from "./scheduler-outcome.mjs";
import { watchReadiness } from "./watch-readiness.mjs";
import type { ActionApproval, ActionCapability, ActionExecutionStep, ActionReceipt, CheckDetail, CheckRun, DashboardStatus, DiagnosisRun, DryRunAction, HostConfigInput, HostState, RetentionResult, SchedulerState, StartupState, Status } from "./types";
import { resourceSignalStatus, resourceSignalSummary } from "../shared/evidence-judgment.mjs";
import { collectionCoverage } from "../shared/collection-coverage.mjs";
import type { CollectionCoverage } from "../shared/collection-coverage.mjs";

const statusLabels: Record<Status, string> = {
  healthy: "正常",
  warning: "关注",
  critical: "故障",
  unknown: "未知"
};

const emptyHostForm: HostConfigInput = {
  name: "",
  environment: "personal",
  role: "server",
  sshAlias: "",
  healthUrl: "",
  composeProject: "",
  tags: []
};

const actionReceiptLabels: Record<ActionReceipt["status"], string> = {
  running: "执行中",
  succeeded: "已完成并复查",
  "verification-warning": "已执行，复查待确认",
  failed: "未完成",
  interrupted: "回执中断"
};

const deskIntentAtLoad = petDeskIntent(window.location.hash);
const onboardingPetUrl = new URL("./assets/localops-sentry-otter-2d.png", import.meta.url).href;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const timeoutMs = method === "GET" ? 8_000 : 60_000;
  let res: Response;
  try {
    res = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`本地 API ${Math.round(timeoutMs / 1000)} 秒内没有响应`);
    }
    if (error instanceof TypeError) {
      throw new Error("无法连接本地 LocalOps 服务");
    }
    throw error;
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

function formatTime(value: string | null) {
  if (!value) return "尚未检查";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function overallMessage(counts: Record<Status, number>, evidenceExpired = false, partialEvidenceCount = 0) {
  if (evidenceExpired) {
    return {
      title: `${counts.unknown ?? 0} 台状态待更新`,
      description: "上次检查已过期"
    };
  }
  if ((counts.critical ?? 0) > 0) {
    return {
      title: `${counts.critical} 台服务器故障`,
      description: "需要立即查看"
    };
  }
  if ((counts.warning ?? 0) > 0) {
    return {
      title: `${counts.warning} 台服务器需关注`,
      description: "目前还能使用，但有异常信号"
    };
  }
  if ((counts.unknown ?? 0) > 0) {
    return {
      title: `${counts.unknown} 台尚未检查`,
      description: "运行检查后显示状态"
    };
  }
  if (partialEvidenceCount > 0) {
    return {
      title: `${partialEvidenceCount} 台仅确认入口可用`,
      description: "资源状态尚未检查"
    };
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    title: `${total} 台服务器正常`,
    description: "没有需要处理的问题"
  };
}

function shortSignal(value: string) {
  if (!value) return "未检查";
  if (value.length <= 72) return value;
  return `${value.slice(0, 72)}...`;
}

function friendlyHttpStatus(value: string) {
  if (!value || value === "not checked") return "未检查";
  if (value === "simulated 200 ready") return "模拟正常";
  if (value === "simulated not observed") return "模拟未观测";
  if (/timeout|timed out/i.test(value)) return "连接超时";
  return shortSignal(value);
}

function friendlySshStatus(value: string) {
  if (!value || value === "not checked") return "未检查";
  if (value === "not configured") return "未配置";
  if (value === "simulated disabled") return "当前未启用";
  if (value === "simulated ok") return "模拟正常";
  if (value === "ok") return "正常";
  if (/Could not resolve hostname|alias not found|DNS unresolved/i.test(value)) return "SSH alias 不可用";
  if (/Permission denied|publickey/i.test(value)) return "SSH 权限失败";
  if (/timed out|timeout/i.test(value)) return "SSH 连接超时";
  if (/Command failed/i.test(value)) return "SSH 检查失败";
  return shortSignal(value);
}

function friendlyDockerStatus(value: string) {
  if (!value || value === "not checked") return "未检查";
  if (value === "docker checked") return "已检查";
  if (value === "compose healthy") return "模拟正常";
  if (/unavailable/i.test(value)) return "Docker 不可用";
  return shortSignal(value);
}

function friendlyEvidence(value: string) {
  if (/HTTP 200/i.test(value)) return value.replace(/^HTTP 200 from /, "网页/API 正常：");
  if (/Could not resolve hostname|alias not found|DNS unresolved/i.test(value)) return "SSH 检查失败：本机 SSH alias 不存在或无法解析。";
  if (/SSH read-only collector failed/i.test(value)) return "SSH 只读检查失败：请先确认本机 SSH 配置。";
  if (/allowlist/i.test(value)) return "安全边界：只执行固定只读命令，输出会脱敏。";
  return shortSignal(value);
}

function internalSignalSummary(host: HostState) {
  const ssh = friendlySshStatus(host.sshStatus);
  const runtime = friendlyDockerStatus(host.dockerStatus);
  const sshFailed = !["正常", "模拟正常", "未检查", "未配置", "当前未启用"].includes(ssh);
  const runtimeFailed = !["已检查", "模拟正常", "未检查"].includes(runtime);
  if (sshFailed) return { status: ssh, detail: `SSH ${ssh} · 服务 ${runtime}` };
  if (runtimeFailed) return { status: runtime, detail: `SSH ${ssh} · 服务 ${runtime}` };
  if (["正常", "模拟正常"].includes(ssh) && (runtime === "已检查" || runtime === "模拟正常")) return { status: "正常", detail: `SSH ${ssh} · 服务 ${runtime}` };
  return { status: "检查不完整", detail: `SSH ${ssh} · 服务 ${runtime}` };
}

function discussionBriefField(value: string, label: string) {
  const prefix = `${label}：`;
  const line = value.split("\n").find((item) => item.startsWith(prefix));
  return line?.slice(prefix.length).trim() || "当前摘要没有提供这一项。";
}

function evidenceFreshnessAt(observedAt: string | null, staleAfterMs: number, now = Date.now()) {
  if (!observedAt) return { state: "unknown", label: "没有观测证据" };
  const ageMs = now - new Date(observedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > staleAfterMs) {
    return { state: "unknown", label: "证据已过期" };
  }
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  return { state: "fresh", label: minutes === 0 ? "刚刚检查" : `${minutes} 分钟前检查` };
}

function evidenceFreshness(dashboard: DashboardStatus, now = Date.now()) {
  return evidenceFreshnessAt(dashboard.observedAt, dashboard.staleAfterMs, now);
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill ${status}`}>{statusLabels[status]}</span>;
}

function HostPanel({ host, fresh, selected, onSelect }: { host: HostState; fresh: boolean; selected: boolean; onSelect: (trigger: HTMLButtonElement) => void }) {
  return (
    <button className={`host-panel ${selected ? "selected" : ""}`} aria-expanded={selected} aria-controls={selected ? "server-detail" : undefined} onClick={(event) => onSelect(event.currentTarget)}>
      <div className="host-panel-top">
        <span className="host-name"><i className={`host-dot ${host.status}`} aria-hidden="true" />{host.name}</span>
        <span className={`host-status-text ${host.status}`}>{statusLabels[host.status]}</span>
      </div>
      <div className="host-glance">
        <span>HTTP <strong>{fresh ? friendlyHttpStatus(host.httpStatus) : "待更新"}</strong></span>
        <span>SSH <strong>{fresh ? friendlySshStatus(host.sshStatus) : "待更新"}</strong></span>
        <span>资源 <strong>{fresh ? resourceSignalSummary(host) : "待更新"}</strong></span>
        <time>{fresh ? formatTime(host.lastCheckedAt) : "—"}</time>
        <span aria-hidden="true">›</span>
      </div>
      {host.status === "healthy" || !fresh ? null : <p>{host.summary}</p>}
    </button>
  );
}

function EnvironmentRail({ hosts, selectedId, onSelect }: { hosts: HostState[]; selectedId: string; onSelect: (id: string) => void }) {
  const groups = hosts.reduce<Record<string, HostState[]>>((acc, host) => {
    acc[host.environment] = acc[host.environment] || [];
    acc[host.environment].push(host);
    return acc;
  }, {});
  return (
    <section className="rail-panel">
      <h3>环境状态轨</h3>
      {Object.entries(groups).map(([env, items]) => {
        const worst = items.some((item) => item.status === "critical")
          ? "critical"
          : items.some((item) => item.status === "warning")
            ? "warning"
            : items.some((item) => item.status === "unknown")
              ? "unknown"
              : "healthy";
        return (
          <div className="rail-row" key={env}>
            <span className={`rail-dot ${worst}`} />
            <strong>{env}</strong>
            <span>{items.length} hosts</span>
          </div>
        );
      })}
      <div className="rail-hosts">
        {hosts.map((host) => (
          <button key={host.id} className={host.id === selectedId ? "selected" : ""} onClick={() => onSelect(host.id)}>
            <span className={`rail-dot ${host.status}`} />
            {host.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function HostForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  editing,
  saving,
  disabled,
  sshCollectionEnabled
}: {
  form: HostConfigInput;
  setForm: (form: HostConfigInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  editing: boolean;
  saving: boolean;
  disabled: boolean;
  sshCollectionEnabled: boolean;
}) {
  const hasHealthUrl = form.healthUrl.trim().length > 0;
  const hasSshAlias = form.sshAlias.trim().length > 0;
  const update = (key: keyof HostConfigInput, value: string) => {
    setForm({ ...form, [key]: key === "tags" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value });
  };
  return (
    <div className="host-form">
      <div className="host-form-intro">
        <div>
          <strong>{editing ? "修改本机保存的服务器配置" : "填写监控来源"}</strong>
          <small>只要求名称；连接信息可稍后补充，不要填写密码、Token 或私钥。</small>
        </div>
        <span className={hasHealthUrl || (hasSshAlias && sshCollectionEnabled) ? "ready" : "waiting"}>
          {hasHealthUrl
            ? "Health URL 可用"
            : hasSshAlias && sshCollectionEnabled
              ? "只读 SSH 可用"
              : hasSshAlias
                ? "SSH 已登记 · 当前未启用"
                : "保存后保持未检查"}
        </span>
      </div>
      <div className="form-grid host-form-essential">
        <label>服务器名称 *<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="例如：生产 API" /><small>只用于本机显示。</small></label>
        <label className="wide">健康检查地址 · 推荐<input value={form.healthUrl} onChange={(event) => update("healthUrl", event.target.value)} placeholder="https://example.com/health" /><small>只向这个地址发送 HTTP GET；不要填写账号、Token 或查询参数。</small></label>
        <label>SSH 别名 · 可选<input value={form.sshAlias} onChange={(event) => update("sshAlias", event.target.value)} placeholder="例如：my-server" /><small>{sshCollectionEnabled ? "读取 CPU、内存、磁盘和 Docker。" : "已登记也不会在当前模式连接。"}</small></label>
      </div>
      <details className="host-form-advanced" open={editing || undefined}>
        <summary>更多信息</summary>
        <div className="form-grid">
          <label>环境<input value={form.environment} onChange={(event) => update("environment", event.target.value)} placeholder="production" /></label>
          <label>角色<input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="web/api/db" /></label>
          <label>Compose 项目 · 备注<input value={form.composeProject} onChange={(event) => update("composeProject", event.target.value)} placeholder="例如：blog-stack" /><small>仅作本机标记，不会拼入命令。</small></label>
          <label>标签<input value={form.tags.join(", ")} onChange={(event) => update("tags", event.target.value)} placeholder="main, docker" /></label>
        </div>
      </details>
      <div className="form-actions">
        <button className="primary slim" disabled={!form.name.trim() || disabled} onClick={onSubmit}><Save size={16} />{saving ? "保存中" : editing ? "保存配置" : "添加服务器"}</button>
        <button disabled={saving} onClick={onCancel}><X size={16} />取消</button>
      </div>
    </div>
  );
}

export function App() {
  const petMode = new URLSearchParams(window.location.search).get("mode") === "pet";
  const desktopRuntime = Boolean(window.localOpsDesktop);
  const [dashboard, setDashboard] = useState<DashboardStatus | null>(null);
  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [checkFilter, setCheckFilter] = useState<CheckHistoryFilter>("all");
  const [selectedCheckId, setSelectedCheckId] = useState<number | null>(null);
  const [checkDetail, setCheckDetail] = useState<CheckDetail | null>(null);
  const [checkDetailState, setCheckDetailState] = useState<"idle" | "loading" | "current" | "error">("idle");
  const [checkDetailError, setCheckDetailError] = useState("");
  const [selectedHostId, setSelectedHostId] = useState<string | null>(deskIntentAtLoad.hostId);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(deskIntentAtLoad.hostId && (deskIntentAtLoad.tab ?? "overview") === "overview"));
  const [wideDetail, setWideDetail] = useState(() => window.matchMedia("(min-width: 1200px)").matches);
  const detailPanelRef = useRef<HTMLElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const [selectedTab, setSelectedTab] = useState<string>(deskIntentAtLoad.tab ?? "overview");
  const [pendingOperation, setPendingOperation] = useState<PendingOperation>(null);
  const [petSyncing, setPetSyncing] = useState(false);
  const [lastCheckOutcome, setLastCheckOutcome] = useState<{ status: Status; summary: string; coverage: CollectionCoverage } | null>(null);
  const [dryRun, setDryRun] = useState<DryRunAction | null>(null);
  const [actionHostId, setActionHostId] = useState<string | null>(null);
  const [dryRunCopied, setDryRunCopied] = useState(false);
  const [actionCapability, setActionCapability] = useState<ActionCapability | null>(null);
  const [actionReceipts, setActionReceipts] = useState<ActionReceipt[]>([]);
  const [actionApproval, setActionApproval] = useState<ActionApproval | null>(null);
  const [actionPhrase, setActionPhrase] = useState("");
  const [actionConsent, setActionConsent] = useState(false);
  const [actionExecution, setActionExecution] = useState<{ receipt: ActionReceipt; steps: ActionExecutionStep[] } | null>(null);
  const [actionFlowError, setActionFlowError] = useState("");
  const [diagnosisResult, setDiagnosisResult] = useState<{ hostId: string; run: DiagnosisRun } | null>(null);
  const [diagnosisError, setDiagnosisError] = useState("");
  const [report, setReport] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [hostForm, setHostForm] = useState<HostConfigInput>(emptyHostForm);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [pendingHostDeleteId, setPendingHostDeleteId] = useState<string | null>(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [startup, setStartup] = useState<StartupState | null>(null);
  const [startupPending, setStartupPending] = useState<boolean | null>(null);
  const [startupLoading, setStartupLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => readNotificationPreference(window.localStorage));
  const [notificationsCalibrated, setNotificationsCalibrated] = useState(() => readNotificationCalibration(window.localStorage));
  const [notificationTestState, setNotificationTestState] = useState<"idle" | "sending" | "confirm" | "failed">("idle");
  const [notificationNote, setNotificationNote] = useState("");
  const [schedulerForm, setSchedulerForm] = useState({ enabled: false, lightIntervalMinutes: 15, retentionDays: 7 });
  const [retentionResult, setRetentionResult] = useState<RetentionResult | null>(null);
  const [briefCopied, setBriefCopied] = useState(false);
  const [reportCopyPending, setReportCopyPending] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [agentSetupCopied, setAgentSetupCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [deskSyncState, setDeskSyncState] = useState<DeskSyncState>("idle");
  const [lastDeskSyncAt, setLastDeskSyncAt] = useState<number | null>(null);
  const [lastPetSyncAt, setLastPetSyncAt] = useState<number | null>(null);
  const [deskSyncError, setDeskSyncError] = useState("");
  const [petSyncError, setPetSyncError] = useState("");
  const [practicePending, setPracticePending] = useState<"install" | "remove" | null>(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const loadGate = useRef(createLatestRequestGate());
  const checkDetailGate = useRef(createLatestRequestGate());

  async function load({ preserveSchedulerForm = false } = {}) {
    const requestToken = loadGate.current.begin();
    if (petMode) {
      const result = await resolveLatestRequest(loadGate.current, requestToken, fetchPetSnapshot(api));
      if (!result.current) return false;
      const status = result.value;
      const syncedAt = Date.now();
      setDashboard(status);
      setNow(syncedAt);
      setLastPetSyncAt(syncedAt);
      setSelectedHostId((previous) => retainFocusSelection(status.hosts, previous));
      return true;
    }
    const result = await resolveLatestRequest(loadGate.current, requestToken, fetchDeskSnapshot(api));
    if (!result.current) return false;
    const snapshot = result.value;
    setDashboard(snapshot.status);
    setChecks(snapshot.checks);
    setSelectedCheckId((previous) => retainCheckSelection(snapshot.checks, previous));
    setReport(snapshot.report);
    setScheduler(snapshot.scheduler);
    if (window.localOpsDesktop) {
      const desktopState = await window.localOpsDesktop.getState();
      setStartup(desktopState.startup);
    } else {
      setStartup(snapshot.startup);
    }
    setSchedulerForm((currentDraft) => schedulerDraftAfterSync(currentDraft, snapshot.scheduler, preserveSchedulerForm));
    setSelectedHostId((previous) => retainFocusSelection(snapshot.status.hosts, previous));
    const syncedAt = Date.now();
    setLastDeskSyncAt(syncedAt);
    setNow(syncedAt);
    setDeskSyncState("current");
    setDeskSyncError("");
    return true;
  }

  useEffect(() => () => {
    loadGate.current.invalidate();
    checkDetailGate.current.invalidate();
  }, []);

  useEffect(() => {
    if (petMode) return undefined;
    const refreshNotificationPreference = () => {
      setNotificationsEnabled(readNotificationPreference(window.localStorage));
      setNotificationsCalibrated(readNotificationCalibration(window.localStorage));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key == null || event.key === petNotificationPreferenceKey || event.key === petNotificationCalibrationKey) refreshNotificationPreference();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshNotificationPreference);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshNotificationPreference);
    };
  }, [petMode]);

  async function loadCheckDetail(id: number) {
    const requestToken = checkDetailGate.current.begin();
    setCheckDetailState("loading");
    setCheckDetailError("");
    setCheckDetail(null);
    try {
      const result = await resolveLatestRequest(
        checkDetailGate.current,
        requestToken,
        api<{ detail: CheckDetail }>(`/api/checks/${id}`)
      );
      if (!result.current) return;
      setCheckDetail(result.value.detail);
      setCheckDetailState("current");
    } catch (err) {
      if (!checkDetailGate.current.isLatest(requestToken)) return;
      setCheckDetail(null);
      setCheckDetailState("error");
      setCheckDetailError(err instanceof Error ? err.message : "读取检查证据失败");
    }
  }

  useEffect(() => {
    if (petMode || selectedTab !== "checks" || selectedCheckId == null) {
      checkDetailGate.current.invalidate();
      return;
    }
    loadCheckDetail(selectedCheckId);
  }, [petMode, selectedTab, selectedCheckId]);

  useEffect(() => {
    if (!petMode) setDeskSyncState("syncing");
    load().catch((err: Error) => {
      setError(err.message);
      if (!petMode) setDeskSyncState("offline");
    });
  }, []);

  useEffect(() => {
    if (!petMode) return;
    let stopped = false;
    let timer = window.setTimeout(poll, 30_000);
    async function poll() {
      try {
        const applied = await load();
        if (!stopped && applied) {
          setPetSyncError("");
          setError("");
        }
      } catch (err) {
        if (!stopped) setPetSyncError(err instanceof Error ? err.message : "本地监控没有响应");
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 30_000);
      }
    }
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [petMode]);

  useEffect(() => {
    if (petMode) return;
    let stopped = false;
    let timer = window.setTimeout(sync, 30_000);
    async function sync() {
      setDeskSyncState((current) => current === "offline" ? "offline" : "syncing");
      try {
        await load({ preserveSchedulerForm: true });
      } catch (err) {
        if (!stopped) {
          setDeskSyncState("offline");
          setDeskSyncError(err instanceof Error ? err.message : "本地监控没有响应");
        }
      } finally {
        if (!stopped) timer = window.setTimeout(sync, 30_000);
      }
    }
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [petMode]);

  useEffect(() => {
    if (petMode || selectedTab !== "actions") return undefined;
    let stopped = false;
    Promise.all([
      api<{ capability: ActionCapability }>("/api/actions/capability"),
      api<{ receipts: ActionReceipt[] }>("/api/actions/receipts")
    ]).then(([capabilityResult, receiptResult]) => {
      if (stopped) return;
      setActionCapability(capabilityResult.capability);
      setActionReceipts(receiptResult.receipts);
    }).catch((err) => {
      if (!stopped) setActionFlowError(err instanceof Error ? err.message : "无法读取操作通道状态");
    });
    return () => { stopped = true; };
  }, [petMode, selectedTab]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1200px)");
    const update = () => setWideDetail(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const navigation = navigationRef.current;
    const active = navigation?.querySelector<HTMLElement>("button.active");
    if (!navigation || !active || navigation.scrollWidth <= navigation.clientWidth) return;
    const left = active.offsetLeft - (navigation.clientWidth - active.offsetWidth) / 2;
    navigation.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [selectedTab]);

  useEffect(() => {
    if (petMode || !detailsOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    if (!wideDetail) detailCloseRef.current?.focus();
    const closeDetail = () => {
      setDetailsOpen(false);
      window.setTimeout(() => detailTriggerRef.current?.focus(), 0);
    };
    const handleDetailKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetail();
        return;
      }
      if (wideDetail || event.key !== "Tab") return;
      const focusable = Array.from(detailPanelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), summary, a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    if (!wideDetail) document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleDetailKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDetailKeys);
    };
  }, [petMode, detailsOpen, wideDetail]);

  useEffect(() => {
    if (petMode) return;
    const applyPetDeskIntent = () => {
      const intent = petDeskIntent(window.location.hash);
      const nextTab = intent.tab ?? "overview";
      if (intent.tab) setSelectedTab(intent.tab);
      if (intent.hostId && nextTab === "overview" && dashboard?.hosts.some((host) => host.id === intent.hostId)) {
        detailTriggerRef.current = null;
        setSelectedHostId(intent.hostId);
        setDetailsOpen(true);
      } else {
        setDetailsOpen(false);
        if (intent.hostId && nextTab === "overview" && dashboard) setError("这台服务器已不在当前列表中。");
      }
    };
    window.addEventListener("hashchange", applyPetDeskIntent);
    return () => window.removeEventListener("hashchange", applyPetDeskIntent);
  }, [petMode, dashboard]);

  useEffect(() => {
    if (petMode || !dashboard || !detailsOpen || !selectedHostId) return;
    if (dashboard.hosts.some((host) => host.id === selectedHostId)) return;
    setDetailsOpen(false);
    setSelectedHostId(null);
    setError("这台服务器已不在当前列表中。");
  }, [petMode, dashboard, detailsOpen, selectedHostId]);

  useEffect(() => {
    if (!diagnosisResult || !dashboard) return;
    const host = dashboard.hosts.find((item) => item.id === diagnosisResult.hostId);
    if (!host?.lastCheckedAt) return;
    if (new Date(host.lastCheckedAt).getTime() > new Date(diagnosisResult.run.checkedAt).getTime()) setDiagnosisResult(null);
  }, [dashboard, diagnosisResult]);

  function retryLoad() {
    setError("");
    if (!petMode) setDeskSyncState("syncing");
    load({ preserveSchedulerForm: !petMode && dashboard != null }).catch((err: Error) => {
      setError(err.message);
      if (!petMode) setDeskSyncState("offline");
    });
  }

  async function retryDeskSync() {
    setDeskSyncState("syncing");
    setDeskSyncError("");
    try {
      await load({ preserveSchedulerForm: true });
    } catch (err) {
      setDeskSyncState("offline");
      setDeskSyncError(err instanceof Error ? err.message : "本地监控没有响应");
    }
  }

  async function retryPetSync() {
    setPetSyncing(true);
    try {
      const applied = await load();
      if (applied) {
        setPetSyncError("");
        setError("");
      }
    } catch (err) {
      setPetSyncError(err instanceof Error ? err.message : "本地监控没有响应");
    } finally {
      setPetSyncing(false);
    }
  }

  function openPetWindow() {
    if (window.localOpsDesktop) {
      void window.localOpsDesktop.showPet();
      return;
    }
    const pet = window.open(petModePath(crypto.randomUUID(), "existing"), "localops-pet", "popup=yes,width=360,height=620,resizable=yes");
    if (!pet) setError("浏览器阻止了桌宠窗口。请允许本地页面弹出窗口，或运行 npm run pet:window。");
  }

  async function startNotificationCalibration() {
    if (!window.localOpsDesktop || notificationTestState === "sending") return;
    setNotificationTestState("sending");
    setNotificationNote("");
    writeNotificationPreference(window.localStorage, true);
    writeNotificationCalibration(window.localStorage, false);
    setNotificationsEnabled(true);
    setNotificationsCalibrated(false);
    try {
      const delivery = await window.localOpsDesktop.showNotification({ kind: "test" });
      if (!delivery.accepted) {
        setNotificationTestState("failed");
        setNotificationNote(delivery.message);
        return;
      }
      setNotificationTestState("confirm");
      setNotificationNote("测试提醒已经交给 Windows。请按你实际看到的结果确认。");
    } catch {
      setNotificationTestState("failed");
      setNotificationNote("没有发出测试提醒。请确认桌面程序仍在运行，再重试。");
    }
  }

  function finishNotificationCalibration(seen: boolean) {
    const saved = writeNotificationCalibration(window.localStorage, seen);
    setNotificationsCalibrated(seen && saved);
    setNotificationTestState(seen && saved ? "idle" : "failed");
    setNotificationNote(seen
      ? saved ? "桌面提醒已开启。以后只在状态变差时提醒。" : "看到了提醒，但设置没有保存。"
      : "没有看到提醒。请检查 Windows 通知和专注助手设置后再试一次。");
  }

  function disableNotifications() {
    writeNotificationPreference(window.localStorage, false);
    writeNotificationCalibration(window.localStorage, false);
    setNotificationsEnabled(false);
    setNotificationsCalibrated(false);
    setNotificationTestState("idle");
    setNotificationNote("桌面提醒已关闭；定时检查不会受影响。");
  }

  const openDeskFromPet = useCallback(async (hostId?: string, tab: PetDeskTab = "overview", source: "pet" | "pet-alert" = "pet") => {
    const path = petDeskPath({ hostId, tab, source, revision: source === "pet-alert" ? Date.now() : null });
    const desk = window.open(path, "localops-desk");
    if (!desk) {
      const sessionId = new URLSearchParams(window.location.search).get("session");
      if (isPetSessionId(sessionId)) {
        try {
          await requestPetWindowTopmost(sessionId, false);
        } catch {
          // Navigation remains available even when the native helper cannot restore Z-order.
        }
      }
      window.location.assign(path);
    }
  }, []);

  const displayDashboard = useMemo(
    () => dashboard ? trustworthyDashboard(dashboard, now) : null,
    [dashboard, now]
  );
  const filteredChecks = useMemo(() => filterChecks(checks, checkFilter), [checks, checkFilter]);
  const selectedCheck = useMemo(() => checks.find((check) => check.id === selectedCheckId) ?? null, [checks, selectedCheckId]);
  const priorityHosts = useMemo(() => prioritizeHosts(displayDashboard?.hosts ?? []), [displayDashboard]);
  const selectedHost = useMemo(() => selectFocusHost(priorityHosts, selectedHostId), [priorityHosts, selectedHostId]);
  const actionHost = useMemo(
    () => actionHostId ? priorityHosts.find((host) => host.id === actionHostId) ?? null : selectedHost,
    [priorityHosts, actionHostId, selectedHost]
  );
  const freshness = useMemo(() => dashboard ? evidenceFreshness(dashboard, now) : { state: "unknown", label: "没有观测证据" }, [dashboard, now]);
  const selectedFreshness = useMemo(
    () => dashboard && selectedHost
      ? evidenceFreshnessAt(hostEvidenceTimestamp(dashboard, selectedHost), dashboard.staleAfterMs, now)
      : { state: "unknown", label: "没有观测证据" },
    [dashboard, selectedHost, now]
  );
  const selectedEvidenceCurrent = selectedFreshness.state === "fresh";
  const partialEvidenceCount = useMemo(
    () => dashboard
      ? displayDashboard?.hosts.filter((host) => host.status === "healthy" && evidenceReadiness(dashboard, host).state === "http").length ?? 0
      : 0,
    [displayDashboard, dashboard]
  );
  const currentMessage = useMemo(
    () => overallMessage(
      displayDashboard?.counts ?? { healthy: 0, warning: 0, critical: 0, unknown: 0 },
      freshness.state === "unknown" && Boolean(dashboard?.observedAt),
      partialEvidenceCount
    ),
    [displayDashboard, freshness.state, dashboard?.observedAt, partialEvidenceCount]
  );
  const selectedBrief = useMemo(() => displayDashboard && selectedHost ? discussionBrief(displayDashboard, selectedHost, now) : "", [displayDashboard, selectedHost, now]);
  const discussLink = useMemo(() => codexDiscussionLink(selectedBrief), [selectedBrief]);
  const deskSync = useMemo(() => deskSyncCopy(deskSyncState, lastDeskSyncAt, now), [deskSyncState, lastDeskSyncAt, now]);
  const selectedReadiness = useMemo(
    () => dashboard ? evidenceReadiness(dashboard, selectedHost) : null,
    [dashboard, selectedHost]
  );
  const selectedInternalSignal = useMemo(
    () => selectedHost ? internalSignalSummary(selectedHost) : { status: "待重新检查", detail: "—" },
    [selectedHost]
  );
  const batchCoverage = useMemo(
    () => scheduler?.coverage ?? (dashboard ? collectionCoverage(dashboard.mode, dashboard.hosts, { practiceMode: dashboard.practiceMode }) : collectionCoverage("safe-simulated")),
    [scheduler, dashboard]
  );
  const schedulerOutcome = useMemo(() => schedulerOutcomeCopy(scheduler), [scheduler]);
  const watchSetup = useMemo(() => watchReadiness({
    coverage: batchCoverage,
    schedulerEnabled: Boolean(scheduler?.enabled),
    desktopRuntime,
    notificationsEnabled,
    notificationsCalibrated
  }), [batchCoverage, scheduler?.enabled, desktopRuntime, notificationsEnabled, notificationsCalibrated]);
  const operationState = operationUiState(pendingOperation);
  const operationBusy = operationState.busy;
  const checking = operationState.checking;
  const diagnosing = operationState.diagnosing;
  const preparingApproval = operationState.preparingApproval;
  const executingAction = operationState.executingAction;
  const selectedDiagnosis = diagnosisResult && diagnosisResult.hostId === selectedHost?.id ? diagnosisResult.run : null;
  const selectedDeepFindings = selectedDiagnosis
    ? selectedDiagnosis.deepEvidence.findings.filter((finding) => finding.status === "warning" || finding.status === "critical")
    : [];
  if (selectedDiagnosis && selectedDeepFindings.length === 0 && selectedDiagnosis.deepEvidence.findings[0]) {
    selectedDeepFindings.push(selectedDiagnosis.deepEvidence.findings[0]);
  }

  function chooseFocusHost(hostId: string, trigger?: HTMLButtonElement) {
    if (hostId !== selectedHostId) {
      setDiagnosisResult(null);
      setDiagnosisError("");
    }
    if (trigger) detailTriggerRef.current = trigger;
    setSelectedHostId(manualFocusSelection(priorityHosts, hostId));
    setDetailsOpen(true);
  }

  function chooseCheckFilter(nextFilter: CheckHistoryFilter) {
    const nextChecks = filterChecks(checks, nextFilter);
    setCheckFilter(nextFilter);
    setSelectedCheckId((previous) => retainCheckSelection(nextChecks, previous));
  }

  function runOrConfigureSelected() {
    if (!selectedHost || !selectedReadiness) return;
    if (selectedReadiness.canCollect) runLightCheck(selectedHost.id);
    else startEditHost(selectedHost);
  }

  async function copyBrief() {
    if (!selectedBrief) return;
    try {
      await navigator.clipboard.writeText(selectedBrief);
      setBriefCopied(true);
      window.setTimeout(() => setBriefCopied(false), 2_000);
    } catch {
      setError("隐私版摘要复制失败，请检查剪贴板权限；不要改用包含服务器名称的内部报告。");
    }
  }

  async function copyInternalReport() {
    if (!report) return;
    setError("");
    try {
      await navigator.clipboard.writeText(report);
      setReportCopyPending(false);
      setReportCopied(true);
      window.setTimeout(() => setReportCopied(false), 2_000);
    } catch {
      setError("内部报告复制失败，请检查系统剪贴板权限。");
    }
  }

  async function copyAgentSetup() {
    const commands = "codex plugin marketplace add .\ncodex plugin add localops-guardian@localops-desk";
    try {
      await navigator.clipboard.writeText(commands);
      setAgentSetupCopied(true);
      window.setTimeout(() => setAgentSetupCopied(false), 2_000);
    } catch {
      setError("Codex 插件安装命令复制失败，请检查系统剪贴板权限。");
    }
  }

  async function runLightCheck(hostId?: string) {
    if (pendingOperation) return;
    if (!hostId || diagnosisResult?.hostId === hostId) setDiagnosisResult(null);
    setPendingOperation("check");
    setError("");
    setLastCheckOutcome(null);
    try {
      const result = await api<{ status: Status; summary: string; coverage: CollectionCoverage }>(hostId ? `/api/checks/light/${encodeURIComponent(hostId)}` : "/api/checks/light", { method: "POST", body: "{}" });
      setLastCheckOutcome(result);
      try {
        await load();
        if (petMode) setPetSyncError("");
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : "本地监控没有响应";
        if (petMode) setPetSyncError(message);
        else setError(`巡检已完成，但读取新结果失败：${message}`);
      }
      setSelectedTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "检查失败");
    } finally {
      setPendingOperation(null);
    }
  }

  async function saveScheduler(next = schedulerForm) {
    if (pendingOperation) return;
    setPendingOperation("scheduler");
    setError("");
    try {
      const result = await api<{ scheduler: SchedulerState }>("/api/scheduler", {
        method: "PUT",
        body: JSON.stringify(next)
      });
      setScheduler(result.scheduler);
      setSchedulerForm({
        enabled: result.scheduler.enabled,
        lightIntervalMinutes: result.scheduler.lightIntervalMinutes,
        retentionDays: result.scheduler.retentionDays
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存巡检配置失败");
    } finally {
      setPendingOperation(null);
    }
  }

  async function runRetention(vacuum = false) {
    if (pendingOperation) return;
    setPendingOperation("retention");
    setError("");
    try {
      const result = await api<{ retention: RetentionResult }>("/api/maintenance/retention", {
        method: "POST",
        body: JSON.stringify({ vacuum })
      });
      setRetentionResult(result.retention);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保留期清理失败");
    } finally {
      setPendingOperation(null);
    }
  }

  async function runDryAction(actionKey: string, requestedHostId?: string) {
    if (pendingOperation) return;
    const hostId = requestedHostId ?? actionHost?.id;
    if (!hostId) {
      setActionFlowError("原服务器已不在当前列表中；操作流程已经停止，不会改用其他服务器。");
      return;
    }
    setPendingOperation("action");
    setError("");
    setDryRunCopied(false);
    setActionApproval(null);
    setActionPhrase("");
    setActionConsent(false);
    setActionExecution(null);
    setActionFlowError("");
    try {
      const result = await api<DryRunAction>("/api/actions/dry-run", {
        method: "POST",
        body: JSON.stringify({ hostId, actionKey })
      });
      if (result.target.id !== hostId) throw new Error("操作预案返回了不同的服务器，流程已停止。");
      setActionHostId(result.target.id);
      setSelectedHostId(result.target.id);
      setDryRun(result);
      setSelectedTab("actions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "dry-run 失败");
    } finally {
      setPendingOperation(null);
    }
  }

  function startCreateHost() {
    setPracticePending(null);
    setEditingHostId(null);
    setHostForm(emptyHostForm);
    setShowHostForm(true);
    setSelectedTab("hosts");
  }

  function startEditHost(host: HostState) {
    setEditingHostId(host.id);
    setHostForm({
      name: host.name,
      environment: host.environment,
      role: host.role,
      sshAlias: host.sshAlias,
      healthUrl: host.healthUrl,
      composeProject: host.composeProject,
      tags: host.tags
    });
    setShowHostForm(true);
    setSelectedTab("hosts");
  }

  async function saveHost() {
    if (pendingOperation) return;
    const creatingFirstHost = dashboard?.hosts.length === 0;
    setPendingOperation("host-save");
    setError("");
    try {
      await api(editingHostId ? `/api/hosts/${encodeURIComponent(editingHostId)}` : "/api/hosts", {
        method: editingHostId ? "PUT" : "POST",
        body: JSON.stringify(hostForm)
      });
      setShowHostForm(false);
      setEditingHostId(null);
      setLastCheckOutcome(null);
      await load();
      if (creatingFirstHost) setSelectedTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存主机失败");
    } finally {
      setPendingOperation(null);
    }
  }

  async function removeHost(hostId: string) {
    if (pendingOperation) return;
    setPendingOperation("host-delete");
    setError("");
    try {
      await api(`/api/hosts/${encodeURIComponent(hostId)}`, { method: "DELETE" });
      setSelectedHostId(null);
      setPendingHostDeleteId(null);
      setLastCheckOutcome(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除主机失败");
    } finally {
      setPendingOperation(null);
    }
  }

  if (!dashboard) {
    const recovery = localRecoveryCopy(null, now);
    return (
      <main className={`boot ${petMode ? "pet-boot" : ""}`} role={error ? "alert" : undefined}>
        {error ? (
          <section className="boot-recovery-card">
            <AlertTriangle size={22} aria-hidden="true" />
            <div>
              <h1>{recovery.label}</h1>
              <small>{recovery.detail}</small>
              <em>{recovery.boundary}</em>
              <details><summary>技术原因</summary><p>{error}</p></details>
            </div>
            <button onClick={retryLoad}><RefreshCcw size={15} />立即重试</button>
          </section>
        ) : (
          <div className="boot-loading"><Activity className="spin" /><span>正在连接本地 LocalOps API...</span></div>
        )}
      </main>
    );
  }

  async function prepareNginxAction() {
    if (pendingOperation || !actionHost || dryRun?.actionKey !== "reload-nginx") return;
    setPendingOperation("action-prepare");
    setActionFlowError("");
    setActionExecution(null);
    try {
      const result = await api<{ capability: ActionCapability; approval: ActionApproval }>("/api/actions/prepare", {
        method: "POST",
        body: JSON.stringify({ hostId: actionHost.id, actionKey: "reload-nginx" })
      });
      setActionCapability(result.capability);
      setActionApproval(result.approval);
      setActionPhrase("");
      setActionConsent(false);
    } catch (err) {
      setActionFlowError(err instanceof Error ? err.message : "无法准备 Nginx 重载");
    } finally {
      setPendingOperation(null);
    }
  }

  async function executeApprovedNginxAction() {
    if (pendingOperation || !actionApproval || !actionConsent || actionPhrase !== actionApproval.requiredPhrase) return;
    setPendingOperation("action-execute");
    setActionFlowError("");
    try {
      const result = await api<{ receipt: ActionReceipt; replay: boolean; steps: ActionExecutionStep[] }>("/api/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          approvalId: actionApproval.approvalId,
          planDigest: actionApproval.planDigest,
          phrase: actionPhrase
        })
      });
      setActionExecution({ receipt: result.receipt, steps: result.steps });
      setActionReceipts((current) => [result.receipt, ...current.filter((item) => item.id !== result.receipt.id)].slice(0, 12));
      setActionApproval(null);
      setActionPhrase("");
      setActionConsent(false);
      await load();
    } catch (err) {
      setActionFlowError(err instanceof Error ? err.message : "Nginx 重载流程没有完成");
    } finally {
      setPendingOperation(null);
    }
  }

  function cancelActionApproval() {
    setActionApproval(null);
    setActionPhrase("");
    setActionConsent(false);
    setActionFlowError("");
  }

  function returnToActionHost() {
    if (!actionHostId || !priorityHosts.some((host) => host.id === actionHostId)) {
      setError("原服务器已不在当前列表中；没有切换到其他服务器。");
      setSelectedTab("overview");
      setDetailsOpen(false);
      return;
    }
    setSelectedHostId(actionHostId);
    setSelectedTab("overview");
    setDetailsOpen(true);
  }

  async function runAutomaticDiagnosis() {
    if (pendingOperation || !selectedHost || !selectedReadiness?.canCollect) return;
    const hostId = selectedHost.id;
    setSelectedHostId(hostId);
    setActionHostId(hostId);
    setDryRun(null);
    setActionApproval(null);
    setActionExecution(null);
    setActionFlowError("");
    setPendingOperation("diagnosis");
    setDiagnosisResult(null);
    setDiagnosisError("");
    setError("");
    try {
      const run = await api<DiagnosisRun>(`/api/diagnostics/${encodeURIComponent(hostId)}`, { method: "POST", body: "{}" });
      setDiagnosisResult({ hostId, run });
      try {
        await load();
      } catch (refreshError) {
        setError(`排查完成，但读取新状态失败：${refreshError instanceof Error ? refreshError.message : "本地监控没有响应"}`);
      }
    } catch (err) {
      setDiagnosisError(err instanceof Error ? err.message : "自动排查失败");
    } finally {
      setPendingOperation(null);
    }
  }

  async function verifySchedulerNow() {
    if (pendingOperation) return;
    setPendingOperation("check");
    setError("");
    try {
      const result = await api<{ scheduler: SchedulerState }>("/api/scheduler/run-now", { method: "POST", body: "{}" });
      setScheduler(result.scheduler);
      await load({ preserveSchedulerForm: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "立即验证自动巡检失败");
    } finally {
      setPendingOperation(null);
    }
  }
  const currentDashboard = displayDashboard ?? dashboard;

  async function copyDryRunCommands() {
    if (!dryRun?.copyAllowed) return;
    setError("");
    try {
      await navigator.clipboard.writeText(dryRun.commands.join("\n"));
      setDryRunCopied(true);
    } catch {
      setError("复制失败，请检查系统剪贴板权限后重试。");
    }
  }

  async function installOfflinePractice() {
    setPracticeLoading(true);
    setError("");
    try {
      await api("/api/practice/offline", { method: "POST", body: "{}" });
      setPracticePending(null);
      setSelectedHostId(null);
      setLastCheckOutcome(null);
      await load();
      setSelectedTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "启用离线练习失败");
    } finally {
      setPracticeLoading(false);
    }
  }

  async function removeOfflinePractice() {
    setPracticeLoading(true);
    setError("");
    try {
      await api("/api/practice/offline", { method: "DELETE", body: "{}" });
      setPracticePending(null);
      setSelectedHostId(null);
      setLastCheckOutcome(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出离线练习失败");
    } finally {
      setPracticeLoading(false);
    }
  }

  async function saveStartup(enabled: boolean) {
    setStartupLoading(true);
    setError("");
    try {
      const result = window.localOpsDesktop
        ? await window.localOpsDesktop.setLoginStartup(enabled)
        : await api<{ startup: StartupState }>("/api/startup", {
            method: "PUT",
            body: JSON.stringify({ enabled })
          });
      setStartup(result.startup);
      setStartupPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新登录启动设置失败");
    } finally {
      setStartupLoading(false);
    }
  }

  if (petMode) {
    return (
      <PetMode
        dashboard={currentDashboard}
        now={now}
        lastSyncedAt={lastPetSyncAt}
        loading={checking}
        syncing={petSyncing}
        syncError={petSyncError}
        actionError={error}
        onRefresh={(hostId) => runLightCheck(hostId)}
        onRetrySync={retryPetSync}
        onOpenDesk={openDeskFromPet}
      />
    );
  }

  if (!selectedHost) {
    return (
      <main className="empty-host-setup">
        <section className={`empty-host-card ${showHostForm ? "configuring" : ""}`}>
          {!showHostForm ? <div className="empty-host-intro">
            <div>
              <h1>先添加你要看的服务器</h1>
              <p>推荐填写一个健康检查地址，LocalOps 就能判断服务是否可用。也可以先只填名称，不会自动扫描或连接任何设备。</p>
              <div className="onboarding-cta">
                <button className="primary" onClick={startCreateHost}><Plus size={16} />添加服务器</button>
                <button className="practice-entry" onClick={() => setPracticePending("install")}><ShieldCheck size={16} />看看离线示例</button>
              </div>
              <p className="onboarding-boundary"><ShieldCheck size={15} />只连接你明确填写的地址；不保存密码、Token 或私钥。</p>
            </div>
            <div className="onboarding-pet" aria-hidden="true">
              <img src={onboardingPetUrl} alt="" />
            </div>
          </div> : null}
          {showHostForm ? (
            <div className="onboarding-form-stage">
              <div>
                <h2>添加第一台服务器</h2>
                <p>不确定怎么填时，只写名称和健康检查地址；其他信息以后再补。</p>
              </div>
              <HostForm
                form={hostForm}
                setForm={setHostForm}
                onSubmit={saveHost}
                onCancel={() => setShowHostForm(false)}
                editing={false}
                saving={operationState.savingHost}
                disabled={operationBusy}
                sshCollectionEnabled={dashboard.mode === "ssh-enabled"}
              />
            </div>
          ) : practicePending === "install" ? (
                <div className="practice-confirm" role="group" aria-label="确认启用离线练习">
                  <div>
                    <strong>载入 3 台纯虚构服务器？</strong>
                    <small>只写入本地示例；地址、SSH 与 Compose 均为空。退出练习会删除这些示例和对应检查记录。</small>
                  </div>
                  <button className="primary slim" disabled={practiceLoading} onClick={installOfflinePractice}>{practiceLoading ? "载入中" : "确认载入"}</button>
                  <button className="secondary slim" disabled={practiceLoading} onClick={() => setPracticePending(null)}>取消</button>
                </div>
              ) : null}
          {error ? <p className="error-banner" role="alert">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="skip-link" href="#localops-main">跳到主要内容</a>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div>
            <strong>LocalOps</strong>
          </div>
        </div>
        <nav ref={navigationRef}>
          {[
            ["overview", Activity, "首页"],
            ["hosts", Server, "服务器"],
            ["scheduler", Settings2, "提醒与值守"],
            ["checks", History, "检查记录"],
            ["actions", TerminalSquare, "安全操作"],
            ["reports", FileText, "报告"],
            ["agent", Bot, "Codex 接入"]
          ].map(([key, Icon, label]) => (
            <button key={key as string} className={selectedTab === key ? "active" : ""} onClick={() => setSelectedTab(key as string)}>
              <Icon size={18} />
              <span>{label as string}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className={`main ${selectedTab === "overview" ? "overview-tab" : "work-tab"}`} id="localops-main" tabIndex={-1}>
        <header className={`topbar ${selectedTab === "overview" ? "" : "compact"}`}>
          <div>
            <h1>{currentMessage.title}</h1>
            <p>{currentMessage.description} · {freshness.label}</p>
            {deskSyncState === "offline" ? (
              <section className="sync-recovery-card" aria-live="polite" aria-label="本地状态恢复">
                <AlertTriangle size={17} aria-hidden="true" />
                <div>
                  <strong>{deskSync.label}</strong>
                  <small>{deskSync.detail}；重试只会读取本地状态，不会巡检服务器。</small>
                  {deskSyncError ? <details><summary>技术原因</summary><p>{deskSyncError}</p></details> : null}
                </div>
                <button onClick={retryDeskSync}><RefreshCcw size={14} />立即重试</button>
              </section>
            ) : null}
          </div>
          {selectedTab === "overview" ? <div className="topbar-actions">
            <div className={`batch-check-action ${batchCoverage.blocked ? "partial" : "complete"}`}>
              <button className="primary" onClick={() => batchCoverage.collectible > 0 ? runLightCheck() : startEditHost(selectedHost)} disabled={operationBusy} title={batchCoverage.blocked ? `${batchCoverage.blocked} 台缺少当前可用的证据来源` : undefined}>
                {checking ? <RefreshCcw className="spin" size={18} /> : batchCoverage.collectible > 0 ? <Play size={18} /> : <Pencil size={18} />}
                <span>{checking ? "正在检查" : dashboard.practiceMode ? "运行离线练习" : batchCoverage.collectible === 0 ? "补充监控来源" : batchCoverage.blocked > 0 ? `检查 ${batchCoverage.collectible} 台` : "一键检查全部"}</span>
              </button>
              {batchCoverage.blocked ? <small>{batchCoverage.blocked} 台缺少监控来源，本次会跳过</small> : null}
            </div>
            <button className="secondary" onClick={openPetWindow}>
              <MonitorUp size={18} />
              <span>打开桌宠</span>
            </button>
          </div> : null}
        </header>

        {error ? <div className="error-line" role="alert"><AlertTriangle size={16} />{error}</div> : null}
        {lastCheckOutcome && selectedTab === "overview" ? (
          <div className={`check-outcome ${lastCheckOutcome.coverage.blocked ? "partial" : "complete"}`} role="status">
            <CheckCircle2 size={17} />
            <div><strong>{lastCheckOutcome.coverage.collectible} 台已取得证据</strong><small>{lastCheckOutcome.summary}</small></div>
            <button onClick={() => setSelectedTab("checks")}>查看记录</button>
          </div>
        ) : null}

        {dashboard.practiceMode ? (
          <section className="practice-banner" aria-label="离线练习状态">
            <div>
              <strong>这里的服务器和证据都是虚构的</strong>
              <small>可以放心巡检、查看异常分级和生成预案；不会访问 HTTP、SSH 或局域网。</small>
            </div>
            {practicePending === "remove" ? (
              <div className="practice-exit-confirm" role="group" aria-label="确认退出离线练习">
                <span>删除 3 台练习对象及其检查记录；若自动检查已开启，也会停止。</span>
                <button className="danger" disabled={practiceLoading} onClick={removeOfflinePractice}>{practiceLoading ? "清理中" : "确认退出"}</button>
                <button disabled={practiceLoading} onClick={() => setPracticePending(null)}>取消</button>
              </div>
            ) : (
              <button className="practice-exit" onClick={() => setPracticePending("remove")}>退出离线练习</button>
            )}
          </section>
        ) : null}

        {selectedTab === "overview" && (
          <section className={`home-grid ${detailsOpen ? "details-open" : ""}`}>
            <div className="all-hosts-panel">
              <div className="panel-head">
                <div><h2>服务器</h2><span>{priorityHosts.length} 台</span></div>
                {!dashboard.practiceMode ? <button className="quiet-action" onClick={startCreateHost} disabled={operationBusy}><Plus size={16} />添加</button> : null}
              </div>
              <div className="host-list simple">
                {priorityHosts.map((host) => (
                  <HostPanel
                    key={host.id}
                    host={host}
                    fresh={hostEvidenceIsFresh(dashboard, host, now)}
                    selected={detailsOpen && host.id === selectedHost.id}
                    onSelect={(trigger) => chooseFocusHost(host.id, trigger)}
                  />
                ))}
              </div>
            </div>

            {detailsOpen ? <>{!wideDetail ? <button className="detail-backdrop" onClick={() => { setDetailsOpen(false); window.setTimeout(() => detailTriggerRef.current?.focus(), 0); }} aria-label="关闭服务器详情" /> : null}<aside ref={detailPanelRef} className={`detail-panel main-detail server-detail-drawer ${wideDetail ? "inline" : "modal"}`} id="server-detail" role={wideDetail ? "region" : "dialog"} aria-modal={wideDetail ? undefined : true} aria-label={`${selectedHost.name} 详情`}>
              <div className="detail-head">
                <div className="detail-title"><i className={`host-dot ${selectedHost.status}`} aria-hidden="true" /><div><h2>{selectedHost.name}</h2><p>{statusLabels[selectedHost.status]} · {selectedFreshness.label}</p></div></div>
                <div className="detail-head-tools">
                  <button className="detail-config" onClick={() => startEditHost(selectedHost)} aria-label="配置服务器" title="配置服务器"><Pencil size={17} /></button>
                  <button ref={detailCloseRef} className="detail-close" onClick={() => { setDetailsOpen(false); window.setTimeout(() => detailTriggerRef.current?.focus(), 0); }} aria-label="关闭详情"><X size={18} /></button>
                </div>
              </div>
              <div className="detail-primary-actions">
                {selectedHost.status !== "healthy" && selectedReadiness?.canCollect ? <button className="primary slim" disabled={operationBusy} onClick={runAutomaticDiagnosis}>{diagnosing ? <RefreshCcw className="spin" size={16} /> : <CheckCircle2 size={16} />}{diagnosing ? "正在查原因" : diagnosisError ? "重试查原因" : selectedDiagnosis ? "重新查原因" : "自动查原因"}</button> : null}
                {selectedHost.status === "healthy" || !selectedReadiness?.canCollect ? <button className="primary slim" disabled={operationBusy} onClick={runOrConfigureSelected}>{selectedReadiness?.canCollect ? <RefreshCcw className={checking ? "spin" : undefined} size={16} /> : <Pencil size={16} />}{checking ? "检查中" : selectedReadiness?.canCollect ? "重新检查" : "补充监控来源"}</button> : null}
              </div>
              <dl className="server-facts">
                <div><dt>网页 / API</dt><dd><strong>{selectedEvidenceCurrent ? friendlyHttpStatus(selectedHost.httpStatus) : "待重新检查"}</strong>{selectedEvidenceCurrent && selectedHost.httpLatencyMs != null ? <span>{selectedHost.httpLatencyMs} ms</span> : null}</dd></div>
                <div><dt>SSH / 服务</dt><dd><strong>{selectedEvidenceCurrent ? selectedInternalSignal.detail : "待重新检查"}</strong></dd></div>
                <div className={selectedEvidenceCurrent ? resourceSignalStatus(selectedHost) : "unknown"}><dt>CPU / 内存 / 磁盘</dt><dd><strong>{selectedEvidenceCurrent ? resourceSignalSummary(selectedHost) : "待重新检查"}</strong><span>{selectedEvidenceCurrent ? `${selectedHost.cpuPercent == null ? "—" : `${selectedHost.cpuPercent}%`} / ${selectedHost.memoryPercent == null ? "—" : `${selectedHost.memoryPercent}%`} / ${selectedHost.diskPercent == null ? "—" : `${selectedHost.diskPercent}%`}` : "—"}</span></dd></div>
              </dl>
              {diagnosing ? (
                <section className="diagnosis-running" role="status">
                  <RefreshCcw className="spin" size={19} />
                  <div><strong>正在查原因</strong><p>读取网页、SSH、服务和资源状态。</p></div>
                </section>
              ) : selectedDiagnosis ? (
                <>
                  <section className={`automatic-diagnosis ${selectedDiagnosis.status}`} aria-label="自动排查结果">
                    <h3>{selectedDiagnosis.diagnosis.headline}</h3>
                    <dl><div><dt>发现</dt><dd>{selectedDiagnosis.diagnosis.detail}</dd></div><div><dt>下一步</dt><dd>{selectedDiagnosis.diagnosis.next}</dd></div></dl>
                    {selectedDiagnosis.diagnosis.layer === "entry" ? (
                      <button className="diagnosis-next-action" disabled={operationBusy} onClick={() => runDryAction("reload-nginx", selectedHost.id)}><ShieldCheck size={16} />审阅 Nginx 重载</button>
                    ) : selectedDiagnosis.diagnosis.layer === "none" ? null : (
                      <button className="diagnosis-next-action" disabled={operationBusy} onClick={() => runDryAction("inspect-service", selectedHost.id)}><TerminalSquare size={16} />查看只读检查</button>
                    )}
                  </section>
                </>
              ) : null}
              {diagnosisError ? <div className="diagnosis-error" role="alert"><AlertTriangle size={16} /><span><strong>没有查完</strong><p>{diagnosisError}</p></span></div> : null}
              <details className={`technical-details ${selectedEvidenceCurrent ? "" : "expired"}`}>
                <summary>{selectedEvidenceCurrent ? "检查详情" : "上次检查详情（已过期）"}</summary>
                <div>
                  {selectedHost.evidence.slice(0, 3).map((item) => <p key={item}>{friendlyEvidence(item)}</p>)}
                  {selectedDiagnosis ? <div className={`diagnostic-proof-body ${selectedDiagnosis.deepEvidence.state}`}>
                    {selectedDiagnosis.deepEvidence.state === "complete" ? null : <p>{selectedDiagnosis.deepEvidence.summary}</p>}
                    {selectedDeepFindings.length ? <div className="diagnostic-proof-list">{selectedDeepFindings.map((finding) => <div className={finding.status} key={finding.key}><span>{finding.label}</span><strong>{finding.value}</strong><p>{finding.detail}</p></div>)}</div> : null}
                    {selectedDiagnosis.deepEvidence.excerpt.length ? <pre>{selectedDiagnosis.deepEvidence.excerpt.join("\n")}</pre> : null}
                  </div> : null}
                </div>
              </details>
            </aside></> : null}
          </section>
        )}

        {selectedTab === "hosts" && (
          <section className="table-panel">
            <div className="section-head">
              <div>
                <h2>服务器配置</h2>
                <p>只保存 SSH alias、健康检查 URL 和标签，不保存密钥。</p>
              </div>
              <button className="secondary" onClick={startCreateHost}><Plus size={16} />新增</button>
            </div>
            {showHostForm ? (
              <HostForm
                form={hostForm}
                setForm={setHostForm}
                onSubmit={saveHost}
                onCancel={() => setShowHostForm(false)}
                editing={Boolean(editingHostId)}
                saving={operationState.savingHost}
                disabled={operationBusy}
                sshCollectionEnabled={dashboard.mode === "ssh-enabled"}
              />
            ) : null}
            <div className="table-scroll" tabIndex={0} role="region" aria-label="服务器配置表，可横向滚动">
              <table>
                <thead><tr><th>名称</th><th>环境</th><th>SSH</th><th>健康检查</th><th>Compose</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {currentDashboard.hosts.map((host) => (
                    <tr key={host.id} className={pendingHostDeleteId === host.id ? "pending-delete" : ""}>
                      <td>{host.name}</td>
                      <td>{host.environment}</td>
                      <td>{host.sshAlias}</td>
                      <td>{host.healthUrl}</td>
                      <td>{host.composeProject}</td>
                      <td><StatusPill status={host.status} /></td>
                      <td className="row-actions">
                        {host.isOfflineDemo ? (
                          <span className="practice-managed-row">练习对象 · 统一退出</span>
                        ) : pendingHostDeleteId === host.id ? (
                          <div className="delete-confirm" role="group" aria-label={`确认删除 ${host.name}`}>
                            <span>本地配置和检查记录都会删除</span>
                            <button className="danger" disabled={operationBusy} onClick={() => removeHost(host.id)}><Trash2 size={15} />{operationState.deletingHost ? "删除中" : "确认删除"}</button>
                            <button disabled={operationState.deletingHost} onClick={() => setPendingHostDeleteId(null)}>取消</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => startEditHost(host)}><Pencil size={15} />编辑</button>
                            <button onClick={() => setPendingHostDeleteId(host.id)}><Trash2 size={15} />删除</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selectedTab === "checks" && (
          <section className="history-workbench">
            <header className="history-heading">
              <div>
                <h2>检查记录</h2>
                <p>最近 20 次检查保存在本机；查看记录不会重新连接服务器。</p>
              </div>
              <div className="history-retention"><History size={18} /><span>保留</span><strong>{scheduler?.retentionDays ?? 7} 天</strong></div>
            </header>

            <div className="history-filters" role="group" aria-label="筛选检查历史">
              {checkHistoryFilters.map((filter) => (
                <button
                  key={filter.id}
                  className={checkFilter === filter.id ? "active" : ""}
                  aria-pressed={checkFilter === filter.id}
                  onClick={() => chooseCheckFilter(filter.id)}
                >
                  {filter.label}<span>{filterChecks(checks, filter.id).length}</span>
                </button>
              ))}
            </div>

            {checks.length === 0 ? (
              <div className="history-empty">
                <ClipboardCheck size={26} />
                <strong>还没有检查记录</strong>
                <p>先登记证据来源并主动检查一次。LocalOps 不会因为打开此页面就扫描网络。</p>
                <button className="primary slim" onClick={() => setSelectedTab("overview")}><Play size={15} />回到值守台</button>
              </div>
            ) : (
              <div className="history-layout">
                <aside className="history-timeline" aria-label="检查记录列表">
                  {filteredChecks.length ? filteredChecks.map((check) => {
                    const trigger = checkTriggerCopy(check.trigger);
                    return (
                      <button
                        key={check.id}
                        className={selectedCheckId === check.id ? "selected" : ""}
                        aria-current={selectedCheckId === check.id ? "true" : undefined}
                        onClick={() => setSelectedCheckId(check.id)}
                      >
                        <span className={`history-node ${check.overallStatus}`} aria-hidden="true" />
                        <span className="history-card-head"><b>{trigger.label}</b><StatusPill status={check.overallStatus} /></span>
                        <small>{formatTime(check.finishedAt)}</small>
                        <strong>{friendlyCheckSummary(check.summary)}</strong>
                        <em>{checkScopeCopy(check.hostScope)}</em>
                      </button>
                    );
                  }) : (
                    <div className="history-filter-empty"><strong>这个筛选下没有记录</strong><span>切换到“全部”查看最近检查。</span></div>
                  )}
                </aside>

                <article className="history-receipt" aria-live="polite">
                  {selectedCheck && checkDetailState === "loading" ? (
                    <div className="history-detail-state"><RefreshCcw className="spin" size={20} /><strong>正在读取本地证据账本</strong><span>不会发起服务器检查</span></div>
                  ) : checkDetailState === "error" ? (
                    <div className="history-detail-state warning"><AlertTriangle size={20} /><strong>这份本地证据暂时无法读取</strong><span>{checkDetailError}</span><button onClick={() => selectedCheckId != null && loadCheckDetail(selectedCheckId)}><RefreshCcw size={15} />重新读取</button></div>
                  ) : selectedCheck && checkDetail ? (
                    <>
                      <div className="history-receipt-head">
                        <div>
                          <span>{formatTime(checkDetail.check.finishedAt)}</span>
                          <h3>{checkTriggerCopy(checkDetail.check.trigger).label}</h3>
                          <p>{checkTriggerCopy(checkDetail.check.trigger).detail}</p>
                        </div>
                        <StatusPill status={checkDetail.check.overallStatus} />
                      </div>
                      <div className="history-receipt-facts">
                        <span>耗时<strong>{checkDetail.check.durationMs}ms</strong></span>
                        <span>检查范围<strong>{checkScopeCopy(checkDetail.check.hostScope)}</strong></span>
                        <span>服务器<strong>{checkDetail.hosts.length} 台</strong></span>
                      </div>
                      <section className={`history-decision ${checkDetail.check.overallStatus}`}>
                        <span>本次结论</span>
                        <strong>{checkDecisionCopy(checkDetail.check.overallStatus)}</strong>
                        <p>{friendlyCheckSummary(checkDetail.check.summary)}</p>
                      </section>
                      <div className="history-host-evidence">
                        {checkDetail.hosts.map((hostEvidence) => (
                          <details className={`history-host-card ${hostEvidence.status}`} key={hostEvidence.hostId} open={hostEvidence.status === "warning" || hostEvidence.status === "critical" || undefined}>
                            <summary>
                              <span><i className={`host-dot ${hostEvidence.status}`} aria-hidden="true" /><strong>{hostEvidence.hostName}</strong><small>{hostEvidence.summary}</small></span>
                              <StatusPill status={hostEvidence.status} />
                            </summary>
                            <div className="history-host-body">
                              <div className="history-signal-ledger">
                                <span>网页/API<strong>{friendlyHttpStatus(hostEvidence.httpStatus)}{hostEvidence.httpLatencyMs == null ? "" : ` · ${hostEvidence.httpLatencyMs}ms`}</strong></span>
                                <span>只读 SSH<strong>{friendlySshStatus(hostEvidence.sshStatus)}</strong></span>
                                <span>Docker<strong>{friendlyDockerStatus(hostEvidence.dockerStatus)}</strong></span>
                                <span>资源<strong>CPU {hostEvidence.cpuPercent == null ? "未采集" : `${hostEvidence.cpuPercent}%`} · 内存 {hostEvidence.memoryPercent == null ? "未采集" : `${hostEvidence.memoryPercent}%`} · 磁盘 {hostEvidence.diskPercent == null ? "未采集" : `${hostEvidence.diskPercent}%`}</strong></span>
                              </div>
                              <details className="history-evidence-list"><summary>查看判断依据</summary><ul>{hostEvidence.evidence.map((item, index) => <li key={`${hostEvidence.hostId}-${index}`}>{friendlyEvidence(item)}</li>)}</ul></details>
                            </div>
                          </details>
                        ))}
                      </div>
                      <details className="history-boundary"><summary><ShieldCheck size={16} />隐私说明</summary><p>详情来自本机保存的脱敏结果，不含地址、SSH 别名或项目名称，也不会触发新检查。</p></details>
                    </>
                  ) : (
                    <div className="history-detail-state"><History size={20} /><strong>选择一条检查记录</strong><span>右侧会解释当时看到了什么、为什么这样判断。</span></div>
                  )}
                </article>
              </div>
            )}
          </section>
        )}

        {selectedTab === "scheduler" && (
          <section className="scheduler-layout">
            <section className={`watch-readiness-summary ${watchSetup.complete ? "complete" : ""}`} aria-labelledby="watch-readiness-title">
              <header>
                <div>
                  <h2 id="watch-readiness-title">自动值守</h2>
                  <p>{watchSetup.complete ? "自动检查和桌面提醒都已准备好。" : "设置好下面三项，LocalOps 才能在你不盯着界面时继续值守。"}</p>
                </div>
                <output>{watchSetup.complete ? "已准备好" : `${watchSetup.readyCount} / ${watchSetup.total} 已设置`}</output>
              </header>
              <div className="watch-summary-line" aria-label="值守准备状态">
                <span className={batchCoverage.collectible > 0 ? "ready" : "waiting"}>证据来源 <strong>{batchCoverage.collectible} / {batchCoverage.total} 台</strong></span>
                <span className={scheduler?.enabled ? "ready" : "waiting"}>自动检查 <strong>{scheduler?.enabled ? `每 ${scheduler.lightIntervalMinutes} 分钟` : "未开启"}</strong></span>
                <span className={notificationsCalibrated ? "ready" : "waiting"}>桌面提醒 <strong>{!desktopRuntime ? "桌面版设置" : notificationsCalibrated ? "可用" : "未确认"}</strong></span>
              </div>
            </section>

            <section className="watch-settings-panel" aria-labelledby="watch-settings-title">
              <header>
                <h2 id="watch-settings-title">日常设置</h2>
                <p>这些设置只在本机 LocalOps 运行时生效。</p>
              </header>

              <section className="watch-setting-row" id="scheduler-controls" tabIndex={-1}>
                <span className="watch-setting-icon"><Clock3 size={20} /></span>
                <div className="watch-setting-copy">
                  <strong>自动检查</strong>
                  <p>{schedulerForm.enabled ? `每 ${schedulerForm.lightIntervalMinutes} 分钟读取一次已配置的证据。` : "关闭时只会在你点击“一键检查”后读取服务器状态。"}</p>
                  {batchCoverage.blocked ? <small>{batchCoverage.blocked} 台缺少监控来源，自动检查会跳过。</small> : null}
                </div>
                <div className="watch-setting-controls scheduler-inline">
                  <button
                    className={schedulerForm.enabled ? "toggle active" : "toggle"}
                    disabled={!schedulerForm.enabled && batchCoverage.collectible === 0}
                    onClick={() => setSchedulerForm({ ...schedulerForm, enabled: !schedulerForm.enabled })}
                    aria-pressed={schedulerForm.enabled}
                  >{schedulerForm.enabled ? "已开启" : "未开启"}</button>
                  <label><input type="number" min={1} max={1440} value={schedulerForm.lightIntervalMinutes} onChange={(event) => setSchedulerForm({ ...schedulerForm, lightIntervalMinutes: Number(event.target.value) })} /><span>分钟</span></label>
                  <button className="primary slim" onClick={() => saveScheduler()} disabled={operationBusy || (schedulerForm.enabled && batchCoverage.collectible === 0)}>{operationState.savingScheduler ? "保存中" : "保存"}</button>
                </div>
              </section>

              <section className="watch-setting-row" id="notification-controls" tabIndex={-1}>
                <span className="watch-setting-icon"><Bell size={20} /></span>
                <div className="watch-setting-copy">
                  <strong>桌面提醒</strong>
                  <p>{!desktopRuntime ? "安装并打开桌面版后，可在状态变差时收到 Windows 提醒。" : notificationsCalibrated ? "测试提醒已经确认；只有状态变差才会通知。" : notificationsEnabled ? "提醒已开启，还需要确认一次测试消息。" : "开启后，状态变差时会提醒你。"}</p>
                  {notificationNote ? <small className={notificationTestState === "failed" ? "error" : ""}>{notificationNote}</small> : null}
                </div>
                <div className="watch-setting-controls">
                  {!desktopRuntime ? (
                    <button disabled>桌面版设置</button>
                ) : notificationTestState === "confirm" ? (
                  <div className="notification-confirm">
                    <span>刚才看到测试提醒了吗？</span>
                    <button className="primary slim" onClick={() => finishNotificationCalibration(true)}>看到了</button>
                    <button className="secondary slim" onClick={() => finishNotificationCalibration(false)}>没看到</button>
                  </div>
                ) : (
                  <div className="notification-actions">
                    <button className="primary slim" disabled={notificationTestState === "sending"} onClick={startNotificationCalibration}>{notificationTestState === "sending" ? "正在测试" : notificationsCalibrated ? "重新测试" : "开启并测试"}</button>
                    {notificationsEnabled ? <button className="secondary slim" onClick={disableNotifications}>关闭提醒</button> : null}
                  </div>
                )}
                </div>
              </section>

              <section className="watch-setting-row">
                <span className="watch-setting-icon"><MonitorUp size={20} /></span>
                <div className="watch-setting-copy">
                  <strong>登录后自动打开桌宠</strong>
                  <p>{startup?.message ?? "正在读取当前用户的启动设置。"}</p>
                </div>
                <div className="watch-setting-controls">
                {startupPending == null ? (
                  <button
                    className={startup?.enabled ? "secondary slim" : "primary slim"}
                    disabled={startupLoading || !startup?.supported || (!startup.enabled && !startup.ready) || startup.status === "conflict"}
                    onClick={() => setStartupPending(!startup?.enabled)}
                  >
                    {startup?.supported ? startup?.enabled ? "关闭" : "开启" : "桌面版设置"}
                  </button>
                ) : (
                  <div className="startup-confirm" role="group" aria-label="确认登录启动设置">
                    <strong>{startupPending ? "确认下次登录自动打开桌宠？" : "确认移除 LocalOps 登录启动项？"}</strong>
                    <small>{startupPending ? "只创建一个可识别、可撤销的当前用户启动项。" : "只移除内容完全匹配的 LocalOps 启动项。"}</small>
                    <div>
                      <button className="primary slim" disabled={startupLoading} onClick={() => saveStartup(startupPending)}>{startupLoading ? "处理中" : "确认"}</button>
                      <button className="secondary slim" disabled={startupLoading} onClick={() => setStartupPending(null)}>取消</button>
                    </div>
                  </div>
                )}
                </div>
              </section>
            </section>

            <section className={`watch-last-run ${schedulerOutcome.tone}`} aria-live="polite">
              <div>
                <span>最近自动检查</span>
                <strong>{schedulerOutcome.title}</strong>
                <p>{schedulerOutcome.detail}</p>
              </div>
              <div className="watch-last-run-meta">
                <span>{schedulerOutcome.label}</span>
                <small>{scheduler?.lastEventAt ? formatTime(scheduler.lastEventAt) : "尚无记录"}</small>
                {schedulerOutcome.action === "run-now" ? <button className="secondary slim" disabled={operationBusy} onClick={verifySchedulerNow}>{checking ? "检查中" : "立即检查"}</button> : schedulerOutcome.action === "configure-hosts" ? <button className="secondary slim" onClick={() => setSelectedTab("hosts")}>补充监控来源</button> : null}
              </div>
            </section>

            <details className="watch-advanced">
              <summary>本地记录与维护</summary>
              <div className="watch-advanced-body">
                <div className="watch-maintenance-copy">
                  <strong>检查记录保留 {schedulerForm.retentionDays} 天</strong>
                  <p>{batchCoverage.collectible} / {batchCoverage.total} 台服务器有可用监控来源；完整来源 {batchCoverage.complete} 台，局部来源 {batchCoverage.partial} 台。</p>
                </div>
                <div className="watch-maintenance-controls">
                  <label><input type="number" min={1} max={365} value={schedulerForm.retentionDays} onChange={(event) => setSchedulerForm({ ...schedulerForm, retentionDays: Number(event.target.value) })} /><span>天</span></label>
                  <button disabled={operationBusy} onClick={() => runRetention(false)}>{operationState.retaining ? "清理中" : "按保留期清理"}</button>
                  <button disabled={operationBusy} onClick={() => runRetention(true)}>{operationState.retaining ? "清理中" : "清理并压缩数据库"}</button>
                </div>
                {retentionResult ? (
                  <div className="retention-result">
                    <strong>最近清理完成</strong>
                    <p>删除检查 {retentionResult.deletedRuns} 次、明细 {retentionResult.deletedHostChecks} 条、操作回执 {retentionResult.deletedActionRuns} 条；数据库 {Math.round(retentionResult.sizeBytes / 1024)} KB。</p>
                  </div>
                ) : null}
              </div>
            </details>
          </section>
        )}

        {selectedTab === "actions" && (
          <section className="action-layout">
            <header className="action-intro">
              <div><button className="action-back" onClick={returnToActionHost}>← 返回 {actionHost?.name ?? "原服务器"}</button><h2>安全操作</h2></div>
              <p>先核对排查结论，再决定是否执行。没有对应证据的变更会被拒绝。</p>
            </header>
            <div className="action-menu">
              <button className={dryRun?.actionKey === "inspect-service" ? "selected" : ""} disabled={operationBusy || !actionHost} onClick={() => runDryAction("inspect-service", actionHost?.id)}><CheckCircle2 size={17} />{operationState.preparingAction ? "生成中" : "只读检查"}</button>
              <button className={dryRun?.actionKey === "reload-nginx" ? "selected" : ""} disabled={operationBusy || !actionHost} onClick={() => runDryAction("reload-nginx", actionHost?.id)}><RefreshCcw size={17} />Nginx 重载</button>
              <button className={dryRun?.actionKey === "restart-compose-service" ? "selected" : ""} disabled={operationBusy || !actionHost} onClick={() => runDryAction("restart-compose-service", actionHost?.id)}><AlertTriangle size={17} />重启服务</button>
            </div>
            <div className="detail-panel">
              <h2>{dryRun && actionHost ? dryRun.actionKey === "inspect-service" ? `只读检查：${actionHost.name}` : dryRun.actionKey === "reload-nginx" ? `Nginx 重载预案：${actionHost.name}` : `服务重启预案：${actionHost.name}` : actionHost ? "选择一种操作" : "原服务器已不可用"}</h2>
              {dryRun && actionHost ? (
                <>
                  <div className={`action-contract ${dryRun.executionState}`}>
                    <div><span>风险等级</span><strong>{({ "read-only": "只读", low: "低风险", medium: "中风险", high: "高风险" } as const)[dryRun.riskTier]}</strong></div>
                    <div><span>远程执行</span><strong>{dryRun.actionKey === "reload-nginx" && actionCapability?.enabled ? "逐次授权" : "关闭"}</strong></div>
                    <div><span>参数状态</span><strong>{dryRun.copyAllowed ? "可复制只读命令" : "占位符模板"}</strong></div>
                    <p>{dryRun.safetyBoundary}</p>
                  </div>
                  {dryRun.blockedReason ? <div className="action-boundary"><AlertTriangle size={16} />{dryRun.blockedReason}</div> : null}
                  <h3>命令预览（不会执行）</h3>
                  <pre>{dryRun.commands.join("\n")}</pre>
                  <button
                    className={dryRun.copyAllowed ? "copy-action" : "disabled-action"}
                    disabled={!dryRun.copyAllowed}
                    onClick={copyDryRunCommands}
                  >
                    {dryRunCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
                    {dryRun.copyAllowed ? (dryRunCopied ? "已复制" : "复制只读命令") : "模板不可直接复制"}
                  </button>
                  <h3>验证步骤</h3>
                  <ul>{dryRun.verification.map((item) => <li key={item}>{item}</li>)}</ul>
                  {dryRun.actionKey === "reload-nginx" ? (
                    <section className="execution-gate" aria-label="Nginx 重载授权">
                      {actionExecution ? (
                        <div className={`action-receipt-result ${actionExecution.receipt.status}`} role="status">
                          <header><strong>{actionReceiptLabels[actionExecution.receipt.status]}</strong><span>{formatTime(actionExecution.receipt.finishedAt || actionExecution.receipt.startedAt)}</span></header>
                          <p>{actionExecution.receipt.summary}</p>
                          {actionExecution.steps.length ? <ol>{actionExecution.steps.map((step) => <li className={step.status} key={step.key}><strong>{step.label}</strong><span>{step.detail}</span></li>)}</ol> : null}
                          {actionExecution.receipt.status === "succeeded" ? null : <small>不要直接重复执行；先返回服务器详情查看最新证据。</small>}
                          <button className="secondary slim receipt-return" onClick={returnToActionHost}>查看最新状态</button>
                        </div>
                      ) : actionApproval ? (
                        <div className="action-approval" role="group" aria-label="最后确认 Nginx 重载">
                          <header><div><span>最后确认</span><h3>重载 {actionApproval.target.name} 的 Nginx</h3></div><em>{formatTime(actionApproval.expiresAt)} 前有效</em></header>
                          <div className="approval-sequence">
                            <span><b>1</b>先验证配置</span><span><b>2</b>通过后才重载</span><span><b>3</b>自动重新检查</span>
                          </div>
                          <p>{actionApproval.impact}</p>
                          <p className="approval-basis"><CheckCircle2 size={16} />{actionApproval.basis}</p>
                          <pre>{actionApproval.commands.join("\n")}</pre>
                          <p className="approval-stop"><ShieldCheck size={16} />{actionApproval.stopCondition}</p>
                          <label className="approval-check"><input type="checkbox" checked={actionConsent} onChange={(event) => setActionConsent(event.target.checked)} /><span>我已核对目标、两条命令和影响；异常时不会连续点击。</span></label>
                          <label className="approval-phrase"><span>输入 <strong>{actionApproval.requiredPhrase}</strong></span><input value={actionPhrase} onChange={(event) => setActionPhrase(event.target.value)} autoComplete="off" /></label>
                          <div className="approval-actions">
                            <button className="danger-action" disabled={!actionConsent || actionPhrase !== actionApproval.requiredPhrase || operationBusy} onClick={executeApprovedNginxAction}>{executingAction ? "正在执行" : "确认并重载 Nginx"}</button>
                            <button className="secondary slim" disabled={operationBusy} onClick={cancelActionApproval}>取消</button>
                          </div>
                        </div>
                      ) : actionCapability?.enabled ? (
                        <div className="execution-ready">
                          <AlertTriangle size={21} />
                          <div><strong>这是会改变服务器的操作</strong><p>准备后才会显示真实目标和完整命令；两分钟内输入确认短语才可执行。</p></div>
                          <button className="danger-outline" disabled={operationBusy} onClick={prepareNginxAction}>{preparingApproval ? "准备中" : "准备重载"}</button>
                        </div>
                      ) : (
                        <div className="execution-disabled">
                          <ShieldCheck size={20} />
                          <div><strong>远程变更保持关闭</strong><p>{actionCapability?.message || "正在读取本机操作通道状态。"}</p></div>
                        </div>
                      )}
                      {actionFlowError ? <div className="action-flow-error" role="alert"><AlertTriangle size={16} />{actionFlowError}</div> : null}
                    </section>
                  ) : dryRun.riskTier !== "read-only" ? (
                    <div className="danger-consent" role="note">
                      <AlertTriangle size={22} />
                      <div><strong>服务重启仍未开放</strong><p>当前缺少可验证的服务名称、部署目录和回退配置，因此只保留不可执行模板。</p></div>
                      <button disabled>保持关闭</button>
                    </div>
                  ) : null}
                </>
              ) : actionHost ? (
                <p className="action-empty">先从服务器详情运行“自动查原因”，或者在左侧选择只读检查。变更操作不会在没有对应证据时开放。</p>
              ) : (
                <p className="action-empty" role="alert">原服务器已不在当前列表中；这条操作流程已停止，不会自动切换到其他服务器。</p>
              )}
            </div>
            {actionReceipts.length ? (
              <details className="action-receipts">
                <summary>最近变更回执 · {actionReceipts.length}</summary>
                <div>{actionReceipts.map((receipt) => <article key={receipt.id}><span className={receipt.status}>{actionReceiptLabels[receipt.status]}</span><strong>{receipt.hostName}</strong><p>{receipt.summary}</p><time>{formatTime(receipt.finishedAt || receipt.startedAt)}</time></article>)}</div>
              </details>
            ) : null}
          </section>
        )}

        {selectedTab === "reports" && (
          <section className="report-panel report-workbench">
            <header className="report-page-head">
              <div><h2>分享当前状态</h2><p>默认只分享脱敏结论；需要逐机排查时，再打开内部材料。</p></div>
              <span><ShieldCheck size={16} />本机生成</span>
            </header>

            <section className="safe-share-primary" aria-label="可安全讨论的状态摘要">
              <div className="safe-share-heading">
                <div><span className="share-safety-label"><ShieldCheck size={15} />可安全讨论</span><h3>当前焦点摘要</h3></div>
                {selectedHost ? <StatusPill status={selectedHost.status} /> : null}
              </div>
              <div className="safe-brief-keypoints">
                <div><span>当前判断</span><p>{discussionBriefField(selectedBrief, "当前判断")}</p></div>
                <div><span>下一步</span><p>{discussionBriefField(selectedBrief, "建议")}</p></div>
                <div><span>先不要做</span><p>{discussionBriefField(selectedBrief, "避免")}</p></div>
              </div>
              <div className="safe-share-actions">
                <button className="primary slim" onClick={copyBrief}>{briefCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}{briefCopied ? "已复制" : "复制脱敏摘要"}</button>
                <a className="discuss-link" href={discussLink}><MessageCircle size={16} />让 Codex 帮我分析</a>
              </div>
              <details className="safe-brief-details"><summary>查看完整脱敏内容</summary><pre>{selectedBrief}</pre></details>
              <p className="share-privacy-note">已省略服务器名称、地址、SSH 别名、命令和原始证据。发送前仍可完整检查。</p>
            </section>

            <details className="internal-report-details">
              <summary>
                <span><FileText size={18} /><span><strong>内部诊断材料</strong><small>包含服务器名称和逐机状态，只用于本机或受控内部排查。</small></span></span>
                <em>含服务器信息</em>
              </summary>
              <div className="internal-report-body">
                <pre>{report}</pre>
                {reportCopyPending ? (
                  <div className="report-copy-confirm" role="group" aria-label="确认复制内部诊断报告">
                    <strong>这份材料包含服务器身份</strong>
                    <small>请只粘贴到受控内部位置；需要讨论时优先使用上方脱敏摘要。</small>
                    <div>
                      <button className="primary slim" onClick={copyInternalReport}><Copy size={16} />确认复制</button>
                      <button className="secondary slim" onClick={() => setReportCopyPending(false)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <button className="secondary slim" onClick={() => setReportCopyPending(true)}>
                    {reportCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}{reportCopied ? "已复制" : "复制内部材料"}
                  </button>
                )}
              </div>
            </details>
          </section>
        )}

        {selectedTab === "agent" && (
          <section className="report-panel agent-connect-panel">
            <header className="agent-connect-head">
              <div><h2>连接 Codex</h2><p>让 Codex 基于 LocalOps 的本机证据解释问题，不必手动复制整份日志。</p></div>
              <span><Bot size={17} />本地插件</span>
            </header>

            <div className="agent-boundaries">
              <section><strong>Codex 可以</strong><ul><li>读取当前状态和最近检查</li><li>发起固定范围的轻量检查</li><li>生成只读排查或变更预案</li></ul></section>
              <section><strong>Codex 不可以</strong><ul><li>执行任意 Shell 命令</li><li>直接重启、部署或删除</li><li>从摘要中取得服务器地址</li></ul></section>
            </div>

            <div className="agent-discuss-row">
              <div><strong>只想让 Codex 看一下？</strong><span>先用脱敏摘要开始任务，发送前可以检查内容。</span></div>
              <a className="discuss-link" href={discussLink}><MessageCircle size={16} />分析当前状态</a>
            </div>

            <details className="agent-setup-details">
              <summary><span><strong>在 Codex 中启用 LocalOps</strong><small>需要在 LocalOps 源码目录中执行一次</small></span><em>2 步</em></summary>
              <div className="agent-setup-body">
                <ol><li>将当前仓库注册为本地插件市场。</li><li>安装 LocalOps Guardian 插件，然后新建一个 Codex 任务。</li></ol>
                <pre>codex plugin marketplace add .{`\n`}codex plugin add localops-guardian@localops-desk</pre>
                <button className="secondary slim" onClick={copyAgentSetup}>{agentSetupCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}{agentSetupCopied ? "已复制" : "复制安装命令"}</button>
              </div>
            </details>

            <details className="agent-api-details">
              <summary><span><strong>本地 API</strong><small>供自有脚本和集成开发使用</small></span><em>开发者</em></summary>
              <div className="api-grid">
                {["GET /api/status", "POST /api/checks/light", "POST /api/checks/light/:hostId", "POST /api/diagnostics/:hostId", "GET /api/scheduler", "PUT /api/scheduler", "POST /api/maintenance/retention", "POST /api/actions/dry-run", "GET /api/reports/current", "GET /api/agent/manifest", "GET /api/agent/status"].map((item) => <code key={item}>{item}</code>)}
              </div>
            </details>
          </section>
        )}
      </main>
    </div>
  );
}
