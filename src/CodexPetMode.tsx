import { ArrowUpRight, Check, Copy, Eye, Minus, Plus, RefreshCcw, ShieldCheck, TerminalSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hostEvidenceIsFresh, trustworthyDashboard } from "./desk-sync.mjs";
import { prioritizeHosts } from "./host-priority.mjs";
import { monitorSignal } from "./pet-monitor.mjs";
import type { MonitorSignal } from "./pet-monitor.mjs";
import type { PetDeskTab } from "./pet-navigation.mjs";
import { notificationDecision, readNotificationPreference, readQuietUntil } from "./pet-watch.mjs";
import type { DashboardStatus, DryRunAction, HostState, Status } from "./types";

const sentryOtterUrl = new URL("./assets/localops-sentry-otter-2d.png", import.meta.url).href;

type Surface = "pet" | "panel";

type Props = {
  surface: Surface;
  dashboard: DashboardStatus;
  now: number;
  loading: boolean;
  syncing: boolean;
  syncError: string;
  actionError: string;
  onRefresh: (hostId?: string) => void | Promise<void>;
  onRetrySync: () => void | Promise<void>;
  onOpenDesk: (hostId?: string, tab?: PetDeskTab, source?: "pet" | "pet-alert") => void | Promise<void>;
};

const statusLabel: Record<Status, string> = {
  healthy: "平稳",
  warning: "关注",
  critical: "故障",
  unknown: "待确认"
};

function metric(value: number | null, suffix = "") {
  return value == null ? "—" : `${value}${suffix}`;
}

function dockerMetric(host: HostState) {
  if (host.containerCount == null) return "—";
  const unhealthy = host.unhealthyContainerCount ?? 0;
  return unhealthy > 0 ? `${unhealthy} 异常` : `${host.containerCount} 正常`;
}

