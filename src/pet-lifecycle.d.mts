export type PetRuntimeMode = "owned" | "existing" | "preview" | "unknown";
export function petRuntimeMode(search: string): PetRuntimeMode;
export function petLifecycleCopy(mode: PetRuntimeMode): { label: string; detail: string; tone: "attached" | "independent" | "preview" | "unknown" };
