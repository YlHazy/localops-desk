import { AlertTriangle, ArrowUpRight, Bell, BellOff, Check, ChevronDown, MessageCircle, RefreshCcw, Server } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { collectionModeCopy, hostEvidenceIsFresh, localRecoveryCopy, trustworthyDashboard } from "./desk-sync.mjs";
import { evidenceReadiness } from "./evidence-readiness.mjs";
import { hostGuidance } from "./guardian-guidance.mjs";
import { manualFocusSelection, prioritizeHosts, selectFocusHost } from "./host-priority.mjs";
import { monitorSignal, petSnapshotTrust, worseningNotice } from "./pet-monitor.mjs";
import type { MonitorSignal } from "./pet-monitor.mjs";
import { isPetSessionId, petPresencePath } from "./pet-presence.mjs";
import type { DashboardStatus, Status } from "./types";

const statusCopy: Record<Status, { label: string; line: string }> = {
  healthy: { label: "值守正常", line: "服务器都很安静，我继续替你盯着。" },
  warning: { label: "有事要看", line: "有一处信号不太对，最高优先级已排在列表顶部。" },
  critical: { label: "需要处理", line: "发现明确故障，最高优先级已排在列表顶部。" },
  unknown: { label: "等待检查", line: "还没有足够证据，先让我巡检一次。" }
};

const notificationPreferenceKey = "localops.pet.notifications";
const sentryOtterUrl = new URL("./assets/localops-sentry-otter.png", import.meta.url).href;

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

