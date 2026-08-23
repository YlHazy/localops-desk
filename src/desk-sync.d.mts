export type DeskSyncState = "idle" | "syncing" | "current" | "offline";

export interface DeskSyncCopy {
  label: string;
  detail: string;
}

export interface SchedulerDraft {
  enabled: boolean;
  lightIntervalMinutes: number;
  retentionDays: number;
}

export interface DeskSnapshot {
  status: import("./types").DashboardStatus;
  checks: import("./types").CheckRun[];
  report: string;
  scheduler: import("./types").SchedulerState;
  startup: import("./types").StartupState;
}

export type DeskReadRequest = <T>(path: string) => Promise<T>;

export function deskSyncCopy(state: DeskSyncState, lastSyncedAt: number | null, now?: number): DeskSyncCopy;
export function fetchDeskSnapshot(request: DeskReadRequest): Promise<DeskSnapshot>;
export function schedulerDraftAfterSync(currentDraft: SchedulerDraft, scheduler: import("./types").SchedulerState, preserveDraft: boolean): SchedulerDraft;
