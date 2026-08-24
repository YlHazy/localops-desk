export function readTopmostPreference(storage: Pick<Storage, "getItem">): boolean;
export function writeTopmostPreference(storage: Pick<Storage, "setItem">, enabled: boolean): boolean;
export function requestPetWindowTopmost(sessionId: string | null, topmost: boolean, fetchImpl?: typeof fetch): Promise<{ supported: boolean; topmost: boolean; message: string }>;
