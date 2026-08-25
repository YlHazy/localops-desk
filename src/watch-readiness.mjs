export function watchReadiness({ coverage, schedulerEnabled, desktopRuntime, notificationsEnabled }) {
  const evidenceReady = coverage.collectible > 0;
  const rhythmReady = evidenceReady && schedulerEnabled;
  const attentionReady = desktopRuntime && notificationsEnabled;
  const items = [
    {
      key: "evidence",
      label: "证据来源",
      ready: evidenceReady,
      tone: evidenceReady ? coverage.blocked > 0 ? "attention" : "ready" : "blocked",
      detail: evidenceReady
        ? `${coverage.collectible} / ${coverage.total} 台可取得当前证据${coverage.blocked ? `，${coverage.blocked} 台仍会跳过` : ""}`
        : "还没有可采集对象；系统不会把未知误判成正常。",
      actionLabel: evidenceReady ? "查看来源" : "补充来源"
    },
    {
      key: "rhythm",
      label: "自动节奏",
      ready: rhythmReady,
      tone: !evidenceReady ? "blocked" : rhythmReady ? "ready" : "waiting",
      detail: !evidenceReady
        ? "先完成证据来源，再决定检查频率。"
        : schedulerEnabled ? "本地程序运行时会按已保存频率巡检。" : "当前仍依赖手动刷新，关闭页面后不会自动检查。",
      actionLabel: schedulerEnabled ? "调整频率" : "设置频率"
    },
    {
      key: "attention",
      label: "桌面提醒",
      ready: attentionReady,
      tone: attentionReady ? "ready" : desktopRuntime ? "waiting" : "preview",
      detail: !desktopRuntime
        ? "当前是浏览器预览；原生托盘提醒只在桌面版可校准。"
        : notificationsEnabled ? "桌宠已记录提醒偏好；状态变差才通知。" : "打开桌宠校准提醒，稳定异常不会重复打扰。",
      actionLabel: desktopRuntime ? "打开桌宠校准" : "预览桌宠"
    }
  ];
  const readyCount = items.filter((item) => item.ready).length;
  const next = items.find((item) => !item.ready) ?? null;
  return {
    readyCount,
    total: items.length,
    complete: readyCount === items.length,
    headline: readyCount === items.length ? "日常值守链路已接通" : `下一步：${next.label}`,
    detail: readyCount === items.length
      ? "证据、自动巡检与桌面提醒已经形成接力。"
      : "按顺序补齐即可；查看设置本身不会连接服务器。",
    items
  };
}