function checkedTime(value: string | null) {
  if (!value) return "未检查";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function loadInspectionPlan(hostId: string) {
  const response = await fetch("/api/actions/dry-run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId, actionKey: "inspect-service" })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || "暂时无法生成检查命令");
  return payload as DryRunAction;
}

function notifyDesktop(current: MonitorSignal) {
  return window.localOpsDesktop?.showNotification({
    kind: "status",
    critical: current.critical,
    warning: current.warning,
    unknown: current.unknown
  });
}

export function CodexPetMode({ surface, dashboard, now, loading, syncing, syncError, actionError, onRefresh, onRetrySync, onOpenDesk }: Props) {
  const trusted = useMemo(() => trustworthyDashboard(dashboard, now), [dashboard, now]);
  const hosts = useMemo(() => prioritizeHosts(trusted.hosts), [trusted]);
  const priorityHost = hosts[0] ?? null;
  const overall: Status = syncError ? "unknown" : priorityHost?.status ?? "unknown";
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? priorityHost;
  const [plan, setPlan] = useState<DryRunAction | null>(null);
  const [planError, setPlanError] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [planCopied, setPlanCopied] = useState(false);
  const previousSignal = useRef<MonitorSignal | null>(null);

  useEffect(() => {
    if (surface !== "pet") return;
    const current = monitorSignal(trusted, Boolean(syncError));
    const decision = notificationDecision(previousSignal.current, current, {
      enabled: readNotificationPreference(window.localStorage),
      permission: window.localOpsDesktop ? "granted" : "default",
      quietUntil: readQuietUntil(window.localStorage, now),
      now
    });
    if (decision.outcome === "sent") void notifyDesktop(current);
    previousSignal.current = current;
  }, [surface, trusted, syncError, now]);

  useEffect(() => {
    setPlan(null);
    setPlanError("");
    setPlanCopied(false);
  }, [selectedHost?.id]);

  useEffect(() => {
    if (surface !== "panel") return;
    void window.localOpsDesktop?.setCodexPanelDetail(Boolean(plan || planError));
    return () => { void window.localOpsDesktop?.setCodexPanelDetail(false); };
  }, [surface, plan, planError]);

  function enterCompanion() {
    void window.localOpsDesktop?.setCodexCompanionHover(true);
  }

  function leaveCompanion() {
    void window.localOpsDesktop?.setCodexCompanionHover(false);
  }

  async function showCommands() {
    if (!selectedHost || planLoading) return;
    if (plan) {
      setPlan(null);
      setPlanCopied(false);
      return;
    }
    setPlanLoading(true);
    setPlanError("");
    try {
      setPlan(await loadInspectionPlan(selectedHost.id));
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "暂时无法生成检查命令");
    } finally {
      setPlanLoading(false);
    }
  }

  async function copyPlanCommands() {
    if (!plan?.copyAllowed) return;
    try {
      await navigator.clipboard.writeText(plan.commands.join("\n"));
      setPlanCopied(true);
      window.setTimeout(() => setPlanCopied(false), 1800);
    } catch {
      setPlanError("复制失败，请在大屏操作页复制");
    }
  }

  if (surface === "pet") {
    const affected = (trusted.counts.critical ?? 0) + (trusted.counts.warning ?? 0) + (trusted.counts.unknown ?? 0);
    const line = syncError
      ? "本地监控断开"
      : priorityHost == null
        ? "还没有服务器"
        : overall === "healthy"
          ? `${trusted.counts.healthy ?? 0} 台平稳`
          : `${affected} 台要看`;
    return (
      <main className={`codex-pet ${overall}`} onMouseEnter={enterCompanion} onMouseLeave={leaveCompanion} aria-label={`LocalOps Codex 宠物：${line}`}>
        <div className="codex-pet-hit" title="拖动我移动位置">
          <img src={sentryOtterUrl} alt="" />
          <span className={`codex-pet-beacon ${overall}`} aria-hidden="true" />
        </div>
        <div className="codex-pet-readout" aria-live="polite">
          <strong>{line}</strong>
          <span>{priorityHost ? `${priorityHost.name} · ${checkedTime(priorityHost.lastCheckedAt)}` : "悬停查看"}</span>
        </div>
        <div className="codex-pet-scale" role="group" aria-label="调整桌宠大小">
          <button type="button" onClick={() => void window.localOpsDesktop?.resizeCodexPet(-1)} title="缩小桌宠" aria-label="缩小桌宠"><Minus size={16} /></button>
          <button type="button" onClick={() => void window.localOpsDesktop?.resizeCodexPet(1)} title="放大桌宠" aria-label="放大桌宠"><Plus size={16} /></button>
        </div>
        <button className="codex-pet-close" onClick={() => void window.localOpsDesktop?.hideCodexPet()} title="收进系统托盘" aria-label="收进系统托盘"><X size={14} /></button>
      </main>
    );
  }

  return (
    <main className={`codex-companion ${overall} ${plan || planError ? "command-open" : ""}`} onMouseEnter={enterCompanion} onMouseLeave={leaveCompanion}>
      <header className="codex-companion-head">
        <div><span className={`codex-panel-dot ${overall}`} /><strong>服务器值守</strong></div>
        <span>{syncError ? "连接中断" : `${hosts.length} 台 · ${statusLabel[overall]}`}</span>
      </header>

      {plan || planError ? <section className="codex-command-preview" aria-live="polite">
        {plan ? <>
          <header className="codex-command-head">
            <div><TerminalSquare size={15} /><strong>只读检查命令</strong></div>
            <span className="codex-risk-readonly"><ShieldCheck size={12} />不执行</span>
          </header>
          <p className="codex-command-purpose">用于查看 <strong>{plan.target.name}</strong> 的进程、资源与容器状态，不会修改服务器。</p>
          <div className="codex-command-list" aria-label="命令列表">
            {plan.commands.map((command, index) => <div className="codex-command-row" key={`${index}-${command}`}>
              <span>{index + 1}</span><code>{command}</code>
            </div>)}
          </div>
          <div className="codex-command-foot">
            <small>{plan.safetyBoundary}</small>
            <button type="button" onClick={() => void copyPlanCommands()} disabled={!plan.copyAllowed}>{planCopied ? <Check size={13} /> : <Copy size={13} />}{planCopied ? "已复制" : "复制全部"}</button>
          </div>
        </> : <div className="codex-command-failure"><strong>命令没有生成</strong><span>{planError}</span></div>}
      </section> : <section className="codex-host-strip" aria-label="重点服务器">
        {hosts.length === 0 ? <div className="codex-empty">添加服务器后，最需要关注的状态会出现在这里。</div> : hosts.slice(0, 2).map((host) => {
          const fresh = hostEvidenceIsFresh(dashboard, host, now) && !syncError;
          const selected = host.id === selectedHost?.id;
          return <button key={host.id} className={`codex-host-line ${host.status} ${selected ? "selected" : ""}`} onClick={() => setSelectedHostId(host.id)}>
            <span className="codex-host-name"><i className={`codex-panel-dot ${fresh ? host.status : "unknown"}`} /><strong>{host.name}</strong><small>{fresh ? statusLabel[host.status] : "已过期"}</small></span>
            <span className="codex-metrics">
              <span><small>CPU</small><b>{fresh ? metric(host.cpuPercent, "%") : "—"}</b></span>
              <span><small>内存</small><b>{fresh ? metric(host.memoryPercent, "%") : "—"}</b></span>
              <span><small>磁盘</small><b>{fresh ? metric(host.diskPercent, "%") : "—"}</b></span>
              <span><small>负载</small><b>{fresh && host.load1 != null ? host.load1.toFixed(2) : "—"}</b></span>
              <span><small>容器</small><b>{fresh ? dockerMetric(host) : "—"}</b></span>
            </span>
          </button>;
        })}
      </section>}

      <footer className="codex-companion-actions">
        <button onClick={() => syncError ? onRetrySync() : onRefresh(selectedHost?.id)} disabled={loading || syncing || !selectedHost}><RefreshCcw className={loading || syncing ? "spin" : ""} size={15} />{loading ? "检查中" : "立即检查"}</button>
        <button onClick={() => void showCommands()} disabled={!selectedHost || planLoading}><Eye size={15} />{planLoading ? "准备中" : plan ? "收起命令" : "查看命令"}</button>
        <button className="primary" onClick={() => onOpenDesk(selectedHost?.id, plan ? "actions" : "overview", overall === "warning" || overall === "critical" ? "pet-alert" : "pet")} disabled={!selectedHost}><ArrowUpRight size={15} />{plan ? "大屏查看" : "展开处理"}</button>
      </footer>
      {actionError ? <p className="codex-panel-error" role="alert">{actionError}</p> : null}
    </main>
  );
}
