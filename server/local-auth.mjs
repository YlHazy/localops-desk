import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const LOCAL_API_TOKEN_FILE = "local-api-token";

export function defaultLocalApiTokenPath(environment = process.env) {
  if (environment.LOCALOPS_API_TOKEN_FILE) return environment.LOCALOPS_API_TOKEN_FILE;
  const userDataRoot = environment.LOCALAPPDATA || environment.APPDATA;
  return userDataRoot ? join(userDataRoot, "LocalOps Guardian", LOCAL_API_TOKEN_FILE) : null;
}

function validToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

export function ensureLocalApiToken(dataDir, environment = process.env) {
  const supplied = environment.LOCALOPS_API_TOKEN?.trim();
  if (supplied) {
    if (!validToken(supplied)) throw new Error("LOCALOPS_API_TOKEN must be a 256-bit-or-stronger URL-safe token.");
    return supplied;
  }
  mkdirSync(dataDir, { recursive: true });
  const tokenPath = defaultLocalApiTokenPath(environment) || join(dataDir, LOCAL_API_TOKEN_FILE);
  mkdirSync(dirname(tokenPath), { recursive: true });
  try {
    const existing = readFileSync(tokenPath, "utf8").trim();
    if (!validToken(existing)) throw new Error("Local API token file is invalid.");
    return existing;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const created = randomBytes(32).toString("base64url");
  writeFileSync(tokenPath, `${created}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try { chmodSync(tokenPath, 0o600); } catch { /* Windows uses the owning profile ACL. */ }
  return created;
}

export function bearerHeaders(token) {
  if (!validToken(token)) throw new Error("A valid LocalOps API token is required.");
  return { authorization: `Bearer ${token}` };
}

export function requestHasValidToken(req, expectedToken) {
  const value = req?.headers?.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return false;
  const actual = value.slice(7);
  if (!validToken(actual) || !validToken(expectedToken)) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expectedToken);
  return left.length === right.length && timingSafeEqual(left, right);
}
