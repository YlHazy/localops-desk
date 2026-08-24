import { worseningNotice } from "./pet-monitor.mjs";

export const petQuietDurationMs = 60 * 60 * 1000;

export function notificationDecision(previous, current, { enabled, permission, quietUntil = 0, now = Date.now() }) {
  const notice = worseningNotice(previous, current);
  if (!notice || !enabled || permission !== "granted") return { outcome: "none", notice: null };
  if (quietUntil > now) return { outcome: "suppressed", notice };
  return { outcome: "sent", notice };
}

export function watchModeCopy({ supported, blocked, enabled, quietUntil = 0, now = Date.now() }) {
  if (!supported) return { label: "当前窗口不支持提醒", detail: "仍会每 30 秒同步本地状态", state: "unsupported" };
  if (blocked) return { label: "系统提醒已阻止", detail: "在 Edge 站点权限中重新允许", state: "blocked" };
  if (!enabled) return { label: "开启异常提醒", detail: "只显示状态数量，不显示服务器身份", state: "off" };
  if (quietUntil > now) {
    const minutes = Math.max(1, Math.ceil((quietUntil - now) / 60_000));
    return { label: "提醒暂时安静", detail: `${minutes} 分钟后自动恢复；状态仍在同步`, state: "quiet" };
  }
  return { label: "异常提醒已开", detail: "状态恶化才提醒；稳定异常不会重复打扰", state: "active" };
}

export function readQuietUntil(storage, now = Date.now()) {
  try {
    const value = Number(storage.getItem("localops.pet.quietUntil"));
    return Number.isFinite(value) && value > now ? value : 0;
  } catch {
    return 0;
  }
}

export function writeQuietUntil(storage, value) {
  try {
    if (value > 0) storage.setItem("localops.pet.quietUntil", String(Math.trunc(value)));
    else storage.removeItem("localops.pet.quietUntil");
    return true;
  } catch {
    return false;
  }
}
