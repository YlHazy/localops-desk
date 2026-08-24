import { isPetSessionId } from "./pet-presence.mjs";

const runtimeModes = new Set(["owned", "existing"]);

export function petRuntimeMode(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const sessionId = params.get("session");
  if (!isPetSessionId(sessionId)) return "preview";
  const runtime = params.get("runtime");
  return runtimeModes.has(runtime) ? runtime : "unknown";
}

export function petLifecycleCopy(mode) {
  if (mode === "owned") {
    return { label: "随窗值守", detail: "关闭桌宠后，它启动的本地值守约 10 秒内结束。", tone: "attached" };
  }
  if (mode === "existing") {
    return { label: "独立服务", detail: "关闭桌宠只关闭窗口；已有 LocalOps 服务继续运行。", tone: "independent" };
  }
  if (mode === "preview") {
    return { label: "界面预览", detail: "请从 Windows 启动器打开，才能确认桌面值守生命周期。", tone: "preview" };
  }
  return { label: "运行方式待确认", detail: "当前链接没有足够信息判断关闭窗口后的行为。", tone: "unknown" };
}
