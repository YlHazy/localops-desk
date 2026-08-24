export type PetDeskTab = "overview" | "hosts" | "checks" | "scheduler";
export interface PetDeskIntent { hostId: string | null; tab: PetDeskTab | null; source: "pet" | "pet-alert" | null; }
export function petDeskPath(options?: { hostId?: string | null; tab?: PetDeskTab; source?: "pet" | "pet-alert"; revision?: number | null }): string;
export function petDeskIntent(hash: string): PetDeskIntent;
