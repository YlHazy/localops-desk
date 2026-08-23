export const petPresenceTtlMs = 90_000;

export function isPetSessionId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function petPresencePath(sessionId) {
  if (!isPetSessionId(sessionId)) throw new Error("Invalid LocalOps pet session.");
  return `/api/pet-presence/${sessionId}`;
}
