import { AlertTriangle, ArrowUpRight, Bell, BellOff, Check, ChevronDown, MessageCircle, RefreshCcw, Server } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { monitorSignal, worseningNotice } from "./pet-monitor.mjs";
import type { MonitorSignal } from "./pet-monitor.mjs";
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

const notificationPreferenceKey = "localops.pet.notifications";

function readNotificationPreference() {
  try {
    return window.localStorage.getItem(notificationPreferenceKey) === "1";
  } catch {
    return false;
  }
}

function writeNotificationPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(notificationPreferenceKey, enabled ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

function showSystemNotification(title: string, options: NotificationOptions) {
  try {
    return new Notification(title, options);
  } catch {
    return null;
  }
}

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
  onOpenDesk,
  onDiscuss
}: {
  dashboard: DashboardStatus;
  loading: boolean;
  error: string;
  onRefresh: (hostId: string) => void;
  onOpenDesk: () => void;
  onDiscuss: (hostId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const notificationsSupported = "Notification" in window;
  const notificationsBlocked = notificationsSupported && Notification.permission === "denied";
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => notificationsSupported
    && Notification.permission === "granted"
    && readNotificationPreference());
  const [notificationNote, setNotificationNote] = useState("");
  const previousSignal = useRef<MonitorSignal | null>(null);
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

  useEffect(() => {
    const current = monitorSignal(dashboard, Boolean(error));
    if (notificationsEnabled && Notification.permission === "granted") {
      const notice = worseningNotice(previousSignal.current, current);
      if (notice) {
        const notification = showSystemNotification(notice.title, { body: notice.body, tag: "localops-status" });
        if (notification) notification.onclick = () => window.focus();
      }
    }
    previousSignal.current = current;
  }, [dashboard, error, notificationsEnabled]);

  async function toggleNotifications() {
    if (!notificationsSupported) {
      setNotificationNote("当前窗口不支持系统提醒，状态仍会每 30 秒自动同步。");
      return;
    }
    if (notificationsEnabled) {
      writeNotificationPreference(false);
      setNotificationsEnabled(false);
      setNotificationNote("异常提醒已关闭，自动同步仍在继续。");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      writeNotificationPreference(false);
      setNotificationNote("系统没有允许提醒。可在 Edge 的站点权限中重新开启。");
      return;
    }
    const preferenceSaved = writeNotificationPreference(true);
    setNotificationsEnabled(true);
    setNotificationNote(preferenceSaved
      ? "异常提醒已开启；只显示数量，不显示服务器地址或命令。"
      : "本次已开启提醒，但浏览器不允许保存偏好；下次打开需重新开启。");
    showSystemNotification("LocalOps 已开始值守", {
      body: "状态恶化时会提醒你；通知不包含地址、命令或检查证据。",
      tag: "localops-notifications-ready"
    });
  }

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

      <section className="pet-watch" aria-live="polite">
        <button onClick={toggleNotifications} aria-pressed={notificationsEnabled}>
          {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          <span><strong>{notificationsEnabled
            ? "异常提醒已开"
            : !notificationsSupported
              ? "当前窗口不支持提醒"
              : notificationsBlocked
                ? "系统提醒已阻止"
                : "开启异常提醒"}</strong><small>30 秒自动同步 · 只显示状态数量</small></span>
        </button>
        {notificationNote ? <p>{notificationNote}</p> : null}
      </section>

      <footer className="pet-actions">
        <button className="pet-refresh" onClick={() => focusHost && onRefresh(focusHost.id)} disabled={loading || !focusHost}>
          <RefreshCcw className={loading ? "spin" : ""} size={17} />
          {loading ? "巡检中" : "立即巡检"}
        </button>
        <button className="pet-discuss" onClick={() => focusHost && onDiscuss(focusHost.id)} disabled={!focusHost}>
          <MessageCircle size={16} /> 和 Codex 讨论
        </button>
        <button className="pet-open" onClick={onOpenDesk}>
          控制台 <ArrowUpRight size={16} />
        </button>
        <small>{latestTime(dashboard.observedAt)} 观测 · {dashboard.hosts.length === 0 ? "等待配置" : stale ? "证据已过期" : dashboard.mode === "ssh-enabled" ? "只读 SSH" : "安全模拟"} · 自动同步不触发巡检</small>
      </footer>
    </main>
  );
}
