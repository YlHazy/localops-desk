import { isPetSessionId, petPresenceTtlMs } from "../src/pet-presence.mjs";

export class PetPresenceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.httpStatus = 400;
  }
}

export function createPetPresenceTracker({ now = Date.now } = {}) {
  const sessions = new Map();

  function validate(sessionId) {
    if (!isPetSessionId(sessionId)) {
      throw new PetPresenceError("INVALID_PET_SESSION", "Pet session must be a valid UUID.");
    }
  }

  function pruneExpired() {
    const currentTime = now();
    for (const [sessionId, lastSeenAt] of sessions) {
      if (currentTime - lastSeenAt > petPresenceTtlMs) sessions.delete(sessionId);
    }
  }

  return {
    update(sessionId, state) {
      validate(sessionId);
      if (state === "closing") {
        sessions.delete(sessionId);
      } else if (state === "open") {
        sessions.set(sessionId, now());
      } else {
        throw new PetPresenceError("INVALID_PET_PRESENCE", "Pet presence state must be open or closing.");
      }
      return this.read(sessionId);
    },
    read(sessionId) {
      validate(sessionId);
      pruneExpired();
      const lastSeenAt = sessions.get(sessionId);
      if (lastSeenAt == null) {
        return { present: false, lastSeenAt: null };
      }
      return { present: true, lastSeenAt: new Date(lastSeenAt).toISOString() };
    },
    summary() {
      pruneExpired();
      return { present: sessions.size > 0, activeCount: sessions.size };
    }
  };
}
