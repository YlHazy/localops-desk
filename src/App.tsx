import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Globe2,
  FileText,
  History,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Server,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PetMode } from "./PetMode";
import type { CheckRun, DashboardStatus, DryRunAction, HostConfigInput, HostState, RetentionResult, SchedulerState, Status } from "./types";

const statusLabels: Record<Status, string> = {
  healthy: "正常",
  warning: "需处理",
  critical: "故障",
  unknown: "未检查"
};

const statusOrder: Status[] = ["critical", "warning", "unknown", "healthy"];

const signalLabels = {
  http: "入口信号",
  ssh: "管理通道",
  runtime: "运行时",
  advice: "安全下一步"
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
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

function overallMessage(counts: Record<Status, number>) {
  if ((counts.critical ?? 0) > 0) {
    return {
      title: `${counts.critical} 台服务器故障`,
      description: "先看红色故障项。HTTP、SSH 或资源检查中至少有一项失败。"
    };
  }
  if ((counts.warning ?? 0) > 0) {
    return {
      title: `${counts.warning} 台服务器需要处理`,
      description: "服务可能还能访问，但管理通道、资源指标或某个依赖需要确认。"
    };
  }
  if ((counts.unknown ?? 0) > 0) {
    return {
      title: `${counts.unknown} 台服务器还没检查`,
      description: "先运行一次检查，拿到当前状态。"
    };
  }
  return {
    title: "当前全部正常",
    description: "所有已配置服务器最近一次检查都没有发现问题。"
  };
}

function shortSignal(value: string) {
  if (!value) return "未检查";
  if (value.length <= 72) return value;
  return `${value.slice(0, 72)}...`;
}

function friendlySshStatus(value: string) {
  if (!value || value === "not checked") return "未检查";
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

function httpSignalStatus(host: HostState): Status {
  if (!host.httpStatus || /not checked|未检查/i.test(host.httpStatus)) return "unknown";
  return /HTTP 2\d\d|\bok\b/i.test(host.httpStatus) ? "healthy" : "critical";
}

function sshSignalStatus(host: HostState): Status {
  if (!host.sshStatus || host.sshStatus === "not checked") return "unknown";
  return host.sshStatus === "ok" ? "healthy" : "warning";
}

function runtimeSignalStatus(host: HostState): Status {
  if (!host.dockerStatus || host.dockerStatus === "not checked") return "unknown";
  return host.dockerStatus === "docker checked" ? "healthy" : "warning";
}

function evidenceFreshness(dashboard: DashboardStatus, now = Date.now()) {
  if (!dashboard.observedAt) return { state: "unknown", label: "没有观测证据" };
  const ageMs = now - new Date(dashboard.observedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > dashboard.staleAfterMs) {
    return { state: "unknown", label: "证据已过期" };
  }
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  return { state: "fresh", label: minutes === 0 ? "刚刚取得证据" : `${minutes} 分钟前取得证据` };
}

function nextStepFor(host: HostState) {
  if (host.status === "critical") return { title: "先生成只读检查预案", detail: "不要直接重启。先确认失败层和验证命令。" };
  if (host.status === "warning") return { title: "复核异常信号", detail: "刷新这台服务器，再比较 HTTP、SSH 与运行时证据。" };
  if (host.status === "unknown") return { title: "取得一份新证据", detail: "运行单机轻巡检；未知状态不按正常处理。" };
  return { title: "保持值守", detail: "当前没有操作理由；等待下一次巡检即可。" };
}

function shareableJudgment(host: HostState) {
  if (host.status === "critical") return "至少一类基础检查明确失败，需要先定位失败层。";
  if (host.status === "warning") return "服务可能仍可用，但至少一类信号需要复核。";
  if (host.status === "unknown") return "当前证据不足，不能把未知状态当作正常。";
  return "最近一次有效观测没有发现基础检查异常。";
}

function shareableSignal(label: string, status: Status) {
  const copy: Record<Status, string> = {
    healthy: "有效证据显示正常",
    warning: "存在需要复核的信号",
    critical: "有效证据显示失败",
    unknown: "没有足够的新鲜证据"
  };
  return `- ${label}：${copy[status]}`;
}

function discussionBrief(dashboard: DashboardStatus, host: HostState, now = Date.now()) {
  const freshness = evidenceFreshness(dashboard, now);
  const nextStep = nextStepFor(host);
  const evidence = [
    shareableSignal(signalLabels.http, httpSignalStatus(host)),
    shareableSignal(signalLabels.ssh, sshSignalStatus(host)),
    shareableSignal(signalLabels.runtime, runtimeSignalStatus(host))
  ].join("\n");
  return [
    "LocalOps 值守讨论摘要",
    `对象：${host.name}（${host.environment} / ${host.role}）`,
    `状态：${statusLabels[host.status]}`,
    `证据时效：${freshness.label}`,
    `当前判断：${shareableJudgment(host)}`,
    "证据：",
    evidence,
    `建议：${nextStep.title}。${nextStep.detail}`,
    "边界：只讨论诊断与验证步骤，不执行重启、部署、删除或配置变更。"
  ].join("\n");
}

function codexDiscussionLink(brief: string) {
  const prompt = `[@LocalOps Guardian] 请基于下面的本地脱敏摘要解释最可能的故障层、缺失证据和下一条安全验证动作。不要执行任何变更。\n\n${brief}`;
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill ${status}`}>{statusLabels[status]}</span>;
}

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const safeValue = value ?? 0;
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <strong>{value == null ? "N/A" : `${value}%`}</strong>
      </div>
      <div className="metric-track">
        <div className="metric-fill" style={{ width: `${Math.min(safeValue, 100)}%` }} />
      </div>
    </div>
  );
}

function HostPanel({ host, selected, onSelect }: { host: HostState; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`host-panel ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="host-panel-top">
        <span className="host-name">{host.name}</span>
        <StatusPill status={host.status} />
      </div>
      <div className="host-meta">
        <span>{host.environment}</span>
        <span>{host.role}</span>
        <span>{host.sshAlias}</span>
      </div>
      <p>{host.summary}</p>
      <div className="host-mini-grid">
        <span>网页/API：{shortSignal(host.httpStatus)}{host.httpLatencyMs == null ? "" : ` · ${host.httpLatencyMs}ms`}</span>
        <span>SSH：{friendlySshStatus(host.sshStatus)}</span>
        <span>Docker：{friendlyDockerStatus(host.dockerStatus)}</span>
      </div>
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
  editing
}: {
  form: HostConfigInput;
  setForm: (form: HostConfigInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  editing: boolean;
}) {
  const update = (key: keyof HostConfigInput, value: string) => {
    setForm({ ...form, [key]: key === "tags" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value });
  };
  return (
    <div className="host-form">
      <div className="form-grid">
        <label>名称<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="my-server-01" /></label>
        <label>环境<input value={form.environment} onChange={(event) => update("environment", event.target.value)} placeholder="production" /></label>
        <label>角色<input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="web/api/db" /></label>
        <label>SSH Alias<input value={form.sshAlias} onChange={(event) => update("sshAlias", event.target.value)} placeholder="~/.ssh/config Host" /></label>
        <label className="wide">Health URL<input value={form.healthUrl} onChange={(event) => update("healthUrl", event.target.value)} placeholder="https://example.com/health" /></label>
        <label>Compose 项目<input value={form.composeProject} onChange={(event) => update("composeProject", event.target.value)} placeholder="compose project" /></label>
        <label>标签<input value={form.tags.join(", ")} onChange={(event) => update("tags", event.target.value)} placeholder="main, docker" /></label>
      </div>
      <div className="form-actions">
        <button className="primary slim" onClick={onSubmit}><Save size={16} />{editing ? "保存配置" : "新增主机"}</button>
        <button onClick={onCancel}><X size={16} />取消</button>
      </div>
    </div>
  );
}

export function App() {
  const petMode = new URLSearchParams(window.location.search).get("mode") === "pet";
  const [dashboard, setDashboard] = useState<DashboardStatus | null>(null);
  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunAction | null>(null);
  const [report, setReport] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [hostForm, setHostForm] = useState<HostConfigInput>(emptyHostForm);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [schedulerForm, setSchedulerForm] = useState({ enabled: false, lightIntervalMinutes: 15, retentionDays: 7 });
  const [retentionResult, setRetentionResult] = useState<RetentionResult | null>(null);
  const [briefCopied, setBriefCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    if (petMode) {
      const status = await api<DashboardStatus>("/api/status");
      setDashboard(status);
      setSelectedHostId((prev) => prev ?? status.hosts[0]?.id ?? null);
      return;
    }
    const [status, recent, currentReport, schedulerState] = await Promise.all([
      api<DashboardStatus>("/api/status"),
      api<{ checks: CheckRun[] }>("/api/checks"),
      api<{ report: string }>("/api/reports/current"),
      api<{ scheduler: SchedulerState }>("/api/scheduler")
    ]);
    setDashboard(status);
    setChecks(recent.checks);
    setReport(currentReport.report);
    setScheduler(schedulerState.scheduler);
    setSchedulerForm({
      enabled: schedulerState.scheduler.enabled,
      lightIntervalMinutes: schedulerState.scheduler.lightIntervalMinutes,
      retentionDays: schedulerState.scheduler.retentionDays
    });
    setSelectedHostId((prev) => prev ?? status.hosts[0]?.id ?? null);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (petMode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [petMode]);

  function retryLoad() {
    setError("");
    load().catch((err: Error) => setError(err.message));
  }

  const selectedHost = useMemo(
    () => dashboard?.hosts.find((host) => host.id === selectedHostId) ?? dashboard?.hosts[0] ?? null,
    [dashboard, selectedHostId]
  );

  const incidentHosts = useMemo(() => dashboard?.hosts.filter((host) => host.status !== "healthy") ?? [], [dashboard]);
  const priorityHosts = useMemo(() => {
    const rank: Record<Status, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
    return [...(dashboard?.hosts ?? [])].sort((left, right) => rank[left.status] - rank[right.status] || left.name.localeCompare(right.name));
  }, [dashboard]);
  const currentMessage = useMemo(() => overallMessage(dashboard?.counts ?? { healthy: 0, warning: 0, critical: 0, unknown: 0 }), [dashboard]);
  const freshness = useMemo(() => dashboard ? evidenceFreshness(dashboard, now) : { state: "unknown", label: "没有观测证据" }, [dashboard, now]);
  const selectedNextStep = useMemo(() => selectedHost ? nextStepFor(selectedHost) : null, [selectedHost]);
  const selectedBrief = useMemo(() => dashboard && selectedHost ? discussionBrief(dashboard, selectedHost, now) : "", [dashboard, selectedHost, now]);
  const discussLink = useMemo(() => codexDiscussionLink(selectedBrief), [selectedBrief]);

  async function copyBrief() {
    if (!selectedBrief) return;
    try {
      await navigator.clipboard.writeText(selectedBrief);
      setBriefCopied(true);
      window.setTimeout(() => setBriefCopied(false), 2_000);
    } catch {
      setError("复制失败。请打开文本报告并手动复制。");
    }
  }

  async function runLightCheck(hostId?: string) {
    setLoading(true);
    setError("");
    try {
      await api(hostId ? `/api/checks/light/${encodeURIComponent(hostId)}` : "/api/checks/light", { method: "POST", body: "{}" });
      await load();
      setSelectedTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "检查失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveScheduler(next = schedulerForm) {
    setLoading(true);
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
      setLoading(false);
    }
  }

  async function runRetention(vacuum = false) {
    setLoading(true);
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
      setLoading(false);
    }
  }

  async function runDryAction(actionKey: string) {
    setError("");
    try {
      const result = await api<DryRunAction>("/api/actions/dry-run", {
        method: "POST",
        body: JSON.stringify({ hostId: selectedHost?.id, actionKey })
      });
      setDryRun(result);
      setSelectedTab("actions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "dry-run 失败");
    }
  }

  function startCreateHost() {
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
      tags: []
    });
    setShowHostForm(true);
    setSelectedTab("hosts");
  }

  async function saveHost() {
    setLoading(true);
    setError("");
    try {
      await api(editingHostId ? `/api/hosts/${encodeURIComponent(editingHostId)}` : "/api/hosts", {
        method: editingHostId ? "PUT" : "POST",
        body: JSON.stringify(hostForm)
      });
      setShowHostForm(false);
      setEditingHostId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存主机失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeHost(hostId: string) {
    setLoading(true);
    setError("");
    try {
      await api(`/api/hosts/${encodeURIComponent(hostId)}`, { method: "DELETE" });
      setSelectedHostId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除主机失败");
    } finally {
      setLoading(false);
    }
  }

  if (!dashboard) {
    return (
      <main className={`boot ${petMode ? "pet-boot" : ""}`}>
        {error ? <AlertTriangle /> : <Activity className="spin" />}
        <span>{error ? `无法连接本地 LocalOps API：${error}` : "正在连接本地 LocalOps API..."}</span>
        {error ? <button onClick={retryLoad}>重试</button> : null}
      </main>
    );
  }

  if (petMode) {
    return (
      <PetMode
        dashboard={dashboard}
        loading={loading}
        error={error}
        onRefresh={(hostId) => runLightCheck(hostId)}
        onOpenDesk={() => window.location.assign("/")}
        onDiscuss={(hostId) => {
          const host = dashboard.hosts.find((item) => item.id === hostId);
          if (host) window.location.assign(codexDiscussionLink(discussionBrief(dashboard, host)));
        }}
      />
    );
  }

  if (!selectedHost) {
    return (
      <main className="empty-host-setup">
        <section className="empty-host-card">
          <Server size={28} />
          <h1>尚未配置服务器</h1>
          <p>先添加一台服务器。只需名称；SSH alias 和健康检查地址都可以稍后再填。</p>
          {showHostForm ? (
            <HostForm
              form={hostForm}
              setForm={setHostForm}
              onSubmit={saveHost}
              onCancel={() => setShowHostForm(false)}
              editing={false}
            />
          ) : (
            <button className="primary" onClick={startCreateHost}><Plus size={16} />添加服务器</button>
          )}
          {error ? <p className="error-banner">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div>
            <strong>LocalOps Guardian</strong>
            <span>证据先于操作</span>
          </div>
        </div>
        <nav>
          {[
            ["overview", Activity, "首页"],
            ["hosts", Server, "服务器配置"],
            ["scheduler", Clock3, "自动检查"],
            ["checks", History, "检查记录"],
            ["actions", TerminalSquare, "操作预案"],
            ["reports", FileText, "文本报告"],
            ["agent", Bot, "给 Agent 用"]
          ].map(([key, Icon, label]) => (
            <button key={key as string} className={selectedTab === key ? "active" : ""} onClick={() => setSelectedTab(key as string)}>
              <Icon size={18} />
              <span>{label as string}</span>
            </button>
          ))}
        </nav>
        <div className="mode-box">
          <span>当前采集方式</span>
          <strong>{dashboard.mode === "ssh-enabled" ? "SSH 已启用" : "安全模拟"}</strong>
          <small>{dashboard.mode === "ssh-enabled" ? "只执行只读命令，不会重启服务。" : "不会连接真实服务器。"}</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">WATCH FLOOR / 本地值守台</span>
            <h1>先看结论，再决定要不要动</h1>
            <p>页面刷新：{formatTime(dashboard.generatedAt)} · {freshness.label}</p>
          </div>
          <button className="primary" onClick={() => runLightCheck()} disabled={loading}>
            {loading ? <RefreshCcw className="spin" size={18} /> : <Play size={18} />}
            <span>{loading ? "检查中" : "刷新全部"}</span>
          </button>
          <button className="secondary" onClick={startCreateHost}>
            <Plus size={18} />
            <span>添加服务器</span>
          </button>
        </header>

        {error ? <div className="error-line"><AlertTriangle size={16} />{error}</div> : null}

        <section className={`guardian-brief ${dashboard.counts.critical ? "critical" : dashboard.counts.warning ? "warning" : "healthy"}`}>
          <div className="guardian-brief-copy">
            <span className="brief-index">GUARDIAN BRIEF · {freshness.state === "fresh" ? "LIVE" : "STALE"}</span>
            <h2>{currentMessage.title}</h2>
            <p>{currentMessage.description}</p>
            <div className="brief-focus">
              <span>当前焦点</span>
              <strong>{selectedHost.name}</strong>
              <em>{selectedHost.summary}</em>
            </div>
          </div>
          <div className="guardian-decision">
            <span>建议</span>
            <strong>{selectedNextStep?.title}</strong>
            <p>{selectedNextStep?.detail}</p>
            <div className="guardian-actions">
              <button className="primary slim" onClick={() => runLightCheck(selectedHost.id)} disabled={loading}><RefreshCcw size={16} />刷新证据</button>
              <button className="secondary slim" onClick={copyBrief}>{briefCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}{briefCopied ? "已复制" : "复制讨论摘要"}</button>
              <a className="discuss-link" href={discussLink}><MessageCircle size={16} />交给 Codex 讨论</a>
            </div>
            <small>Codex 链接只预填摘要，不会自动发送或执行操作。</small>
          </div>
        </section>

        <section className="status-strip compact">
          {statusOrder.map((status) => (
            <button className={`status-tile ${status}`} key={status} onClick={() => {
              const target = priorityHosts.find((host) => host.status === status);
              if (target) setSelectedHostId(target.id);
            }}>
              <span>{statusLabels[status]}</span>
              <strong>{dashboard.counts[status] ?? 0}</strong>
            </button>
          ))}
        </section>

        {selectedTab === "overview" && (
          <section className="home-grid">
            <div className="todo-panel">
              <div className="panel-head">
                <div>
                  <h2>先看这里</h2>
                  <p>按严重程度排序，点一行查看详情。</p>
                </div>
              </div>
              {incidentHosts.length ? (
                priorityHosts.filter((host) => host.status !== "healthy").map((host) => (
                  <button key={host.id} className={host.id === selectedHost.id ? "selected" : ""} onClick={() => setSelectedHostId(host.id)}>
                    <div>
                      <strong>{host.name}</strong>
                      <span>{host.environment} · {host.role}</span>
                    </div>
                    <StatusPill status={host.status} />
                    <p>{host.summary}</p>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <CheckCircle2 size={20} />
                  <strong>没有待处理问题</strong>
                  <span>可以稍后再刷新一次，或打开自动检查。</span>
                </div>
              )}
            </div>

            <div className="detail-panel main-detail">
              <div className="detail-head">
                <div>
                  <h2>{selectedHost.name}</h2>
                  <p>{selectedHost.environment} / {selectedHost.role}</p>
                </div>
                <StatusPill status={selectedHost.status} />
              </div>
              <div className="signal-grid">
                <div className="metric">
                  <div className="metric-head"><span>网页/API</span><strong>{selectedHost.httpLatencyMs == null ? "未检查" : `${selectedHost.httpLatencyMs}ms`}</strong></div>
                  <p className="metric-note">{shortSignal(selectedHost.httpStatus)}</p>
                </div>
                <div className="metric">
                  <div className="metric-head"><span>SSH</span><strong>{selectedHost.sshStatus === "ok" ? "正常" : "需确认"}</strong></div>
                  <p className="metric-note">{friendlySshStatus(selectedHost.sshStatus)}</p>
                </div>
                <div className="metric">
                  <div className="metric-head"><span>Docker</span><strong>{selectedHost.dockerStatus === "docker checked" ? "已检查" : "未完成"}</strong></div>
                  <p className="metric-note">{friendlyDockerStatus(selectedHost.dockerStatus)}</p>
                </div>
              </div>
              <div className="proof-path" aria-label="LocalOps 判断链">
                <div className={`proof-node ${httpSignalStatus(selectedHost)}`}>
                  <span>01</span>
                  <small>{signalLabels.http}</small>
                  <strong>{shortSignal(selectedHost.httpStatus)}</strong>
                </div>
                <div className={`proof-node ${sshSignalStatus(selectedHost)}`}>
                  <span>02</span>
                  <small>{signalLabels.ssh}</small>
                  <strong>{friendlySshStatus(selectedHost.sshStatus)}</strong>
                </div>
                <div className={`proof-node ${runtimeSignalStatus(selectedHost)}`}>
                  <span>03</span>
                  <small>{signalLabels.runtime}</small>
                  <strong>{friendlyDockerStatus(selectedHost.dockerStatus)}</strong>
                </div>
                <div className={`proof-node advice ${selectedHost.status}`}>
                  <span>04</span>
                  <small>{signalLabels.advice}</small>
                  <strong>{selectedNextStep?.title}</strong>
                </div>
              </div>
              <div className="metrics-grid compact-metrics">
                <MetricBar label="CPU" value={selectedHost.cpuPercent} />
                <MetricBar label="内存" value={selectedHost.memoryPercent} />
                <MetricBar label="磁盘" value={selectedHost.diskPercent} />
              </div>
              <div className="evidence">
                <h3>检查说明</h3>
                {selectedHost.evidence.slice(0, 3).map((item) => <p key={item}>{friendlyEvidence(item)}</p>)}
              </div>
              <div className="quick-actions">
                <button className="primary slim" onClick={() => runLightCheck(selectedHost.id)}><RefreshCcw size={16} />刷新这台</button>
                <button onClick={() => startEditHost(selectedHost)}><Pencil size={16} />修改配置</button>
                <button onClick={() => runDryAction("inspect-service")}>生成检查命令</button>
              </div>
            </div>

            <div className="all-hosts-panel">
              <div className="panel-head">
                <div>
                  <h2>全部服务器</h2>
                  <p>一行一台，先看状态，再看 HTTP/SSH。</p>
                </div>
              </div>
              <div className="host-list simple">
                {priorityHosts.map((host) => (
                  <HostPanel
                    key={host.id}
                    host={host}
                    selected={host.id === selectedHost.id}
                    onSelect={() => setSelectedHostId(host.id)}
                  />
                ))}
              </div>
            </div>
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
              />
            ) : null}
            <table>
              <thead><tr><th>名称</th><th>环境</th><th>SSH</th><th>健康检查</th><th>Compose</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {dashboard.hosts.map((host) => (
                  <tr key={host.id}>
                    <td>{host.name}</td>
                    <td>{host.environment}</td>
                    <td>{host.sshAlias}</td>
                    <td>{host.healthUrl}</td>
                    <td>{host.composeProject}</td>
                    <td><StatusPill status={host.status} /></td>
                    <td className="row-actions">
                      <button onClick={() => startEditHost(host)}><Pencil size={15} />编辑</button>
                      <button onClick={() => removeHost(host.id)}><Trash2 size={15} />删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {selectedTab === "checks" && (
          <section className="table-panel">
            <h2>检查历史</h2>
            <table>
              <thead><tr><th>ID</th><th>类型</th><th>触发</th><th>范围</th><th>开始</th><th>耗时</th><th>状态</th><th>摘要</th></tr></thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.id}>
                    <td>#{check.id}</td>
                    <td>{check.kind}</td>
                    <td>{check.trigger}</td>
                    <td>{check.hostScope ?? "all"}</td>
                    <td>{formatTime(check.startedAt)}</td>
                    <td>{check.durationMs}ms</td>
                    <td><StatusPill status={check.overallStatus} /></td>
                    <td>{check.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {selectedTab === "scheduler" && (
          <section className="scheduler-layout">
            <div className="detail-panel">
              <div className="detail-head">
                <div>
                  <h2>本地定时巡检</h2>
                  <p>只在 LocalOps Desk 进程运行时生效；关闭本地程序后不会继续轮询服务器。</p>
                </div>
                <StatusPill status={scheduler?.enabled ? "healthy" : "unknown"} />
              </div>
              <div className="scheduler-grid">
                <label>
                  <span>启用定时巡检</span>
                  <button
                    className={schedulerForm.enabled ? "toggle active" : "toggle"}
                    onClick={() => setSchedulerForm({ ...schedulerForm, enabled: !schedulerForm.enabled })}
                  >
                    {schedulerForm.enabled ? "已启用" : "未启用"}
                  </button>
                </label>
                <label>
                  <span>轻量检查间隔（分钟）</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={schedulerForm.lightIntervalMinutes}
                    onChange={(event) => setSchedulerForm({ ...schedulerForm, lightIntervalMinutes: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>本地历史保留（天）</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={schedulerForm.retentionDays}
                    onChange={(event) => setSchedulerForm({ ...schedulerForm, retentionDays: Number(event.target.value) })}
                  />
                </label>
              </div>
              <div className="quick-actions">
                <button className="primary slim" onClick={() => saveScheduler()} disabled={loading}><Save size={16} />保存巡检配置</button>
                <button onClick={() => saveScheduler({ ...schedulerForm, enabled: false })}>停止定时巡检</button>
                <button onClick={() => runRetention(false)}>执行保留期清理</button>
                <button onClick={() => runRetention(true)}>清理并压缩 SQLite</button>
              </div>
            </div>
            <div className="table-panel">
              <h2>调度状态</h2>
              <div className="state-grid">
                <div><span>当前状态</span><strong>{scheduler?.enabled ? "运行中" : "已停止"}</strong></div>
                <div><span>下次运行</span><strong>{formatTime(scheduler?.nextRunAt ?? null)}</strong></div>
                <div><span>上次运行</span><strong>{formatTime(scheduler?.lastRunAt ?? null)}</strong></div>
                <div><span>连续失败</span><strong>{scheduler?.consecutiveFailures ?? 0}</strong></div>
              </div>
              {retentionResult ? (
                <div className="retention-result">
                  <h3>最近清理结果</h3>
                  <p>保留 {retentionResult.retentionDays} 天，删除检查 {retentionResult.deletedRuns} 次、明细 {retentionResult.deletedHostChecks} 条、孤儿明细 {retentionResult.deletedOrphanHostChecks} 条。</p>
                  <p>SQLite 当前大小：{Math.round(retentionResult.sizeBytes / 1024)} KB；压缩：{retentionResult.vacuumed ? "已执行" : "未执行"}。</p>
                </div>
              ) : (
                <p className="muted">尚未在本次界面会话执行清理。</p>
              )}
            </div>
          </section>
        )}

        {selectedTab === "actions" && (
          <section className="action-layout">
            <div className="action-menu">
              <button onClick={() => runDryAction("inspect-service")}><CheckCircle2 size={17} />生成检查命令</button>
              <button onClick={() => runDryAction("reload-nginx")}><RefreshCcw size={17} />生成 Nginx 重载计划</button>
              <button onClick={() => runDryAction("restart-compose-service")}><AlertTriangle size={17} />生成服务重启计划</button>
            </div>
            <div className="detail-panel">
              <h2>{dryRun?.title ?? "选择左侧操作，先生成计划"}</h2>
              {dryRun ? (
                <>
                  <p>风险等级：{dryRun.riskTier}</p>
                  {dryRun.blockedReason ? <div className="error-line"><AlertTriangle size={16} />{dryRun.blockedReason}</div> : null}
                  <h3>计划命令</h3>
                  <pre>{dryRun.commands.join("\n")}</pre>
                  <h3>验证步骤</h3>
                  <ul>{dryRun.verification.map((item) => <li key={item}>{item}</li>)}</ul>
                  <button className="disabled-action" disabled>这里只生成计划，不会执行</button>
                </>
              ) : (
                <p>这里不会直接连接服务器执行操作。先看命令和验证步骤，后续版本再接入二次确认。</p>
              )}
            </div>
          </section>
        )}

        {selectedTab === "reports" && (
          <section className="report-panel">
            <div className="report-head">
              <FileText />
              <div>
                <h2>当前文本报告</h2>
                <p>基于最近一次检查生成，适合复制给同事或后续排查任务。</p>
              </div>
            </div>
            <pre>{report}</pre>
          </section>
        )}

        {selectedTab === "agent" && (
          <section className="report-panel">
            <div className="report-head">
              <Bot />
              <div>
                <h2>给 Agent 调用的接口</h2>
                <p>高级用法：让本地自动化或 Codex 调这个工具读取状态。</p>
              </div>
            </div>
            <div className="api-grid">
              {[
                "GET /api/status",
                "POST /api/checks/light",
                "POST /api/checks/light/:hostId",
                "GET /api/scheduler",
                "PUT /api/scheduler",
                "POST /api/maintenance/retention",
                "POST /api/actions/dry-run",
                "GET /api/reports/current",
                "GET /api/agent/manifest",
                "GET /api/agent/status"
              ].map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
