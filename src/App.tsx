import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Globe2,
  FileText,
  History,
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
import type { CheckRun, DashboardStatus, DryRunAction, HostConfigInput, HostState, RetentionResult, SchedulerState, Status } from "./types";

const statusLabels: Record<Status, string> = {
  healthy: "正常",
  warning: "关注",
  critical: "异常",
  unknown: "未知"
};

const statusOrder: Status[] = ["healthy", "warning", "critical", "unknown"];

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
        <span>HTTP {host.httpStatus}{host.httpLatencyMs == null ? "" : ` · ${host.httpLatencyMs}ms`}</span>
        <span>SSH {host.sshStatus}</span>
        <span>{host.dockerStatus}</span>
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

  async function load() {
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

  const selectedHost = useMemo(
    () => dashboard?.hosts.find((host) => host.id === selectedHostId) ?? dashboard?.hosts[0] ?? null,
    [dashboard, selectedHostId]
  );

  const incidentHosts = useMemo(() => dashboard?.hosts.filter((host) => host.status !== "healthy") ?? [], [dashboard]);

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

  if (!dashboard || !selectedHost) {
    return (
      <main className="boot">
        <Activity className="spin" />
        <span>正在连接本地 LocalOps API...</span>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} /></div>
          <div>
            <strong>LocalOps Desk</strong>
            <span>本地个人运维驾驶舱</span>
          </div>
        </div>
        <nav>
          {[
            ["overview", Activity, "总览"],
            ["hosts", Server, "服务器"],
            ["checks", History, "检查历史"],
            ["scheduler", Clock3, "巡检"],
            ["actions", TerminalSquare, "动作面板"],
            ["reports", FileText, "诊断报告"],
            ["agent", Bot, "Agent API"]
          ].map(([key, Icon, label]) => (
            <button key={key as string} className={selectedTab === key ? "active" : ""} onClick={() => setSelectedTab(key as string)}>
              <Icon size={18} />
              <span>{label as string}</span>
            </button>
          ))}
        </nav>
        <div className="mode-box">
          <span>采集模式</span>
          <strong>{dashboard.mode === "ssh-enabled" ? "SSH 已启用" : "安全模拟"}</strong>
          <small>真实 SSH 默认关闭，避免误触生产。</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>服务器运行状态</h1>
            <p>上次刷新：{formatTime(dashboard.generatedAt)}，所有动作默认先 dry-run。</p>
          </div>
          <button className="primary" onClick={() => runLightCheck()} disabled={loading}>
            {loading ? <RefreshCcw className="spin" size={18} /> : <Play size={18} />}
            <span>{loading ? "检查中" : "运行轻量检查"}</span>
          </button>
          <button className="secondary" onClick={startCreateHost}>
            <Plus size={18} />
            <span>添加主机</span>
          </button>
        </header>

        {error ? <div className="error-line"><AlertTriangle size={16} />{error}</div> : null}

        <section className="status-strip">
          {statusOrder.map((status) => (
            <div className={`status-tile ${status}`} key={status}>
              <span>{statusLabels[status]}</span>
              <strong>{dashboard.counts[status] ?? 0}</strong>
            </div>
          ))}
        </section>

        {selectedTab === "overview" && (
          <section className="dashboard-grid">
            <EnvironmentRail hosts={dashboard.hosts} selectedId={selectedHost.id} onSelect={setSelectedHostId} />
            <div className="incident-panel">
              <h3>当前事件</h3>
              {incidentHosts.length ? (
                incidentHosts.map((host) => (
                  <button key={host.id} onClick={() => setSelectedHostId(host.id)}>
                    <StatusPill status={host.status} />
                    <span>{host.name}</span>
                    <small>{host.summary}</small>
                  </button>
                ))
              ) : (
                <p>暂无需要处理的事件。</p>
              )}
            </div>
            <div className="detail-panel">
              <div className="detail-head">
                <div>
                  <h2>{selectedHost.name}</h2>
                  <p>{selectedHost.environment} / {selectedHost.role} / {selectedHost.composeProject}</p>
                </div>
                <StatusPill status={selectedHost.status} />
              </div>
              <div className="metrics-grid">
                <div className="metric">
                  <div className="metric-head"><span>HTTP</span><strong>{selectedHost.httpLatencyMs == null ? "N/A" : `${selectedHost.httpLatencyMs}ms`}</strong></div>
                  <p className="metric-note">{selectedHost.httpStatus}</p>
                </div>
                <MetricBar label="CPU" value={selectedHost.cpuPercent} />
                <MetricBar label="内存" value={selectedHost.memoryPercent} />
                <MetricBar label="磁盘" value={selectedHost.diskPercent} />
              </div>
              <div className="evidence">
                <h3>最近证据</h3>
                {selectedHost.evidence.map((item) => <p key={item}>{item}</p>)}
              </div>
              <div className="quick-actions">
                <button onClick={() => runLightCheck(selectedHost.id)}><RefreshCcw size={16} />刷新此主机</button>
                <button onClick={() => runDryAction("inspect-service")}>只读诊断 dry-run</button>
                <button onClick={() => runDryAction("reload-nginx")}>Reload Nginx dry-run</button>
                <button onClick={() => runDryAction("restart-compose-service")}>滚动重启 dry-run</button>
              </div>
            </div>
            <div className="host-list matrix-panel">
              <h3>主机矩阵</h3>
              {dashboard.hosts.map((host) => (
                <HostPanel
                  key={host.id}
                  host={host}
                  selected={host.id === selectedHost.id}
                  onSelect={() => setSelectedHostId(host.id)}
                />
              ))}
            </div>
            <div className="report-preview">
              <h3>诊断报告预览</h3>
              <pre>{report}</pre>
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
              <button onClick={() => runDryAction("inspect-service")}><CheckCircle2 size={17} />只读诊断</button>
              <button onClick={() => runDryAction("reload-nginx")}><RefreshCcw size={17} />Reload Nginx</button>
              <button onClick={() => runDryAction("restart-compose-service")}><AlertTriangle size={17} />重启 Compose 服务</button>
            </div>
            <div className="detail-panel">
              <h2>{dryRun?.title ?? "选择一个动作生成 dry-run 计划"}</h2>
              {dryRun ? (
                <>
                  <p>风险等级：{dryRun.riskTier}</p>
                  {dryRun.blockedReason ? <div className="error-line"><AlertTriangle size={16} />{dryRun.blockedReason}</div> : null}
                  <h3>计划命令</h3>
                  <pre>{dryRun.commands.join("\n")}</pre>
                  <h3>验证步骤</h3>
                  <ul>{dryRun.verification.map((item) => <li key={item}>{item}</li>)}</ul>
                  <button className="disabled-action" disabled>真实执行在 MVP 中禁用</button>
                </>
              ) : (
                <p>这里不会直接执行远端命令。先生成计划，再由后续版本接入二次确认和审计。</p>
              )}
            </div>
          </section>
        )}

        {selectedTab === "reports" && (
          <section className="report-panel">
            <div className="report-head">
              <FileText />
              <div>
                <h2>当前诊断报告</h2>
                <p>基于最近一次检查结果生成，适合复制给运维 agent 或人工交接。</p>
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
                <h2>本地 Agent API</h2>
                <p>给 Codex 运维小队使用的最小接口面。</p>
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
