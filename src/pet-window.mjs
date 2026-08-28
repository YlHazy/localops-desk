import { isPetSessionId } from "./pet-presence.mjs";

const preferenceKey = "localops.pet.topmost";

export function readTopmostPreference(storage) {
  try {
    return storage.getItem(preferenceKey) !== "0";
  } catch {
    return true;
  }
}

export function writeTopmostPreference(storage, enabled) {
  try {
    storage.setItem(preferenceKey, enabled ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

export async function requestPetWindowTopmost(sessionId, topmost, fetchImpl = fetch, desktopBridge = globalThis.window?.localOpsDesktop) {
  if (!isPetSessionId(sessionId)) throw new Error("只有 LocalOps 桌面宿主或 Windows 启动器打开的桌宠才能切换置顶。");
  if (typeof topmost !== "boolean") throw new Error("Invalid LocalOps pet window state.");
  if (desktopBridge?.setAlwaysOnTop) {
    const state = await desktopBridge.setAlwaysOnTop(topmost);
    if (state?.topmost !== topmost) throw new Error("桌面宿主没有确认置顶状态。");
    return state;
  }
  const response = await fetchImpl(`/api/pet-window/${sessionId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topmost }),
    signal: AbortSignal.timeout(5_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "桌宠窗口置顶没有成功。");
  if (payload?.window?.topmost !== topmost) throw new Error("桌宠窗口没有确认置顶状态。");
  return payload.window;
}
