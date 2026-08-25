import { AlertTriangle, ArrowUpRight, Bell, BellOff, Check, ChevronDown, Clock3, MessageCircle, Pin, PinOff, RefreshCcw, Server, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hostEvidenceIsFresh, localRecoveryCopy, trustworthyDashboard } from "./desk-sync.mjs";
import { evidenceReadiness } from "./evidence-readiness.mjs";
import { hostGuidance } from "./guardian-guidance.mjs";
import { manualFocusSelection, prioritizeHosts, selectFocusHost } from "./host-priority.mjs";
import { petLifecycleCopy, petRuntimeMode } from "./pet-lifecycle.mjs";
import { monitorSignal, petSnapshotTrust } from "./pet-monitor.mjs";
import type { MonitorSignal } from "./pet-monitor.mjs";
import type { PetDeskTab } from "./pet-navigation.mjs";
import { isPetSessionId, petPresencePath } from "./pet-presence.mjs";
import { notificationDecision, petQuietDurationMs, readNotificationCalibration, readNotificationPreference, readQuietUntil, watchModeCopy, writeNotificationCalibration, writeNotificationPreference, writeQuietUntil } from "./pet-watch.mjs";
import { readTopmostPreference, requestPetWindowTopmost, writeTopmostPreference } from "./pet-window.mjs";
import type { DashboardStatus, HostState, Status } from "./types";
import { collectionCoverage } from "../shared/collection-coverage.mjs";

const statusCopy: Record<Status, { label: string; line: string }> = {
  healthy: { label: "值守正常", line: "服务器都很安静，我继续替你盯着。" },
  warning: { label: "有事要看", line: "有一处信号不太对，最高优先级已排在列表顶部。" },
  critical: { label: "需要处理", line: "发现明确故障，最高优先级已排在列表顶部。" },
  unknown: { label: "等待检查", line: "还没有足够证据，先让我巡检一次。" }
};

const sentryOtterUrl = new URL("./assets/localops-sentry-otter.png", import.meta.url).href;

type AlertReceipt = {
  outcome: "sent" | "suppressed" | "failed";
  title: string;
  body: string;
  at: number;
};

type DesktopNotificationRequest = { kind: "ready" | "test" } | { kind: "status"; critical: number; warning: number; unknown: number };

type NotificationDelivery = {
  accepted: boolean;
  message: string;
  browserNotification?: Notification;
};

function readQuietPreference() {
  try {
    return readQuietUntil(window.localStorage);
  } catch {
    return 0;
  }
}

function writeQuietPreference(value: number) {
  try {
    return writeQuietUntil(window.localStorage, value);
  } catch {
    return false;
  }
}

function readPinnedPreference() {
  try {
    return readTopmostPreference(window.localStorage);
  } catch {
    return true;
  }
}

function writePinnedPreference(enabled: boolean) {
  try {
    return writeTopmostPreference(window.localStorage, enabled);
  } catch {
    return false;
  }
}

async function deliverSystemNotification(title: string, options: NotificationOptions, desktopRequest: DesktopNotificationRequest): Promise<NotificationDelivery> {
  if (window.localOpsDesktop) {
    try {
      return await window.localOpsDesktop.showNotification(desktopRequest);
    } catch {
      return { accepted: false, message: "Windows 托盘提醒没有响应；状态仍保留在小哨里。" };
    }
  }
  try {
    const browserNotification = new Notification(title, options);
    return { accepted: true, message: "已交给浏览器系统提醒；系统勿扰模式可能延后显示。", browserNotification };
  } catch {
    return { accepted: false, message: "浏览器提醒没有成功发出；状态仍保留在小哨里。" };
  }
}