export function PetMode({
  dashboard,
  now,
  lastSyncedAt,
  loading,
  syncing,
  syncError,
  actionError,
  onRefresh,
  onRetrySync,
  onOpenDesk,
  onDiscuss
}: {
  dashboard: DashboardStatus;
  now: number;
  lastSyncedAt: number | null;
  loading: boolean;
  syncing: boolean;
  syncError: string;
  actionError: string;
  onRefresh: (hostId: string) => void;
  onRetrySync: () => void;
  onOpenDesk: () => void;
  onDiscuss: (hostId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const notificationsSupported = "Notification" in window;
  const notificationsBlocked = notificationsSupported && Notification.permission === "denied";
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => notificationsSupported
    && Notification.permission === "granted"
    && readNotificationPreference());
  const [notificationNote, setNotificationNote] = useState("");
  const previousSignal = useRef<MonitorSignal | null>(null);
  const recovery = localRecoveryCopy(lastSyncedAt, now);
  const petSessionId = new URLSearchParams(window.location.search).get("session");

  useEffect(() => {
    if (!isPetSessionId(petSessionId)) return;
    const path = petPresencePath(petSessionId);
    const sendPresence = (state: "open" | "closing", keepalive = false) => {
      void fetch(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
        keepalive,
        signal: keepalive ? undefined : AbortSignal.timeout(1_500)
      }).catch(() => undefined);
    };
    sendPresence("open");
    const timer = window.setInterval(() => sendPresence("open"), 15_000);
    const closePresence = () => sendPresence("closing", true);
    window.addEventListener("pagehide", closePresence);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", closePresence);
      closePresence();
    };
  }, [petSessionId]);

  const trustedDashboard = useMemo(() => trustworthyDashboard(dashboard, now), [dashboard, now]);
  const hosts = useMemo(() => prioritizeHosts(trustedDashboard.hosts), [trustedDashboard]);
  const priorityHost = hosts[0];
  const focusHost = selectFocusHost(hosts, selectedHostId);
  const priorityFresh = priorityHost ? hostEvidenceIsFresh(dashboard, priorityHost, now) : false;
  const focusFresh = focusHost ? hostEvidenceIsFresh(dashboard, focusHost, now) : false;
  const priorityGuidance = priorityHost ? hostGuidance(priorityHost, priorityFresh) : null;
  const focusGuidance = focusHost ? hostGuidance(focusHost, focusFresh) : null;
  const hasNonCurrentHost = dashboard.hosts.some((host) => !hostEvidenceIsFresh(dashboard, host, now));
  const manuallyFocused = Boolean(selectedHostId && focusHost?.id === selectedHostId && priorityHost?.id !== selectedHostId);
  const overallStatus: Status = syncError ? "unknown" : priorityHost?.status ?? "unknown";
  const copy = statusCopy[overallStatus];
  const snapshotTrust = petSnapshotTrust(Boolean(syncError), hasNonCurrentHost, Boolean(dashboard.observedAt));
  const collectionMode = collectionModeCopy(dashboard);
  const focusReadiness = evidenceReadiness(dashboard, focusHost);
  const visibleCopy = overallStatus === "healthy" && focusReadiness.state === "http"
    ? { label: "入口正常", line: "Health URL 当前可达；资源与管理通道还没有证据。" }
    : copy;
  const visibleCounts = trustedDashboard.counts;

  useEffect(() => {
    const current = monitorSignal(trustedDashboard, Boolean(syncError));
    if (notificationsEnabled && Notification.permission === "granted") {
      const notice = worseningNotice(previousSignal.current, current);
      if (notice) {
        const notification = showSystemNotification(notice.title, { body: notice.body, tag: "localops-status" });
        if (notification) notification.onclick = () => window.focus();
      }
    }
    previousSignal.current = current;
  }, [trustedDashboard, syncError, notificationsEnabled]);

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
      <section className="pet-identity" aria-label={`LocalOps 守护宠物：${visibleCopy.label}`}>
        <div className={`pet-character ${loading ? "is-listening" : ""}`} aria-hidden="true">
          <img src={sentryOtterUrl} alt="" />
          <span className="pet-signal pet-signal-one" />
          <span className="pet-signal pet-signal-two" />
        </div>
        <div className="pet-title">
          <span>LOCALOPS · 小哨值守中</span>
          <strong>{visibleCopy.label}</strong>
        </div>
      </section>

      <section className="pet-speech" aria-live="polite">
        {syncError ? <AlertTriangle size={17} /> : overallStatus === "healthy" ? <Check size={17} /> : <Server size={17} />}
        <p>{syncError
          ? "本地值守连接中断。服务器没有因此被检查或改动。"
          : dashboard.hosts.length === 0
            ? "尚未配置服务器，请先打开控制台添加一台。"
            : priorityHost && !priorityFresh
              ? "最高优先级对象的证据不是当前状态，先刷新这一台。"
              : priorityGuidance?.reason ?? visibleCopy.line}</p>
      </section>

      {syncError ? (
        <section className="pet-recovery" aria-label="本地状态恢复">
          <span>{recovery.label}</span>
          <small>{recovery.detail}</small>
          <em title={syncError}>原因：{syncError}</em>
          <p>{recovery.boundary}</p>
          <button onClick={onRetrySync} disabled={syncing}>
            <RefreshCcw className={syncing ? "spin" : ""} size={15} />
            {syncing ? "正在重连" : "只重连本地状态"}
          </button>
        </section>
      ) : null}

      {actionError ? (
        <section className="pet-action-error" role="alert">
          <AlertTriangle size={15} />
          <span><strong>巡检完成状态未确认</strong><small>{actionError}。上次证据保持不变；先等自动同步，不要连续点击。</small></span>
        </section>
      ) : null}

      {focusHost ? (
        <>
          <button className="pet-focus" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
            <span className={`pet-status-dot ${focusHost.status}`} />
            <span className="pet-focus-copy">
              <strong>{focusHost.name}{manuallyFocused ? <em>手动查看</em> : null}</strong>
              <small>{focusGuidance?.reason}</small>
            </span>
            <ChevronDown className={expanded ? "is-expanded" : ""} size={18} />
          </button>
          {manuallyFocused ? (
            <button className="pet-return-priority" onClick={() => setSelectedHostId(null)}>
              回到最高优先级 · {priorityHost.name}
            </button>
          ) : null}
        </>
      ) : null}

      {expanded ? (
        <section className="pet-hosts" aria-label="服务器状态列表">
          {hosts.map((host) => (
            <button
              className="pet-host-row"
              key={host.id}
              aria-current={host.id === focusHost?.id ? "true" : undefined}
              onClick={() => {
                setSelectedHostId(manualFocusSelection(hosts, host.id));
                setExpanded(false);
              }}
            >
              <span className={`pet-status-dot ${host.status}`} />
              <span><strong>{host.name}</strong><small>{host.environment} · {host.role}</small></span>
              <em>{statusCopy[host.status].label}</em>
            </button>
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
        <div className={`pet-evidence-gate ${focusReadiness.canCollect ? "ready" : "blocked"}`}>
          <strong>{focusReadiness.label}</strong>
          <small>{focusReadiness.detail}</small>
        </div>
        <button className="pet-refresh" onClick={() => focusHost && (focusReadiness.canCollect ? onRefresh(focusHost.id) : onOpenDesk())} disabled={loading || !focusHost}>
          {focusReadiness.canCollect ? <RefreshCcw className={loading ? "spin" : ""} size={17} /> : <ArrowUpRight size={17} />}
          {loading ? "巡检中" : focusReadiness.canCollect ? focusReadiness.actionLabel : "控制台补充证据"}
        </button>
        <button className="pet-discuss" title="只预填不含名称、地址或原始证据的最小披露摘要" onClick={() => focusHost && onDiscuss(focusHost.id)} disabled={!focusHost}>
          <MessageCircle size={16} /> 和 Codex 讨论
        </button>
        <button className="pet-open" onClick={onOpenDesk}>
          控制台 <ArrowUpRight size={16} />
        </button>
        <small>{latestTime(dashboard.observedAt)} 观测 · {snapshotTrust.label} · {dashboard.hosts.length === 0 ? "等待配置" : collectionMode.compact} · 自动同步不触发巡检</small>
      </footer>
    </main>
  );
}
