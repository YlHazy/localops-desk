import { randomUUID } from "node:crypto";

export const desktopOrigin = "http://127.0.0.1:4317";

export function desktopLoopbackOrigin(port = 4317) {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new TypeError("desktop API port must be an integer between 1 and 65535");
  return `http://127.0.0.1:${value}`;
}

export const firstTrayNotice = Object.freeze({
  title: "小哨仍在值守",
  content: "LocalOps 已缩到系统托盘。右键托盘图标可打开控制台，或明确退出本次值守。"
});

function boundedAlertCount(value) {
  if (!Number.isInteger(value) || value < 0 || value > 999) throw new TypeError("desktop alert counts must be integers between 0 and 999");
  return value;
}

export function desktopAlertCopy(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("desktop alert request must be an object");
  const keys = Object.keys(request).sort().join(",");
  if (request.kind === "ready" && keys === "kind") {
    return {
      title: "LocalOps 提醒已就位",
      content: "以后只在状态变差时提醒；不会显示服务器名称、地址、命令或原始证据。",
      iconType: "info"
    };
  }
  if (request.kind === "test" && keys === "kind") {
    return {
      title: "LocalOps 测试提醒",
      content: "提醒通道校准中；这条消息不包含服务器身份或检查证据。",
      iconType: "info"
    };
  }
  if (request.kind !== "status" || keys !== "critical,kind,unknown,warning") throw new TypeError("desktop alert request is not allow-listed");
  const critical = boundedAlertCount(request.critical);
  const warning = boundedAlertCount(request.warning);
  const unknown = boundedAlertCount(request.unknown);
  return {
    title: critical > 0 ? "LocalOps 发现故障" : warning > 0 ? "LocalOps 需要关注" : "LocalOps 需要重新确认",
    content: `故障 ${critical} · 关注 ${warning} · 待确认 ${unknown}。打开小哨查看证据。`,
    iconType: critical > 0 ? "error" : warning > 0 ? "warning" : "info"
  };
}

export function desktopPetUrl(sessionId = randomUUID(), port = 4317) {
  return `${desktopLoopbackOrigin(port)}/?mode=pet&session=${encodeURIComponent(sessionId)}&runtime=desktop`;
}

export function desktopDeskUrl(path = "/", port = 4317) {
  const origin = desktopLoopbackOrigin(port);
  const target = new URL(path, origin);
  if (target.origin !== origin) throw new Error("LocalOps desktop windows only accept the selected loopback app origin.");
  target.search = "";
  return target.toString();
}

export function safeWindowBounds(value, fallback = { width: 360, height: 420 }) {
  if (!value || typeof value !== "object") return fallback;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return fallback;
  if (width < 320 || width > 420 || height < 400 || height > 560) return fallback;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function navigationAction(rawUrl, port = 4317) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return "deny";
  }
  if (target.origin === desktopLoopbackOrigin(port)) return "desk";
  if (target.protocol === "https:" && target.hostname === "chatgpt.com") return "external";
  return "deny";
}

export async function localOpsReady(fetchImpl = fetch, port = 4317) {
  try {
    const origin = desktopLoopbackOrigin(port);
    const request = { signal: AbortSignal.timeout(1_500) };
    const manifestResponse = await fetchImpl(`${origin}/api/agent/manifest`, request);
    if (!manifestResponse.ok) return false;
    const manifest = await manifestResponse.json();
    if (manifest?.name !== "LocalOps Desk Agent API" || manifest?.safety?.arbitraryShell !== false) return false;
    const statusResponse = await fetchImpl(`${origin}/api/status`, request);
    if (!statusResponse.ok) return false;
    const status = await statusResponse.json();
    return Boolean(status?.counts && Array.isArray(status?.hosts));
  } catch {
    return false;
  }
}