function latestTime(value: string | null) {
  if (!value) return "尚未巡检";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function petIssueLine(host: HostState | null, fresh: boolean, guidanceReason = "") {
  if (!host || !fresh) return "数据有点旧，重新检查后再判断。";
  const http = host.httpStatus.toLowerCase();
  const ssh = host.sshStatus.toLowerCase();
  const docker = host.dockerStatus.toLowerCase();
  if (/down|fail|timeout|refused|unreachable|error/.test(http)) return "网页或 API 现在无法正常访问。";
  if (/fail|timeout|refused|unreachable|error/.test(ssh)) return "管理通道现在无法连接。";
  if (/down|fail|unhealthy|exited|error/.test(docker)) return "有服务没有正常运行。";
  if (/资源占用/.test(guidanceReason)) {
    return (host.diskPercent ?? 0) >= (host.memoryPercent ?? 0)
      ? `磁盘 ${host.diskPercent ?? "—"}%，需要留意。`
      : `内存 ${host.memoryPercent ?? "—"}%，需要留意。`;
  }
  return "有一项状态需要确认。";
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
  onRefresh: (hostId?: string) => void;
  onRetrySync: () => void;
  onOpenDesk: (hostId?: string, tab?: PetDeskTab, source?: "pet" | "pet-alert") => void | Promise<void>;
  onDiscuss: (hostId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const desktopNotifications = Boolean(window.localOpsDesktop);
  const notificationsSupported = desktopNotifications || "Notification" in window;
  const notificationsBlocked = !desktopNotifications && notificationsSupported && Notification.permission === "denied";
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => notificationsSupported
    && (desktopNotifications || Notification.permission === "granted")
    && readNotificationPreference(window.localStorage));
  const [notificationCalibrated, setNotificationCalibrated] = useState(() => readNotificationCalibration(window.localStorage));
  const [notificationCalibrationPending, setNotificationCalibrationPending] = useState(false);
  const [notificationNote, setNotificationNote] = useState("");
  const [notificationTesting, setNotificationTesting] = useState(false);
  const [quietUntil, setQuietUntil] = useState(readQuietPreference);
  const [alertReceipt, setAlertReceipt] = useState<AlertReceipt | null>(null);
  const previousSignal = useRef<MonitorSignal | null>(null);
  const recovery = localRecoveryCopy(lastSyncedAt, now);
  const petSessionId = new URLSearchParams(window.location.search).get("session");
  const lifecycle = petLifecycleCopy(petRuntimeMode(window.location.search));
  const topmostSupported = isPetSessionId(petSessionId);
  const [topmostActive, setTopmostActive] = useState(false);
  const [topmostPending, setTopmostPending] = useState(false);
  const [topmostNote, setTopmostNote] = useState(topmostSupported ? "正在确认桌面置顶状态。" : "从 Windows 启动器打开后可使用桌面置顶。");

  useEffect(() => {
    const refreshNotificationState = () => {
      setNotificationsEnabled(notificationsSupported
        && (desktopNotifications || Notification.permission === "granted")
        && readNotificationPreference(window.localStorage));
      setNotificationCalibrated(readNotificationCalibration(window.localStorage));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key == null || event.key === "localops.pet.notifications" || event.key === "localops.pet.notifications-calibrated") refreshNotificationState();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshNotificationState);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshNotificationState);
    };
  }, [desktopNotifications, notificationsSupported]);

  const applyTopmost = useCallback(async (enabled: boolean, persistPreference = true) => {
    if (!isPetSessionId(petSessionId)) return;
    setTopmostPending(true);
    try {
      const state = await requestPetWindowTopmost(petSessionId, enabled);
      setTopmostActive(state.topmost);
      setTopmostNote(state.message);
      if (persistPreference) {
        const saved = writePinnedPreference(enabled);
        if (!saved) setTopmostNote(`${state.message} 浏览器没有保存下次偏好。`);
      }
    } catch (error) {
      setTopmostActive(false);
      setTopmostNote(`${error instanceof Error ? error.message : "桌宠窗口置顶没有成功。"} 当前仍是普通窗口。`);
    } finally {
      setTopmostPending(false);
    }
  }, [petSessionId]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "LocalOps Guardian";
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    if (!isPetSessionId(petSessionId)) return;
    const path = petPresencePath(petSessionId);
    const sendPresence = (state: "open" | "closing", keepalive = false) => {
      return fetch(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
        keepalive,
        signal: keepalive ? undefined : AbortSignal.timeout(1_500)
      }).then((response) => response.ok).catch(() => false);
    };
    void sendPresence("open").then((opened) => {
      if (opened && readPinnedPreference()) void applyTopmost(true, false);
      else if (opened) setTopmostNote("桌宠按上次设置保持普通窗口；可随时重新置顶。");
    });
    const timer = window.setInterval(() => { void sendPresence("open"); }, 15_000);
    const closePresence = () => { void sendPresence("closing", true); };
    window.addEventListener("pagehide", closePresence);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", closePresence);
      closePresence();
    };
  }, [petSessionId, applyTopmost]);

  const trustedDashboard = useMemo(() => trustworthyDashboard(dashboard, now), [dashboard, now]);
  const hosts = useMemo(() => prioritizeHosts(trustedDashboard.hosts), [trustedDashboard]);
  const priorityHost = hosts[0];
  const focusHost = selectFocusHost(hosts, selectedHostId);
  const priorityFresh = priorityHost ? hostEvidenceIsFresh(dashboard, priorityHost, now) : false;
  const focusFresh = focusHost ? hostEvidenceIsFresh(dashboard, focusHost, now) : false;
  const priorityGuidance = priorityHost ? hostGuidance(priorityHost, priorityFresh) : null;
  const hasNonCurrentHost = dashboard.hosts.some((host) => !hostEvidenceIsFresh(dashboard, host, now));
  const manuallyFocused = Boolean(selectedHostId && focusHost?.id === selectedHostId && priorityHost?.id !== selectedHostId);
  const overallStatus: Status = syncError ? "unknown" : priorityHost?.status ?? "unknown";
  const snapshotTrust = petSnapshotTrust(Boolean(syncError), hasNonCurrentHost, Boolean(dashboard.observedAt));
  const focusReadiness = evidenceReadiness(dashboard, focusHost);
  const batchCoverage = collectionCoverage(dashboard.mode, dashboard.hosts, { practiceMode: dashboard.practiceMode });
  const visibleCounts = trustedDashboard.counts;
  const watchMode = watchModeCopy({
    supported: notificationsSupported,
    blocked: notificationsBlocked,
    enabled: notificationsEnabled,
    calibrated: notificationCalibrated,
    permissionSurface: window.localOpsDesktop ? "windows" : "browser",
    quietUntil,
    now
  });

  useEffect(() => {
    const current = monitorSignal(trustedDashboard, Boolean(syncError));
    const decision = notificationDecision(previousSignal.current, current, {
      enabled: notificationsEnabled,
      permission: desktopNotifications ? "granted" : notificationsSupported ? Notification.permission : "default",
      quietUntil,
      now
    });
    if (decision.notice && decision.outcome !== "none") {
      const notice = decision.notice;
      if (decision.outcome === "suppressed") {
        setAlertReceipt({ outcome: "suppressed", title: notice.title, body: notice.body, at: now });
      } else {
        void deliverSystemNotification(notice.title, { body: notice.body, tag: "localops-status" }, {
          kind: "status",
          critical: current.critical,
          warning: current.warning,
          unknown: current.unknown
        }).then((delivery) => {
          setAlertReceipt({ outcome: delivery.accepted ? "sent" : "failed", title: notice.title, body: notice.body, at: now });
          setNotificationNote(delivery.message);
          if (delivery.browserNotification) {
            delivery.browserNotification.onclick = () => {
              delivery.browserNotification?.close();
              onOpenDesk(priorityHost?.id, "overview", "pet-alert");
            };
          }
        });
      }
    }
    previousSignal.current = current;
  }, [trustedDashboard, syncError, notificationsEnabled, notificationsSupported, desktopNotifications, quietUntil, now, priorityHost?.id, onOpenDesk]);

  useEffect(() => {
    if (!quietUntil || quietUntil > now) return;
    writeQuietPreference(0);
    setQuietUntil(0);
    setNotificationNote("一小时安静期已结束；下一次状态恶化会正常提醒。");
  }, [quietUntil, now]);

  async function toggleNotifications() {
    if (!notificationsSupported) {
      setNotificationNote("当前窗口不支持系统提醒，状态仍会每 30 秒自动同步。");
      return;
    }
    if (notificationsEnabled) {
      writeNotificationPreference(window.localStorage, false);
      writeNotificationCalibration(window.localStorage, false);
      writeQuietPreference(0);
      setQuietUntil(0);
      setNotificationsEnabled(false);
      setNotificationCalibrated(false);
      setNotificationCalibrationPending(false);
      setNotificationNote("异常提醒已关闭，自动同步仍在继续。");
      return;
    }
    const permission = desktopNotifications ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      writeNotificationPreference(window.localStorage, false);
      setNotificationNote(window.localOpsDesktop ? "系统没有允许提醒。可在 Windows 通知设置中重新开启。" : "系统没有允许提醒。可在浏览器的站点权限中重新开启。");
      return;
    }
    const preferenceSaved = writeNotificationPreference(window.localStorage, true);
    writeNotificationCalibration(window.localStorage, false);
    writeQuietPreference(0);
    setQuietUntil(0);
    setNotificationsEnabled(true);
    setNotificationCalibrated(false);
    setNotificationCalibrationPending(false);
    const delivery = await deliverSystemNotification("LocalOps 已开始值守", {
      body: "状态恶化时会提醒你；通知不包含地址、命令或检查证据。",
      tag: "localops-notifications-ready"
    }, { kind: "ready" });
    setNotificationNote(preferenceSaved
      ? `${delivery.message} 请点“测试”并确认看到了，才算校准完成。`
      : `本次已开启提醒，但偏好没有保存；下次打开需重新开启。${delivery.accepted ? " 测试提醒已发出。" : ""}`);
  }

  async function testNotification() {
    if (!notificationsEnabled || notificationTesting) return;
    writeNotificationCalibration(window.localStorage, false);
    setNotificationCalibrated(false);
    setNotificationCalibrationPending(false);
    setNotificationTesting(true);
    try {
      const delivery = await deliverSystemNotification("LocalOps 测试提醒", {
        body: "提醒通道校准中；这条消息不包含服务器身份或检查证据。",
        tag: "localops-notifications-test"
      }, { kind: "test" });
      setNotificationCalibrationPending(delivery.accepted);
      setNotificationNote(delivery.accepted
        ? "测试提醒已交给系统。请按实际情况确认，不确定就选“没看到”。"
        : delivery.message);
    } finally {
      setNotificationTesting(false);
    }
  }

  function confirmNotificationCalibration(seen: boolean) {
    if (!notificationCalibrationPending) return;
    const saved = writeNotificationCalibration(window.localStorage, seen);
    setNotificationCalibrationPending(false);
    setNotificationCalibrated(seen && saved);
    if (!seen) {
      setNotificationNote(saved
        ? "未确认提醒显示。请检查 Windows 通知与专注助手后再测试；状态仍保留在小哨里。"
        : "未确认提醒显示，且浏览器没有保存校准结果；请检查通知设置后再测试。");
      return;
    }
    setNotificationNote(saved
      ? "已确认看到测试提醒；桌面提醒校准完成。"
      : "这次看到了提醒，但校准结果没有保存；请允许本地存储后再测试。");
  }

  function toggleQuietTime() {
    if (!notificationsEnabled) return;
    if (quietUntil > now) {
      const saved = writeQuietPreference(0);
      setQuietUntil(0);
      setNotificationNote(saved ? "异常提醒已恢复。" : "本次已恢复提醒，但浏览器没有保存设置。");
      return;
    }
    const nextQuietUntil = now + petQuietDurationMs;
    const saved = writeQuietPreference(nextQuietUntil);
    setQuietUntil(nextQuietUntil);
    setNotificationNote(saved ? "接下来一小时不弹系统提醒；状态恶化仍会留在桌宠收据中。" : "本次已进入安静期，但浏览器没有保存设置。");
  }

  const headline = syncError
    ? "我和本地服务断开了"
    : dashboard.hosts.length === 0
      ? "还没告诉我要看谁"
      : overallStatus === "healthy"
        ? focusReadiness.state === "http" ? "入口正常" : `${visibleCounts.healthy ?? 0} 台都稳`
        : overallStatus === "critical"
          ? "发现明确故障"
          : overallStatus === "warning"
            ? "有情况要看"
            : "现在还看不清";
  const primaryAction = syncError
    ? "重新连接"
    : dashboard.hosts.length === 0
      ? "去添加服务器"
      : overallStatus === "warning" || overallStatus === "critical"
        ? "查看原因"
        : "帮我看一下";

  function hidePet() {
    if (window.localOpsDesktop?.hidePet) {
      void window.localOpsDesktop.hidePet();
      return;
    }
    window.close();
  }

  return (
    <main className={`pet-window ${overallStatus}`}>
      <div className="pet-window-bar">
        <span className={`pet-runtime ${lifecycle.tone}`} title={lifecycle.detail} aria-label={lifecycle.label}><i aria-hidden="true" /></span>
        <div className="pet-grab" aria-hidden="true" />
        <div className="pet-window-tools">
          <button className={`pet-pin ${topmostActive ? "active" : ""}`} onClick={() => void applyTopmost(!topmostActive)} disabled={!topmostSupported || topmostPending} aria-pressed={topmostActive} title={topmostNote}>
            {topmostActive ? <PinOff size={15} /> : <Pin size={15} />}<span className="sr-only">{topmostActive ? "取消置顶" : "桌面置顶"}</span>
          </button>
          <button className="pet-hide" onClick={hidePet} title="收进系统托盘"><X size={16} /><span className="sr-only">收进系统托盘</span></button>
        </div>
      </div>

      <section className="pet-stage" aria-label={`LocalOps 守护宠物：${headline}`}>
        <div className="pet-speech" aria-live="polite">
          <strong>{headline}</strong>
          <p>{syncError
            ? "服务器没有因此被检查或改动。"
            : dashboard.hosts.length === 0
              ? "添加后，我会定时替你看。"
              : priorityHost && !priorityFresh
                ? "证据过期了，重新看一次才算数。"
                : overallStatus === "healthy"
                  ? focusReadiness.state === "http" ? "网页/API 可达，资源状态还没检查。" : "没有发现问题，我继续替你盯着。"
                  : petIssueLine(priorityHost, priorityFresh, priorityGuidance?.reason)}</p>
        </div>
        <div className={`pet-character ${loading ? "is-listening" : ""}`} aria-hidden="true">
          <img src={sentryOtterUrl} alt="" />
        </div>
      </section>

      {syncError ? (
        <section className="pet-recovery" aria-label="本地状态恢复">
          <strong>{recovery.label}</strong>
          <small>{recovery.detail}</small>
          <details><summary>安全说明</summary><p>{recovery.boundary}</p><em title={syncError}>原因：{syncError}</em></details>
        </section>
      ) : null}

      {actionError ? (
        <section className="pet-action-error" role="alert">
          <AlertTriangle size={15} />
          <span><strong>巡检完成状态未确认</strong><small>{actionError}。上次证据保持不变；先等自动同步，不要连续点击。</small></span>
        </section>
      ) : null}

      <footer className="pet-actions">
        <button className="pet-refresh" onClick={() => syncError
          ? onRetrySync()
          : dashboard.hosts.length === 0
          ? onOpenDesk(undefined, "hosts")
          : (overallStatus === "warning" || overallStatus === "critical") && priorityHost
            ? onOpenDesk(priorityHost.id, "overview")
            : onRefresh()} disabled={loading || syncing}>
          {loading || syncing ? <RefreshCcw className="spin" size={18} /> : syncError ? <RefreshCcw size={18} /> : overallStatus === "healthy" ? <Check size={18} /> : <Server size={18} />}
          {loading ? "我正在看" : syncing ? "正在连接" : primaryAction}
        </button>
      </footer>

      <button className="pet-glance" aria-label="快速查看服务器" aria-expanded={expanded} aria-controls="pet-quick-view" onClick={() => setExpanded((value) => !value)}>
        <span className={`pet-status-dot ${overallStatus}`} />
        <strong>{syncError ? "本地状态断开" : visibleCounts.critical ? `${visibleCounts.critical} 台故障` : visibleCounts.warning ? `${visibleCounts.warning} 台需关注` : visibleCounts.unknown ? `${visibleCounts.unknown} 台待确认` : batchCoverage.partial ? `${batchCoverage.partial} 台仅看入口` : `${visibleCounts.healthy ?? 0} 台正常`}</strong>
        <span>{snapshotTrust.state === "offline" ? "仅保留旧结果" : snapshotTrust.state === "stale" ? "证据已过期" : snapshotTrust.state === "unknown" ? "尚未检查" : `${latestTime(dashboard.observedAt)} 检查`}</span>
        <ChevronDown className={expanded ? "is-expanded" : ""} size={17} />
      </button>

      <div className={`pet-sheet-layer ${expanded ? "open" : ""}`} aria-hidden={!expanded}>
        <button className="pet-sheet-scrim" tabIndex={expanded ? 0 : -1} onClick={() => setExpanded(false)} aria-label="关闭快速查看" />
        <section className="pet-drawer" id="pet-quick-view" aria-label="服务器快速查看">
          <header><strong>服务器</strong><button onClick={() => setExpanded(false)} tabIndex={expanded ? 0 : -1} aria-label="关闭"><X size={17} /></button></header>
          <div className="pet-hosts">
            {hosts.map((host) => {
              const current = hostEvidenceIsFresh(dashboard, host, now);
              return <button className="pet-host-row" key={host.id} disabled={!expanded} aria-current={host.id === focusHost?.id ? "true" : undefined} onClick={() => setSelectedHostId(manualFocusSelection(hosts, host.id))}>
                <span className={`pet-status-dot ${host.status}`} />
                <span><strong>{host.name}</strong><small>{current ? statusCopy[host.status].label : host.lastCheckedAt ? "证据过期" : "等待检查"}</small></span>
                <em>{current && host.memoryPercent != null ? `内存 ${host.memoryPercent}%` : "—"}</em>
              </button>;
            })}
          </div>
          <div className="pet-sheet-actions">
            <button className="pet-open-console" disabled={!expanded} onClick={() => onOpenDesk(focusHost?.id, "overview")}>打开控制台 <ArrowUpRight size={15} /></button>
            <button className="pet-open-settings" disabled={!expanded} onClick={() => onOpenDesk(undefined, "scheduler")}>提醒设置</button>
          </div>
          {(overallStatus === "warning" || overallStatus === "critical") && focusHost ? <button className="pet-discuss" disabled={!expanded} onClick={() => onDiscuss(focusHost.id)}><MessageCircle size={15} />让 Codex 分析</button> : null}
        </section>
      </div>
    </main>
  );
}
