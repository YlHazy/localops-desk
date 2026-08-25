import { randomUUID } from "node:crypto";

export const desktopOrigin = "http://127.0.0.1:4317";

export const firstTrayNotice = Object.freeze({
  title: "小哨仍在值守",
  content: "LocalOps 已缩到系统托盘。右键托盘图标可打开控制台，或明确退出本次值守。"
});

export function desktopPetUrl(sessionId = randomUUID()) {
  return `${desktopOrigin}/?mode=pet&session=${encodeURIComponent(sessionId)}&runtime=desktop`;
}

export function desktopDeskUrl(path = "/") {
  const target = new URL(path, desktopOrigin);
  if (target.origin !== desktopOrigin) throw new Error("LocalOps desktop windows only accept the loopback app origin.");
  target.search = "";
  return target.toString();
}

export function safeWindowBounds(value, fallback = { width: 380, height: 760 }) {
  if (!value || typeof value !== "object") return fallback;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite)) return fallback;
  if (width < 320 || width > 900 || height < 520 || height > 1200) return fallback;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function navigationAction(rawUrl) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return "deny";
  }
  if (target.origin === desktopOrigin) return "desk";
  if (target.protocol === "https:" && target.hostname === "chatgpt.com") return "external";
  return "deny";
}

export async function localOpsReady(fetchImpl = fetch) {
  try {
    const request = { signal: AbortSignal.timeout(1_500) };
    const manifestResponse = await fetchImpl(`${desktopOrigin}/api/agent/manifest`, request);
    if (!manifestResponse.ok) return false;
    const manifest = await manifestResponse.json();
    if (manifest?.name !== "LocalOps Desk Agent API" || manifest?.safety?.arbitraryShell !== false) return false;
    const statusResponse = await fetchImpl(`${desktopOrigin}/api/status`, request);
    if (!statusResponse.ok) return false;
    const status = await statusResponse.json();
    return Boolean(status?.counts && Array.isArray(status?.hosts));
  } catch {
    return false;
  }
}
