export const petPresenceTtlMs = 90_000;

export function isPetSessionId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function petPresencePath(sessionId) {
  if (!isPetSessionId(sessionId)) throw new Error("Invalid LocalOps pet session.");
  return `/api/pet-presence/${sessionId}`;
}

export function petModePath(sessionId = null, runtimeMode = null) {
  const params = new URLSearchParams({ mode: "pet" });
  if (sessionId != null) {
    if (!isPetSessionId(sessionId)) throw new Error("Invalid LocalOps pet session.");
    params.set("session", sessionId);
  }
  if (runtimeMode != null) {
    if (!isPetSessionId(sessionId) || (runtimeMode !== "owned" && runtimeMode !== "existing")) {
      throw new Error("Invalid LocalOps pet runtime mode.");
    }
    params.set("runtime", runtimeMode);
  }
  return `/?${params}`;
}
