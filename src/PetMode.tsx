import { AlertTriangle, ArrowUpRight, Check, ChevronDown, RefreshCcw, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DashboardStatus, HostState, Status } from "./types";

const statusCopy: Record<Status, { label: string; line: string }> = {
  healthy: { label: "值守正常", line: "服务器都很安静，我继续替你盯着。" },
  warning: { label: "有事要看", line: "有一处信号不太对，点开就能看懂。" },
  critical: { label: "需要处理", line: "发现明确故障，先处理最上面这一台。" },
  unknown: { label: "等待检查", line: "还没有足够证据，先让我巡检一次。" }
};

const statusRank: Record<Status, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  healthy: 3
};

function latestTime(value: string | null) {
  if (!value) return "尚未巡检";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function hostSignal(host: HostState) {
  if (host.status === "critical") return host.summary || "服务检查失败";
  if (host.status === "warning") return host.summary || "存在需要确认的信号";
  if (host.status === "unknown") return "还没有运行过检查";
  return "HTTP、SSH 与资源信号正常";
}

export function PetMode({
  dashboard,
  loading,
  error,
  onRefresh,
  onOpenDesk
}: {
  dashboard: DashboardStatus;
  loading: boolean;
  error: string;
  onRefresh: (hostId: string) => void;
  onOpenDesk: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const observedAt = dashboard.observedAt ? new Date(dashboard.observedAt).getTime() : Number.NaN;
  const stale = !Number.isFinite(observedAt) || now - observedAt > dashboard.staleAfterMs;
  const hosts = useMemo(
    () => dashboard.hosts
      .map((host) => stale ? { ...host, status: "unknown" as const } : host)
      .sort((left, right) => statusRank[left.status] - statusRank[right.status] || left.name.localeCompare(right.name)),
    [dashboard.hosts, stale]
  );
  const focusHost = hosts[0];
  const overallStatus: Status = error ? "unknown" : focusHost?.status ?? "unknown";
  const copy = statusCopy[overallStatus];
  const visibleCounts = stale
    ? { healthy: 0, warning: 0, critical: 0, unknown: hosts.length }
    : dashboard.counts;

  return (
    <main className={`pet-window ${overallStatus}`}>
      <div className="pet-grab" aria-hidden="true" />
      <section className="pet-identity" aria-label={`LocalOps 守护宠物：${copy.label}`}>
        <div className={`pet-character ${loading ? "is-listening" : ""}`} aria-hidden="true">
          <span className="pet-ear pet-ear-left" />
          <span className="pet-ear pet-ear-right" />
          <span className="pet-eye pet-eye-left" />
          <span className="pet-eye pet-eye-right" />
          <span className="pet-mouth" />
          <span className="pet-signal pet-signal-one" />
          <span className="pet-signal pet-signal-two" />
        </div>
        <div className="pet-title">
          <span>LOCALOPS · 值守中</span>
          <strong>{copy.label}</strong>
        </div>
      </section>

      <section className="pet-speech" aria-live="polite">
        {error ? <AlertTriangle size={17} /> : overallStatus === "healthy" ? <Check size={17} /> : <Server size={17} />}
        <p>{error
          ? `本地监控没有响应：${error}`
          : dashboard.hosts.length === 0
            ? "尚未配置服务器，请先打开控制台添加一台。"
            : stale
              ? "检查结果已过期，先刷新最需要关注的一台。"
              : copy.line}</p>
      </section>

      {focusHost ? (
        <button className="pet-focus" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          <span className={`pet-status-dot ${focusHost.status}`} />
          <span className="pet-focus-copy">
            <strong>{focusHost.name}</strong>
            <small>{hostSignal(focusHost)}</small>
          </span>
          <ChevronDown className={expanded ? "is-expanded" : ""} size={18} />
        </button>
      ) : null}

      {expanded ? (
        <section className="pet-hosts" aria-label="服务器状态列表">
          {hosts.map((host) => (
            <div className="pet-host-row" key={host.id}>
              <span className={`pet-status-dot ${host.status}`} />
              <span><strong>{host.name}</strong><small>{host.environment} · {host.role}</small></span>
              <em>{statusCopy[host.status].label}</em>
            </div>
          ))}
        </section>
      ) : null}

      <section className="pet-stats" aria-label="状态统计">
        <span><strong>{visibleCounts.critical ?? 0}</strong>故障</span>
        <span><strong>{visibleCounts.warning ?? 0}</strong>关注</span>
        <span><strong>{visibleCounts.healthy ?? 0}</strong>正常</span>
      </section>

      <footer className="pet-actions">
        <button className="pet-refresh" onClick={() => focusHost && onRefresh(focusHost.id)} disabled={loading || !focusHost}>
          <RefreshCcw className={loading ? "spin" : ""} size={17} />
          {loading ? "巡检中" : "立即巡检"}
        </button>
        <button className="pet-open" onClick={onOpenDesk}>
          查看控制台 <ArrowUpRight size={16} />
        </button>
        <small>{latestTime(dashboard.observedAt)} 观测 · {dashboard.hosts.length === 0 ? "等待配置" : stale ? "证据已过期" : dashboard.mode === "ssh-enabled" ? "只读 SSH" : "安全模拟"}</small>
      </footer>
    </main>
  );
}
