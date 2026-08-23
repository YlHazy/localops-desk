import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const entryName = "LocalOps Guardian.vbs";
const marker = "' LocalOps Guardian managed startup entry v1";

export class StartupEntryError extends Error {
  constructor(code, message, httpStatus = 409) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function safeVbsString(value, field) {
  const text = String(value);
  if (!text || /[\0\r\n]/.test(text)) {
    throw new StartupEntryError("STARTUP_PATH_INVALID", `${field} contains unsupported characters.`, 400);
  }
  return text.replaceAll('"', '""');
}

export function startupDirectory(environment = process.env) {
  if (environment.LOCALOPS_STARTUP_DIR) return resolve(environment.LOCALOPS_STARTUP_DIR);
  if (!environment.APPDATA) {
    throw new StartupEntryError("STARTUP_DIRECTORY_UNAVAILABLE", "Windows current-user Startup directory is unavailable.", 400);
  }
  return join(resolve(environment.APPDATA), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

export function startupEntryContent({ root, nodePath = process.execPath }) {
  const safeRoot = safeVbsString(resolve(root), "LocalOps root");
  const safeNode = safeVbsString(resolve(nodePath), "Node executable");
  const safeLauncher = safeVbsString(join(resolve(root), "scripts", "launch-pet.mjs"), "pet launcher");
  return [
    marker,
    "Option Explicit",
    "Dim shell",
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = "${safeRoot}"`,
    `shell.Run Chr(34) & "${safeNode}" & Chr(34) & " " & Chr(34) & "${safeLauncher}" & Chr(34), 0, False`,
    ""
  ].join("\r\n");
}

function encodeVbs(content) {
  return Buffer.from(`\uFEFF${content}`, "utf16le");
}

function decodeVbs(buffer) {
  const content = buffer.toString("utf16le");
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

async function accessible(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function browserCandidates(environment) {
  return [
    environment.LOCALOPS_BROWSER_PATH,
    environment["PROGRAMFILES(X86)"] ? join(environment["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe") : null,
    environment.PROGRAMFILES ? join(environment.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe") : null,
    environment.LOCALAPPDATA ? join(environment.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe") : null
  ].filter(Boolean);
}

export async function startupEntrySnapshot({
  root,
  environment = process.env,
  nodePath = process.execPath,
  platform = process.platform
}) {
  if (platform !== "win32") {
    return {
      supported: false,
      enabled: false,
      status: "unsupported",
      ready: false,
      blockers: ["当前仅支持 Windows 用户登录启动"],
      message: "当前系统不支持登录后启动。"
    };
  }
  const directory = startupDirectory(environment);
  const entryPath = join(directory, entryName);
  const expected = startupEntryContent({ root, nodePath });
  const blockers = [];
  if (!await accessible(join(resolve(root), "dist", "index.html"))) blockers.push("生产构建尚未生成");
  if (!await accessible(join(resolve(root), "scripts", "launch-pet.mjs"))) blockers.push("桌宠启动脚本不可用");
  if (!await accessible(nodePath)) blockers.push("当前 Node 可执行文件不可用");
  const browserChecks = await Promise.all(browserCandidates(environment).map((candidate) => accessible(candidate)));
  if (!browserChecks.some(Boolean)) blockers.push("未找到 Microsoft Edge");

  let status = "not-installed";
  try {
    const actual = decodeVbs(await readFile(entryPath));
    status = actual === expected ? "managed" : "conflict";
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const enabled = status === "managed";
  const message = status === "conflict"
    ? "发现同名但不属于当前 LocalOps 的启动项，已拒绝覆盖。"
    : enabled
      ? "登录 Windows 后会自动打开桌宠；关闭桌宠会停止本次值守。"
      : blockers.length
        ? `暂时不能开启：${blockers.join("；")}。`
        : "尚未开启登录后自动值守。";
  return {
    supported: true,
    enabled,
    status,
    ready: blockers.length === 0 && status !== "conflict",
    blockers,
    message,
    directory,
    entryPath,
    expected
  };
}

export async function configureStartupEntry(options, enabled) {
  const snapshot = await startupEntrySnapshot(options);
  if (!snapshot.supported) {
    throw new StartupEntryError("STARTUP_UNSUPPORTED", snapshot.message, 400);
  }
  if (snapshot.status === "conflict") {
    throw new StartupEntryError("STARTUP_ENTRY_CONFLICT", snapshot.message);
  }
  if (enabled) {
    if (!snapshot.ready) {
      throw new StartupEntryError("STARTUP_NOT_READY", snapshot.message);
    }
    if (!snapshot.enabled) {
      await mkdir(snapshot.directory, { recursive: true });
      try {
        await writeFile(snapshot.entryPath, encodeVbs(snapshot.expected), { flag: "wx" });
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new StartupEntryError("STARTUP_ENTRY_CONFLICT", "启动项刚刚发生变化，已拒绝覆盖；请刷新后重试。");
        }
        throw error;
      }
    }
  } else if (snapshot.enabled) {
    const current = decodeVbs(await readFile(snapshot.entryPath));
    if (current !== snapshot.expected) {
      throw new StartupEntryError("STARTUP_ENTRY_CONFLICT", "启动项刚刚发生变化，已拒绝删除；请刷新后检查。");
    }
    await unlink(snapshot.entryPath);
  }
  return startupEntrySnapshot(options);
}

export function publicStartupState(snapshot) {
  return {
    supported: snapshot.supported,
    enabled: snapshot.enabled,
    status: snapshot.status,
    ready: snapshot.ready,
    blockers: snapshot.blockers,
    message: snapshot.message
  };
}
