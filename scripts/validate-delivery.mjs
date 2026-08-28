import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PET_WIDTH = 1536;
const PET_HEIGHT = 1872;
const PET_MAX_BYTES = 20 * 1024 * 1024;

export function validateDelivery(root = projectRoot) {
  const errors = [];
  validatePlugin(root, errors);
  validateMarketplace(root, errors);
  validatePetDirectory(root, errors);
  validatePrivateIdentity(root, errors);
  return { ok: errors.length === 0, errors };
}

export function scanPrivateIdentityText(text, privateMarkers = []) {
  const normalized = String(text).toLowerCase();
  const rules = privateMarkers
    .map((value, index) => [`private marker ${index + 1}`, String(value).trim().toLowerCase()])
    .filter(([, value]) => value.length >= 4);
  return rules.filter(([, needle]) => normalized.includes(needle)).map(([label]) => label);
}

export function inspectPetPng(bytes, fileSize = bytes.length) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) throw new Error("PET_PNG_INVALID: invalid PNG signature");
  if (bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("PET_PNG_INVALID: IHDR must be first");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  let hasTransparency = colorType === 4 || colorType === 6;
  let hasImageData = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("PET_PNG_INVALID: truncated PNG chunk");
    if (type === "tRNS") hasTransparency = true;
    if (type === "IDAT") hasImageData = true;
    offset = end;
    if (type === "IEND") break;
  }
  const errors = [];
  if (width !== PET_WIDTH || height !== PET_HEIGHT) errors.push(`expected ${PET_WIDTH}x${PET_HEIGHT}, received ${width}x${height}`);
  if (!hasTransparency) errors.push("PNG has no alpha channel or tRNS transparency");
  if (!hasImageData) errors.push("PNG has no IDAT image data");
  if (fileSize > PET_MAX_BYTES) errors.push(`file exceeds ${PET_MAX_BYTES} bytes`);
  return { ok: errors.length === 0, width, height, hasTransparency, fileSize, errors };
}

function validatePlugin(root, errors) {
  const pluginRoot = join(root, "plugins", "localops-guardian");
  const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = readJson(manifestPath, errors);
  if (!manifest) return;
  if (manifest.name !== "localops-guardian") errors.push("plugin name must be localops-guardian");
  for (const capability of ["Interactive", "Read", "Write"]) {
    if (!manifest.interface?.capabilities?.includes(capability)) errors.push(`plugin capability is missing: ${capability}`);
  }
  for (const [label, value] of [["skills", manifest.skills], ["composerIcon", manifest.interface?.composerIcon], ["mcpServers", manifest.mcpServers]]) {
    const target = resolveReference(pluginRoot, value, `${label} reference`, errors);
    if (target && !existsSync(target)) errors.push(`${label} reference does not exist: ${value}`);
  }
  const mcpPath = resolveReference(pluginRoot, manifest.mcpServers, "mcpServers reference", errors);
  if (!mcpPath || !existsSync(mcpPath)) return;
  const config = readJson(mcpPath, errors);
  const servers = config?.mcpServers ?? config?.mcp_servers ?? config;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    errors.push("MCP config must contain a server map");
    return;
  }
  for (const [name, server] of Object.entries(servers)) {
    if (server.command !== "node") errors.push(`MCP server ${name} must use the node command`);
    if (server.cwd !== ".") errors.push(`MCP server ${name} cwd must be '.'`);
    if (!Number.isFinite(server.tool_timeout_sec) || server.tool_timeout_sec < 1 || server.tool_timeout_sec > 60) errors.push(`MCP server ${name} timeout must be between 1 and 60 seconds`);
    if (!Array.isArray(server.args) || server.args.length !== 1) {
      errors.push(`MCP server ${name} must declare one script argument`);
    } else {
      const script = resolveReference(pluginRoot, server.args[0], `MCP server ${name} script`, errors);
      if (script && (!existsSync(script) || extname(script) !== ".mjs")) errors.push(`MCP server ${name} script must be an existing .mjs file`);
    }
    const allowedEnv = new Set(["LOCALOPS_URL", "LOCALOPS_API_TOKEN", "LOCALOPS_API_TOKEN_FILE"]);
    const unexpectedEnv = (server.env_vars ?? []).filter((value) => !allowedEnv.has(value));
    if (unexpectedEnv.length > 0) errors.push(`MCP server ${name} has unexpected env vars: ${unexpectedEnv.join(", ")}`);
    for (const requiredEnv of ["LOCALOPS_API_TOKEN", "LOCALOPS_API_TOKEN_FILE"]) {
      if (!server.env_vars?.includes(requiredEnv)) errors.push(`MCP server ${name} must declare ${requiredEnv} to avoid unauthenticated cached installs`);
    }
  }
}

function validateMarketplace(root, errors) {
  const marketplace = readJson(join(root, ".agents", "plugins", "marketplace.json"), errors);
  const entry = marketplace?.plugins?.find((plugin) => plugin.name === "localops-guardian");
  if (!entry) {
    errors.push("marketplace is missing localops-guardian");
    return;
  }
  if (entry.source?.source !== "local" || entry.source?.path !== "./plugins/localops-guardian") errors.push("marketplace plugin source must use the repo-local plugin path");
  if (entry.policy?.authentication !== "ON_INSTALL") errors.push("marketplace authentication policy must be ON_INSTALL");
}

function validatePetDirectory(root, errors) {
  const petRoot = join(root, "pets");
  if (!existsSync(petRoot)) return;
  for (const entry of readdirSync(petRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (![".png", ".webp"].includes(extension)) continue;
    const path = join(petRoot, entry.name);
    if (extension === ".webp") {
      errors.push(`${entry.name}: installable WebP validation is not implemented; use transparent PNG for this repository gate`);
      continue;
    }
    try {
      const result = inspectPetPng(readFileSync(path), statSync(path).size);
      for (const error of result.errors) errors.push(`${entry.name}: ${error}`);
    } catch (error) {
      errors.push(`${entry.name}: ${error.message}`);
    }
  }
}

function validatePrivateIdentity(root, errors) {
  const skippedDirectories = new Set([".git", ".npm-cache", "artifacts", "data", "dist", "node_modules", "release", "work"]);
  const allowedExtensions = new Set([".example", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".yaml", ".yml"]);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name) && entry.name !== "generated-images") visit(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || entry.name === "package-lock.json" || !allowedExtensions.has(extname(entry.name).toLowerCase())) continue;
      const path = join(directory, entry.name);
      const privateMarkers = String(process.env.LOCALOPS_PRIVATE_MARKERS || "").split(";").filter(Boolean);
      const matches = scanPrivateIdentityText(readFileSync(path, "utf8"), privateMarkers);
      for (const match of matches) errors.push(`${relative(root, path)} contains a private identity marker: ${match}`);
    }
  };
  visit(root);
}

function resolveReference(root, value, label, errors) {
  if (typeof value !== "string" || !value) {
    errors.push(`${label} must be a non-empty relative path`);
    return null;
  }
  if (isAbsolute(value)) {
    errors.push(`${label} must not be absolute`);
    return null;
  }
  const target = resolve(root, value);
  if (relative(root, target).startsWith("..")) {
    errors.push(`${label} escapes the plugin directory`);
    return null;
  }
  return target;
}

function readJson(path, errors) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    errors.push(`${relative(projectRoot, path)} is invalid or unreadable: ${error.message}`);
    return null;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateDelivery();
  if (!result.ok) {
    for (const error of result.errors) console.error(`delivery error: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("LocalOps plugin and pet delivery checks passed.");
  }
}
