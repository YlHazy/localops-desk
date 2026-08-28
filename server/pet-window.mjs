import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

export const petWindowTitle = "LocalOps Guardian";

export class PetWindowError extends Error {
  constructor(code, message, httpStatus = 409) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function petWindowCapability(platform = process.platform) {
  return platform === "win32"
    ? { supported: true, message: "可将当前 Edge 桌宠保持在其他窗口上方。" }
    : { supported: false, message: "桌宠置顶目前只支持 Windows Edge 窗口。" };
}

export function petWindowCommand({ root, topmost, platform = process.platform, systemRoot = process.env.SystemRoot } = {}) {
  if (platform !== "win32") throw new PetWindowError("PET_WINDOW_UNSUPPORTED", petWindowCapability(platform).message, 400);
  if (typeof topmost !== "boolean") throw new PetWindowError("PET_WINDOW_INPUT_INVALID", "topmost must be a boolean.", 400);
  if (!systemRoot) throw new PetWindowError("PET_WINDOW_RUNTIME_UNAVAILABLE", "Windows PowerShell path is unavailable.");
  return {
    executable: join(resolve(systemRoot), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(resolve(root), "scripts", "set-pet-topmost.ps1"),
      "-WindowTitle",
      petWindowTitle,
      "-Topmost",
      String(topmost)
    ]
  };
}

export async function setPetWindowTopmost(options, spawnImpl = spawn) {
  const command = petWindowCommand(options);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(command.executable, command.args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", () => rejectPromise(new PetWindowError("PET_WINDOW_RUNTIME_UNAVAILABLE", "无法启动 Windows 置顶辅助程序。")));
    child.once("close", (code) => {
      if (code !== 0) {
        rejectPromise(new PetWindowError("PET_WINDOW_NOT_FOUND", stderr.trim() || "没有找到唯一的 LocalOps Edge 桌宠窗口。"));
        return;
      }
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch {
        rejectPromise(new PetWindowError("PET_WINDOW_RESPONSE_INVALID", "Windows 置顶辅助程序返回了无法识别的结果。"));
        return;
      }
      if (result?.title !== petWindowTitle || result?.topmost !== options.topmost) {
        rejectPromise(new PetWindowError("PET_WINDOW_RESPONSE_INVALID", "Windows 置顶辅助程序没有确认目标状态。"));
        return;
      }
      resolvePromise({ supported: true, topmost: result.topmost, message: result.topmost ? "桌宠已保持在其他窗口上方。" : "桌宠已恢复为普通窗口。" });
    });
  });
}
