import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  History,
  Play,
  RefreshCcw,
  Server,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CheckRun, DashboardStatus, DryRunAction, HostState, Status } from "./types";

const statusLabels: Record<Status, string> = {
  healthy: "正常",
  warning: "关注",
  critical: "异常",
  unknown: "未知"
};

const statusOrder: Status[] = ["healthy", "warning", "critical", "unknown"];

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
        <span>HTTP {host.httpStatus}</span>
        <span>SSH {host.sshStatus}</span>
        <span>{host.dockerStatus}</span>
      </div>
    </button>
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

  async function load() {
    const [status, recent, currentReport] = await Promise.all([
      api<DashboardStatus>("/api/status"),
      api<{ checks: CheckRun[] }>("/api/checks"),
      api<{ report: string }>("/api/reports/current")
    ]);
    setDashboard(status);
    setChecks(recent.checks);
    setReport(currentReport.report);
    setSelectedHostId((prev) => prev ?? status.hosts[0]?.id ?? null);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const selectedHost = useMemo(
    () => dashboard?.hosts.find((host) => host.id === selectedHostId) ?? dashboard?.hosts[0] ?? null,
    [dashboard, selectedHostId]
  );

  async function runLightCheck() {
    setLoading(true);
    setError("");
    try {
      await api("/api/checks/light", { method: "POST", body: "{}" });
      await load();
      setSelectedTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "检查失败");
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
          <button className="primary" onClick={runLightCheck} disabled={loading}>
            {loading ? <RefreshCcw className="spin" size={18} /> : <Play size={18} />}
            <span>{loading ? "检查中" : "运行轻量检查"}</span>
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
          <section className="workspace">
            <div className="host-list">
              {dashboard.hosts.map((host) => (
                <HostPanel
                  key={host.id}
                  host={host}
                  selected={host.id === selectedHost.id}
                  onSelect={() => setSelectedHostId(host.id)}
                />
              ))}
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
                <MetricBar label="CPU" value={selectedHost.cpuPercent} />
                <MetricBar label="内存" value={selectedHost.memoryPercent} />
                <MetricBar label="磁盘" value={selectedHost.diskPercent} />
              </div>
              <div className="evidence">
                <h3>最近证据</h3>
                {selectedHost.evidence.map((item) => <p key={item}>{item}</p>)}
              </div>
              <div className="quick-actions">
                <button onClick={() => runDryAction("inspect-service")}>只读诊断 dry-run</button>
                <button onClick={() => runDryAction("reload-nginx")}>Reload Nginx dry-run</button>
                <button onClick={() => runDryAction("restart-compose-service")}>滚动重启 dry-run</button>
              </div>
            </div>
          </section>
        )}

        {selectedTab === "hosts" && (
          <section className="table-panel">
            <h2>服务器配置</h2>
            <table>
              <thead><tr><th>名称</th><th>环境</th><th>SSH</th><th>健康检查</th><th>Compose</th><th>状态</th></tr></thead>
              <tbody>
                {dashboard.hosts.map((host) => (
                  <tr key={host.id}>
                    <td>{host.name}</td>
                    <td>{host.environment}</td>
                    <td>{host.sshAlias}</td>
                    <td>{host.healthUrl}</td>
                    <td>{host.composeProject}</td>
                    <td><StatusPill status={host.status} /></td>
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
              <thead><tr><th>ID</th><th>类型</th><th>开始</th><th>耗时</th><th>状态</th><th>摘要</th></tr></thead>
              <tbody>
                {checks.map((check) => (
                  <tr key={check.id}>
                    <td>#{check.id}</td>
                    <td>{check.kind}</td>
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
              {["GET /api/status", "POST /api/checks/light", "POST /api/actions/dry-run", "GET /api/reports/current", "GET /api/agent/manifest"].map((item) => (
                <code key={item}>{item}</code>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

