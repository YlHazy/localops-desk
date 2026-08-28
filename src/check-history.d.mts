import type { CheckRun, Status } from "./types";

export type CheckHistoryFilter = "all" | "attention" | "healthy" | "automatic";
export const checkHistoryFilters: ReadonlyArray<{ id: CheckHistoryFilter; label: string }>;
export function checkTriggerCopy(trigger: string): { label: string; detail: string };
export function checkKindCopy(kind: string): string;
export function checkScopeCopy(hostScope: string | null): string;
export function checkDecisionCopy(status: Status): string;
export function friendlyCheckSummary(value: string): string;
export function filterChecks(checks: CheckRun[], filter: CheckHistoryFilter): CheckRun[];
export function retainCheckSelection(checks: CheckRun[], previousId: number | null): number | null;
