export const petPresenceTtlMs: number;
export function isPetSessionId(value: unknown): value is string;
export function petPresencePath(sessionId: string): string;
export function petModePath(sessionId?: string | null): string;
